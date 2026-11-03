package dev.slash3rss.slashclient.hud.replay;

import com.mojang.blaze3d.platform.NativeImage;
//#if MC >= 26.3
import com.mojang.renderpearl.api.buffers.GpuBuffer;
//#elif MC >= 1.21.6
//$ import com.mojang.blaze3d.buffers.GpuBuffer;
//#endif
import com.mojang.blaze3d.systems.RenderSystem;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.modules.SessionStats;

/**
 * Clips, like ShadowPlay: while on, the game keeps the last seconds of what is on screen (20, 30 or
 * 60 frames a second and at most 480p to 1440p wide or the window's own size, as the player set, as
 * JPEG in memory) and a key saves them as a video
 * in clips/ next to screenshots. Frames are copied after the whole frame is drawn (the world and
 * the HUD) and squeezed on a background thread, so the game itself waits for nothing.
 */
public final class Clips {
	private Clips() {}

	/** Frames on their way to the background thread; more and the new ones are skipped. */
	private static final int IN_FLIGHT = 4;

	/** Time between two frames, at the frames a second set. */
	private static long frameNs() {
		int fps = SlashHud.config.clipFps;
		return 1_000_000_000L / (fps == 20 || fps == 60 ? fps : 30);
	}

	/** The widest frame kept, by the resolution set (0: the window's own). */
	static int maxWidth() {
		return switch (SlashHud.config.clipResolution) {
			case "480p" -> 854;
			case "1080p" -> 1920;
			case "1440p" -> 2560;
			case "native" -> 0;
			default -> 1280;
		};
	}
	public static KeyMapping key;

	/** One frame in memory: a JPEG, its size and when it was taken (System.nanoTime). */
	record Frame(byte[] jpeg, int width, int height, long at) {}

