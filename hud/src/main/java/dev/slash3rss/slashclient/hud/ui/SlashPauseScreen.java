package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.WaypointsScreen;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.achievement.StatsScreen;
import net.minecraft.client.gui.screens.advancements.AdvancementsScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * The SlashClient pause menu, the same look as our main menu: back to the game, friends, the
 * HUD, options and leaving named; advancements, statistics, waypoints and the game's own
 * pause menu as icons. Leaving goes the game's way (a draft report is offered first).
 */
public class SlashPauseScreen extends MenuScreen {
	public SlashPauseScreen() {
		super(Component.translatable("menu.game"));
	}

	private List<Nav> nav() {
		return List.of(
			new Nav(Ui.tr("menu.returnToGame"), "play", this::onClose),
			new Nav(Ui.tr("slashclient-hud.friends"), "user", () -> minecraft.setScreenAndShow(new FriendsScreen(this))),
			new Nav(Ui.tr("slashclient-hud.cosmetics"), "m-appearance", () -> minecraft.setScreenAndShow(new dev.slash3rss.slashclient.hud.CosmeticsScreen(this))),
			new Nav(Ui.tr("slashclient-hud.editor"), "sliders", () -> minecraft.setScreenAndShow(HudEditScreen.settingsWindow())),
			new Nav(Ui.tr("menu.options"), "gear", () -> minecraft.setScreenAndShow(Compat.options(minecraft, this))),
			//#if MC >= 1.20.2
			new Nav(CommonComponents.disconnectButtonLabel(minecraft.isLocalServer()), "power", this::leave, true));
			//#else
			//$ new Nav(Component.translatable(minecraft.isLocalServer() ? "menu.returnToMenu" : "menu.disconnect"), "power", this::leave, true));
			//#endif
	}

	private List<Nav> tools() {
		return List.of(
			new Nav(Ui.tr("gui.advancements"), "m-advancements", () -> {
				//#if MC >= 1.20.2
				if (minecraft.player != null) minecraft.setScreenAndShow(new AdvancementsScreen(minecraft.player.connection.getAdvancements(), this));
				//#else
				//$ if (minecraft.player != null) minecraft.setScreenAndShow(new AdvancementsScreen(minecraft.player.connection.getAdvancements()));
				//#endif
			}),
			new Nav(Ui.tr("gui.stats"), "m-stats", () -> {
				if (minecraft.player != null) minecraft.setScreenAndShow(new StatsScreen(this, minecraft.player.getStats()));
			}),
			new Nav(Ui.tr("slashclient-hud.waypoints"), "m-waypoints", () -> minecraft.setScreenAndShow(new WaypointsScreen())),
			new Nav(Ui.tr("slashclient-hud.menu.vanillaPause"), "back", () -> {
				SlashHud.config.customPause = false;
				SlashHud.config.save();
				minecraft.setScreenAndShow(new PauseScreen(true));
			}));
	}

	/** Leaving the world or server, exactly as the game's own pause menu does it. */
	private void leave() {
		//#if MC >= 1.20.2
		minecraft.getReportingContext().draftReportHandled(minecraft, this, () -> minecraft.disconnectFromWorld(ClientLevel.DEFAULT_QUIT_MESSAGE), true);
		//#else
		//$ minecraft.getReportingContext().draftReportHandled(minecraft, this, () -> minecraft.disconnectFromWorld(Component.translatable("menu.savingLevel")), true);
		//#endif
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		super.extractRenderState(g, mx, my, delta);
		beginFrame();
		List<Nav> items = nav();
		int pw = Math.min(220, width - 24);
		int ph = panelHeight(items.size());
		int top = Math.max(6, (height - 34 - ph) / 2);
		Ui.brand(g, (width - Ui.brandWidth(1.3f)) / 2, top, 1.3f);
		Component paused = Ui.tr("menu.paused");
		Ui.drawOnWorld(g, paused, (width - Ui.width(paused)) / 2, top + 18, Ui.TEXT_2);
		drawMenu(g, mx, my, (width - pw) / 2, top + 34, pw, items, tools());
		drawTooltip(g);
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// the game stays visible behind, darker so the panel reads well
		g.fill(0, 0, width, height, 0x90000000);
	}
}
