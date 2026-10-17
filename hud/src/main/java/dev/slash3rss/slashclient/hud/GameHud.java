package dev.slash3rss.slashclient.hud;

//#if MC >= 1.20.2
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
//#endif
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

	/** Draws `part` scaled by `scale` around the point (ax, ay) and moved down by `dy`. */
	private static void framed(GuiGraphicsExtractor g, float scale, float ax, float ay, float dy, Runnable part) {
		if (scale == 1f && dy == 0f) {
			part.run();
			return;
		}
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(ax, ay + dy);
		pose.scale(scale, scale);
		pose.translate(-ax, -ay);
		part.run();
		pose.popMatrix();
	}

	//#if MC < 1.20.2
	//$ // 1.20.1: called around the game's own drawing by LegacyGuiMixin
	//$ public static void scoreboard(GuiGraphicsExtractor g, Runnable part) {
	//$ 	if (cfg().scoreboard) framed(g, cfg().scoreboardScale, g.guiWidth(), g.guiHeight() / 2f, cfg().scoreboardOffset, part);
	//$ }
	//$
	//$ public static void bossBar(GuiGraphicsExtractor g, Runnable part) {
	//$ 	if (cfg().bossBar) framed(g, cfg().bossBarScale, g.guiWidth() / 2f, 0, cfg().bossBarOffset, part);
	//$ }
	//$
	//$ public static void tabList(GuiGraphicsExtractor g, Runnable part) {
	//$ 	framed(g, cfg().tabScale, g.guiWidth() / 2f, 0, 0, part);
	//$ }
	//#endif

	static void register() {
		//#if MC >= 1.20.2
		// the scoreboard sits in the middle of the right edge
		HudElementRegistry.replaceElement(VanillaHudElements.SCOREBOARD, vanilla -> (HudElement) (g, delta) -> {
			if (!cfg().scoreboard) return;
			framed(g, cfg().scoreboardScale, g.guiWidth(), g.guiHeight() / 2f, cfg().scoreboardOffset, () -> vanilla.extractRenderState(g, delta));
		});
		// the boss bar and the tab list hang from the top middle
		HudElementRegistry.replaceElement(VanillaHudElements.BOSS_BAR, vanilla -> (HudElement) (g, delta) -> {
			if (!cfg().bossBar) return;
			framed(g, cfg().bossBarScale, g.guiWidth() / 2f, 0, cfg().bossBarOffset, () -> vanilla.extractRenderState(g, delta));
		});
		HudElementRegistry.replaceElement(VanillaHudElements.PLAYER_LIST, vanilla -> (HudElement) (g, delta) ->
			framed(g, cfg().tabScale, g.guiWidth() / 2f, 0, 0, () -> vanilla.extractRenderState(g, delta)));
		// titles in the middle of the screen
		HudElementRegistry.replaceElement(VanillaHudElements.TITLE_AND_SUBTITLE, vanilla -> (HudElement) (g, delta) -> {
			if (!cfg().titles) return;
			framed(g, cfg().titleScale, g.guiWidth() / 2f, g.guiHeight() / 2f, 0, () -> vanilla.extractRenderState(g, delta));
		});
		//#endif
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