	private static final ArrayDeque<Frame> frames = new ArrayDeque<>();
	private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "SlashClient clips");
		t.setDaemon(true);
		t.setPriority(Thread.MIN_PRIORITY);
		return t;
	});
	private static final AtomicInteger inFlight = new AtomicInteger();
	private static long lastFrame;
	private static boolean lostWarned, failWarned;
	private static volatile boolean saving;

	public static boolean enabled() {
		return SlashHud.config.clips;
	}

	/** Frames are taken while clips or the instant replay (Replay) are on: one buffer for both. */
	static boolean capturing() {
		return SlashHud.config.clips || SlashHud.config.replay;
	}

	/** Seconds in memory right now (for the settings card). */
	public static double bufferedSeconds() {
		synchronized (frames) {
			return frames.isEmpty() ? 0 : (frames.getLast().at() - frames.getFirst().at()) / 1e9;
		}
	}

	/** After every drawn frame (GameRenderer.render): takes one, at most 30 a second. */
	public static void afterFrame(Minecraft mc) {
		if (!capturing() || mc.level == null) {
			if (!frames.isEmpty() && !capturing()) synchronized (frames) {
				frames.clear();
			}
			return;
		}
		long now = System.nanoTime();
		// frames asked for but never handed back (another mod in the way of the game's own grab): after
		// a second and a half without one the count starts over, or no frame would be taken again
		if (inFlight.get() >= IN_FLIGHT && now - lastFrame > 1_500_000_000L) {
			if (!lostWarned) SlashHud.LOG.warn("SlashClient clips: frames were not handed back, starting over");
			lostWarned = true;
			inFlight.set(0);
		}
		if (now - lastFrame < frameNs() || inFlight.get() >= IN_FLIGHT) return;
		// the replay viewer itself is not recorded
		if (Compat.screen(mc) instanceof ReplayScreen) return;
		lastFrame = now;
		var target = Compat.mainTarget(mc);
		// at most as wide as set, by a whole step: at 720p a 1920 window is halved, a 4K one a third
		int max = maxWidth();
		int scale = max <= 0 ? 1 : Math.max(1, (int) Math.ceil(mc.getWindow().getWidth() / (double) max));
		// the game's own smaller grab needs a window whose size divides by the step (1920x1017 does not by 2):
		// otherwise the whole frame is grabbed and shrunk while it is encoded
		int grab = target.width % scale == 0 && target.height % scale == 0 ? scale : 1;
		inFlight.incrementAndGet();
		try {
			//#if MC >= 1.21.6
			if (!readBack(target, now, scale)) Screenshot.takeScreenshot(target, grab, image -> WORKER.execute(() -> encode(image, now, scale / grab)));
			//#elif MC >= 1.21.5
			//$ // no downscaled grab before 1.21.6: the frame is shrunk while it is encoded
			//$ Screenshot.takeScreenshot(target, image -> WORKER.execute(() -> encode(image, now, scale)));
			//#elif MC >= 1.21.2
			//$ NativeImage image = Screenshot.takeScreenshot(target);
			//$ WORKER.execute(() -> encode(image, now, scale));
			//#else
			//$ Screenshot.takeScreenshot(target, grab, image -> WORKER.execute(() -> encode(image, now, scale / grab)));
			//#endif
		} catch (RuntimeException e) {
			inFlight.updateAndGet(n -> Math.max(0, n - 1));
			failed(e);
		}
	}

	/** A frame that could not be taken: said in the log once (then every time only for debugging), so a clip that stays empty can be traced. */
	private static void failed(Exception e) {
		if (!failWarned) SlashHud.LOG.warn("SlashClient clips: a frame could not be taken", e);
		else SlashHud.LOG.debug("SlashClient clips: {}", e.toString());
		failWarned = true;
	}

	/** Byte arrays of frames already squeezed, used again so 30 frames a second do not leave megabytes of garbage each. */
	private static final ConcurrentLinkedQueue<byte[]> spare = new ConcurrentLinkedQueue<>();

	private static byte[] borrow(int size) {
		for (byte[] b; (b = spare.poll()) != null; ) if (b.length == size) return b;
		return new byte[size];
	}

	private static void giveBack(byte[] b) {
		if (spare.size() < IN_FLIGHT) spare.offer(b);
	}

	//#if MC >= 1.21.6
	/**
	 * Copies the frame off the graphics card without the game's own grab: that one reads and averages
	 * every pixel on the render thread once the copy arrives (and makes a full-size picture when the
	 * window does not divide by the step), several milliseconds of every frame at 30 a second. Here the
	 * render thread only copies the raw bytes in one go and the background thread shrinks them, the same
	 * way the game does. False when the frame is in a format we do not read (the game's grab then does it).
	 */
	private static boolean readBack(com.mojang.blaze3d.pipeline.RenderTarget target, long at, int scale) {
		var texture = target.getColorTexture();
		if (texture == null) return false;
		//#if MC >= 26.2
		int pixel = texture.getFormat().blockSize();
		//#else
		//$ int pixel = texture.getFormat().pixelSize();
		//#endif
		if (pixel != 4) return false;
		int w = target.width, h = target.height, size = w * h * 4;
		var device = RenderSystem.getDevice();
		var encoder = device.createCommandEncoder();
		GpuBuffer buffer = device.createBuffer(() -> "SlashClient clip frame", GpuBuffer.USAGE_MAP_READ | GpuBuffer.USAGE_COPY_DST, size);
		try {
			encoder.copyTextureToBuffer(texture, buffer, 0, () -> {
				byte[] pixels = null;
				try {
					//#if MC >= 26.2
					try (var view = buffer.map(true, false)) {
					//#else
					//$ try (var view = encoder.mapBuffer(buffer, true, false)) {
					//#endif
						pixels = borrow(size);
						view.data().get(0, pixels, 0, size);
					}
				} catch (RuntimeException e) {
					if (pixels != null) giveBack(pixels);
					pixels = null;
					inFlight.updateAndGet(n -> Math.max(0, n - 1));
					failed(e);
				} finally {
					buffer.close();
				}
				byte[] got = pixels;
				if (got != null) WORKER.execute(() -> encode(got, w, h, at, scale));
			}, 0);
		} catch (RuntimeException e) {
			buffer.close();
			throw e;
		}
		return true;
	}
	//#endif

	/**
	 * Squeezes a raw frame from the graphics card (RGBA bytes, bottom row first) to JPEG, each pixel
	 * the average of a `step` by `step` square, as the game's own smaller grab makes it.
	 */
	private static void encode(byte[] pixels, int width, int height, long at, int step) {
		try {
			int w = (width / step) & ~1, h = (height / step) & ~1, rows = height / step, n = step * step;
			BufferedImage rgb = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
			int[] row = new int[w];
			for (int y = 0; y < h; y++) {
				// the picture's top is the texture's last row
				int from = (rows - 1 - y) * step;
				for (int x = 0; x < w; x++) {
					int r = 0, g = 0, b = 0;
					for (int dy = 0; dy < step; dy++) {
						int i = ((from + dy) * width + x * step) * 4;
						for (int dx = 0; dx < step; dx++, i += 4) {
							r += pixels[i] & 255;
							g += pixels[i + 1] & 255;
							b += pixels[i + 2] & 255;
						}
					}
					row[x] = (r / n) << 16 | (g / n) << 8 | b / n;
				}
				rgb.setRGB(0, y, w, 1, row, 0, w);
			}
			giveBack(pixels);
			keep(rgb, w, h, at);
		} catch (Exception e) {
			failed(e);
		} finally {
			inFlight.updateAndGet(n -> Math.max(0, n - 1));
		}
	}

	/** Squeezes a frame to JPEG, taking every `step`-th pixel (1 = all). */
	private static void encode(NativeImage image, long at, int step) {
		try (image) {
			int w = (image.getWidth() / step) & ~1, h = (image.getHeight() / step) & ~1;
			BufferedImage rgb = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
			int[] row = new int[w];
			for (int y = 0; y < h; y++) {
				for (int x = 0; x < w; x++) row[x] = image.getPixel(x * step, y * step);
				rgb.setRGB(0, y, w, 1, row, 0, w);
			}
			keep(rgb, w, h, at);
		} catch (Exception e) {
			failed(e);
		} finally {
			inFlight.updateAndGet(n -> Math.max(0, n - 1));
		}
	}

	/** The squeezed frame into the buffer, the oldest beyond the seconds kept dropped. */
	private static void keep(BufferedImage rgb, int w, int h, long at) throws java.io.IOException {
		byte[] jpeg = jpeg(rgb);
		long keep = Math.max(SlashHud.config.clips ? SlashHud.config.clipSeconds : 0, Replay.seconds()) * 1_000_000_000L;
		synchronized (frames) {
			// switched off while this frame was on its way
			if (!capturing()) return;
			frames.addLast(new Frame(jpeg, w, h, at));
			while (!frames.isEmpty() && at - frames.getFirst().at() > keep) frames.removeFirst();
		}
	}

	static byte[] jpeg(BufferedImage image) throws java.io.IOException {
		ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
		ByteArrayOutputStream out = new ByteArrayOutputStream(96 * 1024);
		try (MemoryCacheImageOutputStream stream = new MemoryCacheImageOutputStream(out)) {
			writer.setOutput(stream);
			ImageWriteParam param = writer.getDefaultWriteParam();
			param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
			param.setCompressionQuality(0.78f);
			writer.write(null, new IIOImage(image, null, null), param);
		} finally {
			writer.dispose();
		}
		return out.toByteArray();
	}

	public static void tick(Minecraft mc) {
		if (key == null) return;
		while (key.consumeClick()) save(mc);
	}

	/** Saves what is in memory as clips/clip-<date>.avi and says so. */
	public static void save(Minecraft mc) {
		if (!enabled()) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.clips.off"));
			return;
		}
		if (saving) return;
		// the buffer may hold more for the instant replay: the clip is its own length
		List<Frame> clip = recent(SlashHud.config.clipSeconds);
		if (clip.size() < 10) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.clips.empty"));
			return;
		}
		write(mc, clip, "clip");
	}

	/**
	 * The frames of the last `seconds` (a copy: the buffer goes on without it), only those after
	 * the last change of the window's size (a video has one frame size).
	 */
	static List<Frame> recent(double seconds) {
		List<Frame> list;
		synchronized (frames) {
			list = new ArrayList<>(frames);
		}
		if (list.isEmpty()) return list;
		int cut = 0;
		for (int i = list.size() - 1; i > 0; i--) {
			if (list.get(i - 1).width() != list.getLast().width() || list.get(i - 1).height() != list.getLast().height()) {
				cut = i;
				break;
			}
		}
		long from = list.getLast().at() - (long) (seconds * 1e9);
		while (cut < list.size() - 1 && list.get(cut).at() < from) cut++;
		return new ArrayList<>(list.subList(cut, list.size()));
	}

	/** True while a clip is being written (one at a time). */
	static boolean saving() {
		return saving;
	}

	/** Writes these frames as clips/<prefix>-<date>.avi on a background thread, with a toast when done; the file, or null when not started. */
	static Path write(Minecraft mc, List<Frame> clip, String prefix) {
		if (saving || clip.size() < 2) return null;
		saving = true;
		Path dir = FabricLoader.getInstance().getGameDir().resolve("clips");
		String stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH.mm.ss"));
		Path named = dir.resolve(prefix + "-" + stamp + ".avi");
		// two saves in one second (a range saved twice) do not overwrite each other
		for (int i = 2; Files.exists(named); i++) named = dir.resolve(prefix + "-" + stamp + "-" + i + ".avi");
		Path file = named;
		double seconds = Math.max(0.1, (clip.getLast().at() - clip.getFirst().at()) / 1e9);
		double fps = (clip.size() - 1) / seconds;
		Compat.overlay(mc, Component.translatable("slashclient-hud.clips.saving"));
		Thread.ofVirtual().start(() -> {
			try {
				Files.createDirectories(dir);
				AviWriter.write(file, clip.stream().map(Frame::jpeg).toList(), clip.getLast().width(), clip.getLast().height(), fps);
				mc.execute(SessionStats::clip);
				dev.slash3rss.slashclient.hud.social.Social.toast(Component.translatable("slashclient-hud.clips.saved", Math.round(seconds)).getString(), file.getFileName().toString(), "m-clips");
			} catch (Exception e) {
				SlashHud.LOG.warn("Could not save the clip", e);
				mc.execute(() -> Compat.overlay(mc, Component.translatable("slashclient-hud.clips.failed")));
			} finally {
				saving = false;
			}
		});
		return file;
	}

	/** For the test: frames in memory. */
	public static int bufferedFrames() {
		synchronized (frames) {
			return frames.size();
		}
	}
}
