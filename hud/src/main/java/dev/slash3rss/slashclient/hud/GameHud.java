package dev.slash3rss.slashclient.hud;

import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.entity.Entity;

/**
 * The game's own HUD parts made adjustable, like in other clients: the scoreboard, the boss
 * bar, the tab list and the titles can be hidden, scaled and moved. Each one is drawn by the
 * game as usual, only inside a moved and scaled frame.
 */
public final class GameHud {
	private GameHud() {}

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	/**
	 * Draws a part where its box was put in the editor: the point the game draws it around moved
	 * to the same point of the box, and scaled there.
	 */
	private static void placed(GuiGraphicsExtractor g, GameParts.Part part, Runnable draw) {
		Minecraft mc = Minecraft.getInstance();
		HudConfig.Placement p = cfg().placement(part.id());
		int sw = g.guiWidth(), sh = g.guiHeight();
		int[] size = SlashHud.size(part, mc, p);
		int[] at = SlashHud.position(p, size[0], size[1], sw, sh);
		float[] box = part.boxAnchor(size[0], size[1]), screen = part.screenAnchor(sw, sh);
		float scale = part.scale() * p.scale();
		float tx = at[0] + box[0], ty = at[1] + box[1];
		if (scale == 1f && Math.abs(tx - screen[0]) < 0.5f && Math.abs(ty - screen[1]) < 0.5f) {
			draw.run();
			return;
		}
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(tx, ty);
		pose.scale(scale, scale);
		pose.translate(-screen[0], -screen[1]);
		draw.run();
		pose.popMatrix();
	}

	/** The toasts where their box is: called around the game drawing them; false when they are hidden. */
	public static boolean toastsBegin(GuiGraphicsExtractor g) {
		if (cfg() == null) return true;
		if (!GameParts.TOASTS.on()) return false;
		Minecraft mc = Minecraft.getInstance();
		HudConfig.Placement p = cfg().placement(GameParts.TOASTS.id());
		int sw = g.guiWidth(), sh = g.guiHeight();
		int[] size = SlashHud.size(GameParts.TOASTS, mc, p);
		int[] at = SlashHud.position(p, size[0], size[1], sw, sh);
		float[] box = GameParts.TOASTS.boxAnchor(size[0], size[1]), screen = GameParts.TOASTS.screenAnchor(sw, sh);
		float scale = p.scale();
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(at[0] + box[0], at[1] + box[1]);
		pose.scale(scale, scale);
		pose.translate(-screen[0], -screen[1]);
		return true;
	}

	public static void toastsEnd(GuiGraphicsExtractor g) {
		g.pose().popMatrix();
	}

	static void register() {
		// the scoreboard, the boss bar, the tab list and the action bar: where their boxes are in the editor
		HudElementRegistry.replaceElement(VanillaHudElements.SCOREBOARD, vanilla -> (HudElement) (g, delta) -> {
			if (GameParts.SCOREBOARD.on()) placed(g, GameParts.SCOREBOARD, () -> vanilla.extractRenderState(g, delta));
		});
		HudElementRegistry.replaceElement(VanillaHudElements.BOSS_BAR, vanilla -> (HudElement) (g, delta) -> {
			if (GameParts.BOSS_BAR.on()) placed(g, GameParts.BOSS_BAR, () -> vanilla.extractRenderState(g, delta));
		});
		HudElementRegistry.replaceElement(VanillaHudElements.PLAYER_LIST, vanilla -> (HudElement) (g, delta) -> {
			if (!GameParts.TAB_LIST.on()) return;
			Minecraft mc = Minecraft.getInstance();
			// in the editor: the real list, as if Tab were held
			if (Compat.screen(mc) instanceof HudEditScreen && GameParts.TAB_LIST.real(mc)) placed(g, GameParts.TAB_LIST, () -> Compat.drawTabList(g, mc));
			else placed(g, GameParts.TAB_LIST, () -> vanilla.extractRenderState(g, delta));
		});
		HudElementRegistry.replaceElement(VanillaHudElements.OVERLAY_MESSAGE, vanilla -> (HudElement) (g, delta) -> {
			if (GameParts.ACTION_BAR.on()) placed(g, GameParts.ACTION_BAR, () -> vanilla.extractRenderState(g, delta));
		});
		// titles in the middle of the screen
		HudElementRegistry.replaceElement(VanillaHudElements.TITLE_AND_SUBTITLE, vanilla -> (HudElement) (g, delta) -> {
			if (GameParts.TITLES.on()) placed(g, GameParts.TITLES, () -> vanilla.extractRenderState(g, delta));
		});
	}

	/** Your own name above your head: in third person, unless the HUD is hidden (F1) or you are invisible. */
	public static boolean ownNametag(Entity entity) {
		Minecraft mc = Minecraft.getInstance();
		return cfg() != null && cfg().ownNametag && entity == mc.player && !mc.options.getCameraType().isFirstPerson()
			&& !Compat.hudHidden(mc) && !entity.isInvisible();
	}

	/** The ping as a coloured number for the tab list. */
	public static int pingColor(int ms) {
		return ms < 0 ? 0xFFAAAAAA : ms < 80 ? 0xFF55FF55 : ms < 150 ? 0xFFFFFF55 : ms < 300 ? 0xFFFFAA00 : 0xFFFF5555;
	}
}
