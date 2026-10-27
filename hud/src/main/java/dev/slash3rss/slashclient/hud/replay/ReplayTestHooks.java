package dev.slash3rss.slashclient.hud.replay;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.SlashHud;

/** For the game test of the instant replay (GameReplay): settings, the viewer's controls and what it shows. */
public final class ReplayTestHooks {
	private ReplayTestHooks() {}

	/** The replay on (clips off, so it has to turn the recording on by itself), `seconds` long. */
	public static void setup(boolean on, int seconds, boolean pause) {
		SlashHud.config.clips = false;
		SlashHud.config.replay = on;
		SlashHud.config.replaySeconds = seconds;
		SlashHud.config.replayPause = pause;
	}

	/** "<frames> <kilobytes> <seconds>" in the shared buffer. */
	public static String buffer() {
		var all = Clips.recent(600);
		long bytes = 0;
		for (Clips.Frame f : all) bytes += f.jpeg().length;
		String size = all.isEmpty() ? "0x0" : all.get(all.size() - 1).width() + "x" + all.get(all.size() - 1).height();
		return all.size() + " " + bytes / 1024 + " " + String.format(java.util.Locale.ROOT, "%.1f", Clips.bufferedSeconds()) + " " + size;
	}

	public static void turnCamera(float degrees) {
		var p = Minecraft.getInstance().player;
		if (p != null) p.setYRot(p.getYRot() + degrees);
	}

	public static void open() {
		Replay.open(Minecraft.getInstance());
	}

	public static void settingsCard() {
		Minecraft.getInstance().setScreenAndShow(new HudEditScreen("replay"));
	}

	private static ReplayScreen screen() {
		return Compat.screen(Minecraft.getInstance()) instanceof ReplayScreen s ? s : null;
	}

	public static boolean isOpen() {
		return screen() != null;
	}

	/** The middle of the viewer's n-th button in window pixels (for the cursor). */
	public static double[] buttonOnWindow(int n) {
		double[] at = screen().buttonForTest(n);
		double scale = Minecraft.getInstance().getWindow().getGuiScale();
		return new double[] { at[0] * scale, at[1] * scale };
	}

	/** The viewer's state (ReplayScreen.state) and whether the game is paused, or "closed". */
	public static String state() {
		ReplayScreen s = screen();
		return s == null ? "closed" : s.state() + " " + Minecraft.getInstance().isPaused();
	}

	/** Pauses and jumps to this part of the replay (0..1). */
	public static void seek(double fraction) {
		ReplayScreen s = screen();
		if (s == null) return;
		if (s.playing()) s.togglePlay();
		s.seek(s.duration() * fraction);
	}

	public static double position() {
		ReplayScreen s = screen();
		return s == null ? -1 : s.position();
	}

	public static void play(float speed) {
		ReplayScreen s = screen();
		if (s == null) return;
		s.setSpeed(speed);
		if (!s.playing()) s.togglePlay();
	}

	public static void step(int frames) {
		ReplayScreen s = screen();
		if (s != null) s.step(frames);
	}

	public static void markIn() {
		ReplayScreen s = screen();
		if (s != null) s.markIn();
	}

	public static void markOut() {
		ReplayScreen s = screen();
		if (s != null) s.markOut();
	}

	/** Saves the selection; the clip's name, or "none". */
	public static String save() {
		ReplayScreen s = screen();
		Path file = s == null ? null : s.save();
		return file == null ? "none" : file.getFileName().toString();
	}

	public static boolean saving() {
		return Clips.saving();
	}

	/** A clip in clips/ as "<bytes> <frames in its header> <RIFF+AVI>", or "none". */
	public static String clip(String name) {
		try {
			Path file = net.fabricmc.loader.api.FabricLoader.getInstance().getGameDir().resolve("clips").resolve(name);
			byte[] head = Files.readAllBytes(file);
			var b = ByteBuffer.wrap(head).order(ByteOrder.LITTLE_ENDIAN);
			return head.length + " " + b.getInt(48) + " " + new String(head, 0, 4) + new String(head, 8, 4);
		} catch (Exception e) {
			return "none";
		}
	}

	/** A hash of the picture shown (every 7th pixel), to tell frames apart; 0 when none is. */
	public static int shownHash() {
		ReplayScreen s = screen();
		NativeImage image = s == null ? null : s.shownPicture();
		if (image == null) return 0;
		int hash = 1;
		for (int y = 0; y < image.getHeight(); y += 7) {
			for (int x = 0; x < image.getWidth(); x += 7) hash = hash * 31 + image.getPixel(x, y);
		}
		return hash;
	}

	/** Decodes 20 frames of the buffer outside the viewer (after 5 to warm up): "<µs per frame> <µs of it in the JPEG reader>". */
	public static String decodeMicros() {
		var all = Clips.recent(600);
		if (all.size() < 25) return "-1 -1";
		long total = 0, reader = 0;
		try {
			for (int i = 0; i < 25; i++) {
				var f = all.get(i);
				long a = System.nanoTime();
				javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(f.jpeg()));
				long b = System.nanoTime();
				try (NativeImage image = ReplayDecoder.decode(f)) {
					long c = System.nanoTime();
					if (i >= 5) {
						reader += b - a;
						total += c - b;
					}
				}
			}
		} catch (Exception e) {
			return "-1 -1";
		}
		return total / 20 / 1000 + " " + reader / 20 / 1000;
	}
}
