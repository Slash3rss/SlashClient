package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.WaypointsScreen;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.PauseScreen;
//#if MC >= 26.3
import net.minecraft.client.gui.screens.WorldOptionsScreen;
//#endif
import net.minecraft.client.gui.screens.achievement.StatsScreen;
import net.minecraft.client.gui.screens.advancements.AdvancementsScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * The SlashClient pause menu, the same look as our main menu: back to the game, friends, the
 * HUD, options (on 26.3 also the world options) and leaving named; advancements, statistics,
 * waypoints and the game's own pause menu as icons. Leaving goes the game's way (a draft report is offered first).
 */
public class SlashPauseScreen extends MenuScreen {
	public SlashPauseScreen() {
		super(Component.translatable("menu.game"));
	}

	private List<Nav> nav() {
		List<Nav> items = new ArrayList<>(List.of(
			new Nav(Ui.tr("menu.returnToGame"), "play", this::onClose),
			new Nav(Ui.tr("slashclient-hud.friends"), "user", () -> minecraft.setScreenAndShow(new FriendsScreen(this))),
			new Nav(Ui.tr("slashclient-hud.cosmetics"), "m-appearance", () -> minecraft.setScreenAndShow(new dev.slash3rss.slashclient.hud.CosmeticsScreen(this))),
			new Nav(Ui.tr("slashclient-hud.editor"), "sliders", () -> minecraft.setScreenAndShow(HudEditScreen.settingsWindow())),
			new Nav(Ui.tr("menu.options"), "gear", () -> minecraft.setScreenAndShow(Compat.options(minecraft, this)))));
		//#if MC >= 26.3
		// world options (difficulty, game rules, LAN...) next to the options, shown whenever the game's own menu shows them
		if (minecraft.level != null) items.add(new Nav(Ui.tr("options.worldOptions.button"), "world", () -> minecraft.setScreenAndShow(new WorldOptionsScreen(this, minecraft.level))));
		//#endif
		//#if MC >= 26.2 && MC < 26.3
		//$ if (minecraft.level != null) items.add(new Nav(Ui.tr("options.worldOptions.button"), "world", () -> minecraft.setScreenAndShow(new net.minecraft.client.gui.screens.options.WorldOptionsScreen(this, minecraft.level))));
		//#endif
		//#if MC < 26.2
		//$ // before world options: "Open to LAN" as the game's own menu has it, in singleplayer until the world is open
		//$ if (minecraft.hasSingleplayerServer() && !minecraft.getSingleplayerServer().isPublished())
		//$ 	items.add(new Nav(Ui.tr("menu.shareToLan"), "world", () -> minecraft.setScreenAndShow(new net.minecraft.client.gui.screens.ShareToLanScreen(this))));
		//#endif
		serverExtras(items);
		items.add(new Nav(CommonComponents.disconnectButtonLabel(minecraft.isLocalServer()), "power", this::leave, true));
		return items;
	}

	/** What the server adds to the game's pause menu: its links (and on 1.21.6+ its own dialogs), as the game shows them. */
	private void serverExtras(List<Nav> items) {
		if (minecraft.player == null) return;
		var connection = minecraft.player.connection;
		//#if MC >= 1.21.6
		var dialogs = connection.registryAccess().lookupOrThrow(net.minecraft.core.registries.Registries.DIALOG);
		var added = dialogs.get(net.minecraft.tags.DialogTags.PAUSE_SCREEN_ADDITIONS);
		java.util.Optional<? extends net.minecraft.core.Holder<net.minecraft.server.dialog.Dialog>> extra = java.util.Optional.empty();
		if (added.isPresent() && added.get().size() > 0)
			extra = added.get().size() == 1 ? java.util.Optional.of(added.get().get(0)) : dialogs.get(net.minecraft.server.dialog.Dialogs.CUSTOM_OPTIONS);
		else if (!connection.serverLinks().isEmpty()) extra = dialogs.get(net.minecraft.server.dialog.Dialogs.SERVER_LINKS);
		extra.ifPresent(dialog -> items.add(new Nav(dialog.value().common().computeExternalTitle(), "server", () -> connection.showDialog(dialog, this))));
		//#endif
		//#if MC >= 1.21 && MC < 1.21.6
		//$ if (!connection.serverLinks().isEmpty())
		//$ 	items.add(new Nav(Ui.tr("menu.server_links"), "server", () -> minecraft.setScreenAndShow(new net.minecraft.client.gui.screens.multiplayer.ServerLinksScreen(this, connection.serverLinks()))));
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
		//#if MC >= 1.21.2
		minecraft.getReportingContext().draftReportHandled(minecraft, this, () -> dev.slash3rss.slashclient.hud.Compat.leaveWorld(minecraft, ClientLevel.DEFAULT_QUIT_MESSAGE), true);
		//#else
		//$ minecraft.getReportingContext().draftReportHandled(minecraft, this, () -> dev.slash3rss.slashclient.hud.Compat.leaveWorld(minecraft, Component.translatable(minecraft.isLocalServer() ? "menu.savingLevel" : "disconnect.quitting")), true);
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
		// the brand and "Game Paused" above the panel, when there is room for them
		boolean header = ph + 34 + 12 <= height;
		int top = Math.max(6, (height - (header ? 34 : 0) - ph) / 2);
		if (header) {
			Ui.brand(g, (width - Ui.brandWidth(1.3f)) / 2, top, 1.3f);
			Component paused = Ui.tr("menu.paused");
			Ui.drawOnWorld(g, paused, (width - Ui.width(paused)) / 2, top + 18, Ui.TEXT_2);
		}
		drawMenu(g, mx, my, (width - pw) / 2, top + (header ? 34 : 0), pw, items, tools());
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
