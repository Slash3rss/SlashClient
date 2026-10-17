package dev.slash3rss.slashclient.hud;

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

/**
 * Clips, like ShadowPlay: while on, the game keeps the last seconds of what is on screen (about
 * 30 frames a second, at most 1280 pixels wide, as JPEG in memory) and a key saves them as a video
 * in clips/ next to screenshots. Frames are copied after the whole frame is drawn (the world and
 * the HUD) and squeezed on a background thread, so the game itself waits for nothing.
 */
public final class Clips {
	private Clips() {}

	private static final long FRAME_NS = 1_000_000_000L / 30;
	/** Frames on their way to the background thread; more and the new ones are skipped. */
	private static final int IN_FLIGHT = 3;
	static KeyMapping key;

	private record Frame(byte[] jpeg, int width, int height, long at) {}

	private static final ArrayDeque<Frame> frames = new ArrayDeque<>();
	private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "SlashClient clips");
		t.setDaemon(true);
		t.setPriority(Thread.MIN_PRIORITY);
		return t;
	});
	private static final AtomicInteger inFlight = new AtomicInteger();
	private static long lastFrame;
	private static volatile boolean saving;

	public static boolean enabled() {
		return SlashHud.config.clips;
	}

	/** Seconds in memory right now (for the settings card). */
	public static double bufferedSeconds() {
		synchronized (frames) {
			return frames.isEmpty() ? 0 : (frames.getLast().at() - frames.getFirst().at()) / 1e9;
		}
	}

	/** After every drawn frame (GameRenderer.render): takes one, at most 30 a second. */
	public static void afterFrame(Minecraft mc) {
		if (!enabled() || mc.level == null) {
			if (!frames.isEmpty() && !enabled()) synchronized (frames) {
				frames.clear();
			}
			return;
		}
		long now = System.nanoTime();
		if (now - lastFrame < FRAME_NS || inFlight.get() >= IN_FLIGHT) return;
		lastFrame = now;
		var target = Compat.mainTarget(mc);
		// at most 1280 wide: a 1920 window is halved, a 4K one quartered
		int scale = Math.max(1, (int) Math.ceil(mc.getWindow().getWidth() / 1280.0));
		inFlight.incrementAndGet();
		try {
			//#if MC >= 1.21.6
			Screenshot.takeScreenshot(target, scale, image -> WORKER.execute(() -> encode(image, now, 1)));
			//#elif MC >= 1.21.5
			//$ // no downscaled grab before 1.21.6: the frame is shrunk while it is encoded
			//$ Screenshot.takeScreenshot(target, image -> WORKER.execute(() -> encode(image, now, scale)));
			//#else
			//$ NativeImage image = Screenshot.takeScreenshot(target);
			//$ WORKER.execute(() -> encode(image, now, scale));
			//#endif
		} catch (RuntimeException e) {
			inFlight.decrementAndGet();
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
			long keep = SlashHud.config.clipSeconds * 1_000_000_000L;
			synchronized (frames) {
				// switched off while this frame was on its way
				if (!enabled()) return;
				frames.addLast(new Frame(jpeg, w, h, at));
				while (!frames.isEmpty() && at - frames.getFirst().at() > keep) frames.removeFirst();
			}
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient clips: {}", e.toString());
		} finally {
			inFlight.decrementAndGet();
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

	static void tick(Minecraft mc) {
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
		List<Frame> list;
		synchronized (frames) {
			list = new ArrayList<>(frames);
		}
		// a resized window changes the frame size: the clip is what came after the last change
		int cut = 0;
		for (int i = list.size() - 1; i > 0; i--) {
			if (list.get(i - 1).width() != list.getLast().width() || list.get(i - 1).height() != list.getLast().height()) {
				cut = i;
				break;
			}
		}
		List<Frame> clip = list.subList(cut, list.size());
		if (clip.size() < 10) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.clips.empty"));
			return;
		}
		saving = true;
		Path dir = FabricLoader.getInstance().getGameDir().resolve("clips");
		Path file = dir.resolve("clip-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH.mm.ss")) + ".avi");
		double seconds = Math.max(0.1, (clip.getLast().at() - clip.getFirst().at()) / 1e9);
		double fps = (clip.size() - 1) / seconds;
		Compat.overlay(mc, Component.translatable("slashclient-hud.clips.saving"));
		Thread.ofVirtual().start(() -> {
			try {
				Files.createDirectories(dir);
				AviWriter.write(file, clip.stream().map(Frame::jpeg).toList(), clip.getLast().width(), clip.getLast().height(), fps);
				mc.execute(() -> SystemToast.add(Compat.toasts(mc), SystemToast.SystemToastId.PERIODIC_NOTIFICATION,
					Component.translatable("slashclient-hud.clips.saved", Math.round(seconds)), Component.literal(file.getFileName().toString())));
			} catch (Exception e) {
				SlashHud.LOG.warn("Could not save the clip", e);
				mc.execute(() -> Compat.overlay(mc, Component.translatable("slashclient-hud.clips.failed")));
			} finally {
				saving = false;
			}
		});
	}

	/** For the test: frames in memory. */
	public static int bufferedFrames() {
		synchronized (frames) {
			return frames.size();
		}
	}
}
