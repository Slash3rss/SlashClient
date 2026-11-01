package dev.slash3rss.slashclient.hud.camera;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/**
 * "Myszka przez VNC": the camera turned by where the cursor is, not by the mouse's own movement. A remote
 * desktop (VNC, Raspberry Pi Connect) sends the cursor's place on the screen; with the cursor locked the game
 * wants only movement, and a desktop that does not turn one into the other (labwc 0.20 on the Raspberry Pi)
 * leaves the camera still. With this on, the cursor is only hidden and kept in the window
 * (mixin.VncMouseMixin), the camera follows its moves, and at the window's edges, where a remote cursor
 * cannot go further, the camera keeps turning that way – faster the closer to the edge. Minecraft 26.3 and
 * newer (the mouse through SDL); other versions have nothing to switch.
 */
public final class VncMouse {
	private VncMouse() {}

	/** How fast the edges turn the camera. */
	public static final String[] EDGE = { "slow", "normal", "fast" };
	/** The edge zone, as a part of the window's width and height. */
	static final double ZONE = 0.08;

	public static KeyMapping key;
	/** The cursor is taken the VNC way now (hidden and kept in the window, not locked): let go the same way. */
	public static boolean taken;
	/** For the tests: the mode as if switched on. */
	public static boolean forTest;

	public static boolean on() {
		return forTest || SlashHud.config != null && SlashHud.config.vncMouse;
	}

	/** The cursor's movement per second (in window pixels) right at an edge, as set. */
	public static double edgeSpeedNow() {
		String speed = SlashHud.config == null ? "normal" : SlashHud.config.vncMouseEdge;
		return "slow".equals(speed) ? 300 : "fast".equals(speed) ? 1200 : 600;
	}

	/**
	 * The turn the edges add this frame: (dx, dy) in window pixels for the cursor at (x, y) in a window
	 * `width` × `height`, `seconds` since the last frame. Nothing in the middle; in the edge zone more the
	 * closer to the edge (the remote cursor stops there, so it stands for "keep turning").
	 */
	public static double[] edgeTurn(double x, double y, int width, int height, double seconds, double speed) {
		return new double[] { axis(x, width) * speed * seconds, axis(y, height) * speed * seconds };
	}

	/** -1..1: how deep in the zone at the start (negative) or the end (positive) of a side `size` long. */
	private static double axis(double at, int size) {
		if (size <= 0) return 0;
		double zone = size * ZONE;
		if (at < zone) return -Math.min(1, (zone - at) / zone);
		if (at > size - zone) return Math.min(1, (at - (size - zone)) / zone);
		return 0;
	}

	public static void tick(Minecraft mc) {
		while (key.consumeClick()) toggle(mc);
	}

	/** Its key: on and off, the cursor taken again so the change shows at once. */
	public static void toggle(Minecraft mc) {
		if (SlashHud.config == null) return;
		SlashHud.config.vncMouse = !SlashHud.config.vncMouse;
		SlashHud.config.save();
		Compat.overlay(mc, Component.translatable(SlashHud.config.vncMouse ? "slashclient-hud.vncMouse.on" : "slashclient-hud.vncMouse.off"));
		regrab(mc);
	}

	/** The cursor let go and taken again (in the game, no window open), as the mode now wants it. */
	public static void regrab(Minecraft mc) {
		if (!mc.mouseHandler.isMouseGrabbed()) return;
		mc.mouseHandler.releaseMouse();
		mc.mouseHandler.grabMouse();
	}
}
