package dev.slash3rss.slashclient.hud.camera;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.assist.Assist;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;

/**
 * The view locked: the mouse does not turn the player. By its key, or by itself on coming back to the game from
 * another window (alt-tab) while a button is held by its key, or always, as set: the mouse moved on the way back
 * would otherwise turn a farm's digging onto the spawners before the player switches it off. Locked by itself
 * while holding, it unlocks once the held buttons are let go; otherwise with the key.
 */
public final class LookLock {
	private LookLock() {}

	/** When it locks by itself on coming back to the game. */
	public static final String[] ON_RETURN = { "holding", "always", "never" };

	public static KeyMapping key;
	private static boolean locked;
	/** Locked by itself while a button was held: let go of the buttons, it unlocks. */
	private static boolean byHolding;
	/** The game's window had the focus last tick. */
	private static boolean windowActive = true;
	/** When the "the view is locked" line was last said for the mouse moving (not every frame). */
	private static long said;

	/** For the tests: the window's focus as if alt-tabbed away (false) and back (true); null: the real one. */
	public static Boolean windowForTest;

	public static boolean locked() {
		return locked;
	}

	private static boolean on() {
		return SlashHud.config != null && SlashHud.config.lookLock;
	}

	private static boolean holding() {
		return Assist.holding(true) || Assist.holding(false);
	}

	public static void tick(Minecraft mc) {
		while (key.consumeClick()) pressed(mc);
		boolean active = windowForTest != null ? windowForTest : mc.isWindowActive();
		if (!on() || mc.player == null) {
			locked = byHolding = false;
			windowActive = active;
			return;
		}
		String when = SlashHud.config.lookLockOnReturn;
		if (active && !windowActive && !locked && ("always".equals(when) || "holding".equals(when) && holding())) {
			locked = true;
			byHolding = "holding".equals(when);
			say(mc);
		}
		windowActive = active;
		if (locked && byHolding && !holding()) {
			locked = byHolding = false;
			Compat.overlay(mc, Component.translatable("slashclient-hud.lookLock.off"));
		}
	}

	/** Its key: locks and unlocks (and works on a lock that came by itself). */
	public static void pressed(Minecraft mc) {
		if (!on()) return;
		locked = !locked;
		byHolding = false;
		Compat.overlay(mc, Component.translatable(locked ? "slashclient-hud.lookLock.on" : "slashclient-hud.lookLock.off"));
	}

	/** Says the view is locked and how to unlock it. */
	private static void say(Minecraft mc) {
		said = System.currentTimeMillis();
		String how = (byHolding ? "slashclient-hud.lookLock.lockedHolding" : "slashclient-hud.lookLock.locked") + (key.isUnbound() ? "NoKey" : "");
		Compat.overlay(mc, Component.translatable(how, key.getTranslatedKeyMessage()));
	}

	/** The mouse moved the player (FreelookMixin): true when the view is locked and the player must not turn. */
	public static boolean turn(Entity entity, double dYaw, double dPitch) {
		Minecraft mc = Minecraft.getInstance();
		if (!locked || entity != mc.player) return false;
		if ((dYaw != 0 || dPitch != 0) && System.currentTimeMillis() - said > 3000) say(mc);
		return true;
	}
}
