package dev.slash3rss.slashclient.hud;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/** Zoom, fullbright, low fire, chat timestamps and the crosshair; the mixins call in here. */
public final class Extras {
	private Extras() {}

	static KeyMapping zoomKey;
	static KeyMapping fullbrightKey;

	/** How far the view is zoomed right now (1 = not at all), eased towards the target. */
	private static float current = 1f;
	/** The wheel's change while the key is held; starts from the saved factor each time. */
	private static float held = -1f;
	private static long lastFrame;

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	/** In toggle mode: switched on by a press of the zoom key, off by the next. */
	private static boolean toggled;
	/** The cinematic camera was switched on for the zoom (and goes off with it). */
	private static boolean cinematicOn;

	public static boolean zooming() {
		if (!cfg().zoom || zoomKey == null || Compat.screen(Minecraft.getInstance()) != null) return false;
		return cfg().zoomToggle ? toggled : zoomKey.isDown();
	}

	/** Field of view with the zoom applied; called every frame. */
	/** The field of view of the last frame, for placing waypoints on screen. */
	public static float lastFov = 70f;

	/** Your own time of day: the same day as the server's (so the moon keeps its phase), your hour. */
	public static long time(long ticks) {
		// the benchmark's test scene: always the same hour, whatever the player chose
		long scene = BenchScene.time();
		if (scene >= 0) return Math.floorDiv(ticks, 24000L) * 24000L + scene;
		if (cfg() == null || !cfg().timeChanger) return ticks;
		return Math.floorDiv(ticks, 24000L) * 24000L + cfg().fixedTime;
	}

	public static float zoomFov(float fov) {
		boolean on = zooming();
		if (on && held < 0) held = cfg().zoomFactor;
		if (!on && held >= 0) {
			// the wheel's zoom kept for the next time
			if (cfg().zoomRemember && Math.abs(held - cfg().zoomFactor) > 0.01f) {
				cfg().zoomFactor = Math.max(2f, Math.min(12f, held));
				cfg().save();
			}
			held = -1f;
		}
		float target = on ? held : 1f;
		long now = System.nanoTime();
		float dt = lastFrame == 0 ? 0.016f : Math.min(0.1f, (now - lastFrame) / 1e9f);
		lastFrame = now;
		current = cfg().zoomSmooth ? current + (target - current) * Math.min(1f, dt * 14f) : target;
		if (Math.abs(current - target) < 0.001f) current = target;
		lastFov = fov / current;
		return lastFov;
	}

	/** The mouse wheel while zooming: true when it was used here (and should not change the hotbar slot). */
	public static boolean scroll(double amount) {
		if (!zooming() || amount == 0) return false;
		held = Math.max(1.5f, Math.min(50f, held * (amount > 0 ? 1.25f : 0.8f)));
		return true;
	}

	/**
	 * Mouse sensitivity while zoomed, so the view does not fly around: the game turns
	 * (0.6 s + 0.2)³ into speed, so the option is changed to slow it by the zoom factor.
	 */
	public static double sensitivity(double option) {
		if (current <= 1.001f) return option;
		double scaled = (option * 0.6 + 0.2) * Math.cbrt(1.0 / current);
		return Math.max(0, (scaled - 0.2) / 0.6);
	}

	public static boolean fullbright() {
		return cfg().fullbright;
	}

	public static boolean lowFire() {
		return cfg().lowFire;
	}

	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

	public static Component timestamp(Component message) {
		if (!cfg().chatTimestamps) return message;
		return Component.literal("[" + LocalTime.now().format(TIME) + "] ").withStyle(Style.EMPTY.withColor(0xAAAAAA)).append(message);
	}

	static void tick(Minecraft mc) {
		if (zoomKey != null && cfg().zoomToggle) {
			while (zoomKey.consumeClick()) if (Compat.screen(mc) == null) toggled = !toggled;
		} else toggled = false;
		// the camera glides while zoomed in, as Zoomify does; what the player had set comes back after
		boolean glide = zooming() && cfg().zoomCinematic;
		if (glide && !cinematicOn && !mc.options.smoothCamera) {
			mc.options.smoothCamera = true;
			cinematicOn = true;
		} else if (!glide && cinematicOn) {
			mc.options.smoothCamera = false;
			cinematicOn = false;
		}
		while (fullbrightKey != null && fullbrightKey.consumeClick()) {
			cfg().fullbright = !cfg().fullbright;
			cfg().save();
			Compat.overlay(mc, Component.translatable(cfg().fullbright ? "slashclient-hud.fullbright.on" : "slashclient-hud.fullbright.off"));
		}
	}

	// ---------- crosshair ----------

		static final int[] COLORS = { 0xFFFFFFFF, 0xFF55FF55, 0xFF55FFFF, 0xFFFF5555, 0xFFFFFF55, 0xFFFF55FF, 0xFF000000 };

	/** False when the game's own crosshair should be drawn. */
	static boolean drawCrosshair(GuiGraphicsExtractor g, Minecraft mc) {
		String style = cfg().crosshair;
		if ("vanilla".equals(style)) return false;
		if (!mc.options.getCameraType().isFirstPerson()) return true;
		// the grid's middle pixel on the screen's middle, where the game puts its own
		int mid = Crosshair.MID;
		Crosshair.draw(g, g.guiWidth() / 2 - mid, g.guiHeight() / 2 - mid, Crosshair.current(), 1, cfg().crosshairColor, cfg().crosshairOutline);
		return true;
	}
}
