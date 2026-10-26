// only the client gametests call these, and their API came in 1.21.4
//#if MC >= 1.21.4
package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.screens.DeathScreen;
import dev.slash3rss.slashclient.hud.map.DeathPoint;
import dev.slash3rss.slashclient.hud.map.Waypoints;

/** For the in-game test of the death screen (src/gametest GameDeathScreen). */
public final class DeathInfoTestHooks {
	private DeathInfoTestHooks() {}

	public static void enabled(boolean on) {
		SlashHud.config.deathScreen = on;
	}

	/**
	 * What the death screen shows: "none" (no death screen), "plain" (the game's own) or
	 * "coords|dimension|survived|save button" of ours.
	 */
	public static String shown() {
		var mc = Minecraft.getInstance();
		if (!(Compat.screen(mc) instanceof DeathScreen)) return "none";
		var card = DeathInfo.card;
		if (card == null || !net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(Compat.screen(mc)).contains(card)) return "plain";
		return DeathInfo.coords(card.at) + "|" + card.place().getString() + "|" + card.survived().getString() + "|"
			+ (DeathInfo.saveButton == null ? "-" : DeathInfo.saveButton.getMessage().getString());
	}

	/** The middle of a part of the screen in window pixels: "card", "save" or "button <n>" (the game's n-th). */
	public static double[] center(String what) {
		var mc = Minecraft.getInstance();
		AbstractWidget w;
		if (what.equals("card")) w = DeathInfo.card;
		else if (what.equals("save")) w = DeathInfo.saveButton;
		else {
			int n = Integer.parseInt(what.substring("button ".length()));
			w = net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(Compat.screen(mc)).stream()
				.filter(b -> b != DeathInfo.card && b != DeathInfo.saveButton).toList().get(n);
		}
		double scale = mc.getWindow().getGuiScale();
		return new double[] { (w.getX() + w.getWidth() / 2.0) * scale, (w.getY() + w.getHeight() / 2.0) * scale };
	}

	/** "top bottom" of the game's own buttons and of ours, to check they do not overlap: "ownTop ownBottom ourBottom". */
	public static String layout() {
		var mc = Minecraft.getInstance();
		int ownTop = Integer.MAX_VALUE, ownBottom = 0, ourBottom = 0;
		for (AbstractWidget w : net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(Compat.screen(mc))) {
			if (w == DeathInfo.card || w == DeathInfo.saveButton) ourBottom = Math.max(ourBottom, w.getY() + w.getHeight());
			else {
				ownTop = Math.min(ownTop, w.getY());
				ownBottom = Math.max(ownBottom, w.getY() + w.getHeight());
			}
		}
		return ownTop + " " + ownBottom + " " + ourBottom + " " + Compat.screen(mc).height;
	}

	public static boolean ownButtonsActive() {
		var mc = Minecraft.getInstance();
		return net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(Compat.screen(mc)).stream()
			.filter(b -> b != DeathInfo.card && b != DeathInfo.saveButton).allMatch(b -> b.active);
	}

	public static String clipboard() {
		return Minecraft.getInstance().keyboardHandler.getClipboard();
	}

	/** Points of this world at x y z: "name death" each, joined with ";". */
	public static String pointsAt(int x, int y, int z) {
		var mc = Minecraft.getInstance();
		StringBuilder out = new StringBuilder();
		for (var p : Waypoints.points(mc)) {
			if (p.x == x && p.y == y && p.z == z) out.append(out.isEmpty() ? "" : ";").append(p.name).append(p.death ? " death" : " kept");
		}
		return out.toString();
	}

	/** Lived ticks as counted now. */
	public static long lived() {
		return DeathInfo.aliveTicks;
	}

	/** The points this test kept, gone again, and the switch back on. */
	public static void reset() {
		var mc = Minecraft.getInstance();
		Waypoints.here(mc).removeIf(p -> p.death || p.color == DeathPoint.COLOR);
		Waypoints.save();
		SlashHud.config.deathScreen = new HudConfig().deathScreen;
	}
}
//#endif
