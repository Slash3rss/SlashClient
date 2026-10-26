package dev.slash3rss.slashclient.hud.replay;

import com.mojang.blaze3d.platform.NativeImage;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.components.toasts.SystemToast;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SessionStats;

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
	private static boolean lostWarned;
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
		inFlight.incrementAndGet();
		try {
			//#if MC >= 1.21.6
			Screenshot.takeScreenshot(target, scale, image -> WORKER.execute(() -> encode(image, now, 1)));
			//#elif MC >= 1.21.5
			//$ // no downscaled grab before 1.21.6: the frame is shrunk while it is encoded
			//$ Screenshot.takeScreenshot(target, image -> WORKER.execute(() -> encode(image, now, scale)));
			//#elif MC >= 1.21.2
			//$ NativeImage image = Screenshot.takeScreenshot(target);
			//$ WORKER.execute(() -> encode(image, now, scale));
			//#else
			//$ Screenshot.takeScreenshot(target, scale, image -> WORKER.execute(() -> encode(image, now, 1)));
			//#endif
		} catch (RuntimeException e) {
			inFlight.updateAndGet(n -> Math.max(0, n - 1));
			SlashHud.LOG.debug("SlashClient clips: {}", e.toString());
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
			byte[] jpeg = jpeg(rgb);
			long keep = Math.max(SlashHud.config.clips ? SlashHud.config.clipSeconds : 0, Replay.seconds()) * 1_000_000_000L;
			synchronized (frames) {
				// switched off while this frame was on its way
				if (!capturing()) return;
				frames.addLast(new Frame(jpeg, w, h, at));
				while (!frames.isEmpty() && at - frames.getFirst().at() > keep) frames.removeFirst();
			}
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient clips: {}", e.toString());
		} finally {
			inFlight.updateAndGet(n -> Math.max(0, n - 1));
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
				mc.execute(() -> SystemToast.add(Compat.toasts(mc), SystemToast.SystemToastId.PERIODIC_NOTIFICATION,
					Component.translatable("slashclient-hud.clips.saved", Math.round(seconds)), Component.literal(file.getFileName().toString())));
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
