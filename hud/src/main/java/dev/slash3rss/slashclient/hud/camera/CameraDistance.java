package dev.slash3rss.slashclient.hud.camera;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/**
 * The third person camera's distance (F5), changed with the mouse wheel: while the key is held
 * (V; the wheel then leaves the hotbar alone), or with the wheel alone when the setting says so.
 * It starts at the set distance, eases towards the wheel's and, if asked, goes back to the set
 * one when the view leaves third person. The game's own wall check still pulls it in.
 */
public final class CameraDistance {
	private CameraDistance() {}

	public static final float MIN = 1f, MAX = 16f;
	/** The game's own distance. */
	static final float VANILLA = 4f;

	public static KeyMapping key;
	/** Where the wheel put it (NaN: the set distance), and where the camera is on the way there. */
	private static float target = Float.NaN, current = Float.NaN;
	private static long lastFrame;
	private static boolean wasThirdPerson;

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	public static float target() {
		return Float.isNaN(target) ? clamp(cfg().cameraDistanceDefault) : target;
	}

	public static float clamp(float d) {
		return Math.max(MIN, Math.min(MAX, d));
	}

	public static void tick(Minecraft mc) {
		boolean third = !mc.options.getCameraType().isFirstPerson();
		if (wasThirdPerson && !third && cfg().cameraDistanceReset) target = Float.NaN;
		wasThirdPerson = third;
	}

	/** The mouse wheel: true when it changed the distance here (and must not change the hotbar slot). */
	public static boolean scroll(double amount) {
		Minecraft mc = Minecraft.getInstance();
		if (amount == 0 || cfg() == null || !cfg().cameraDistance || mc.player == null || Compat.screen(mc) != null) return false;
		if (mc.options.getCameraType().isFirstPerson()) return false;
		if (cfg().cameraDistanceKey && (key == null || !key.isDown())) return false;
		// a notch is half a block close up, more further out
		float d = target();
		float step = d < 4 ? 0.5f : d < 8 ? 1f : 2f;
		target = clamp(d + (amount > 0 ? -step : step));
		Compat.overlay(mc, Component.translatable("slashclient-hud.cameraDistance.value", String.format(java.util.Locale.ROOT, "%.1f", target)));
		return true;
	}

	/** The distance the game asks for (4, times the player's scale), as the player set it; called every frame. */
	public static float distance(float asked) {
		if (cfg() == null || !cfg().cameraDistance) {
			current = Float.NaN;
			return asked;
		}
		float want = target();
		long now = System.nanoTime();
		float dt = lastFrame == 0 ? 0.016f : Math.min(0.1f, (now - lastFrame) / 1e9f);
		lastFrame = now;
		current = Float.isNaN(current) ? want : current + (want - current) * Math.min(1f, dt * 12f);
		if (Math.abs(current - want) < 0.01f) current = want;
		return asked * current / VANILLA;
	}

	/** For the game tests: the distance set at once, without easing (NaN: back to the set one). */
	public static void set(float d) {
		target = Float.isNaN(d) ? Float.NaN : clamp(d);
		current = Float.NaN;
	}
}
