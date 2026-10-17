package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.ChatScreen;

/** Plays a little and takes screenshots, so the HUD and the extras can be checked by eye. */
public class HudScreenshots implements FabricClientGameTest {
	/** Window size and GUI scale: from the smallest screen Minecraft allows to Full HD. */
	private static final int[][] SIZES = { { 640, 480, 2 }, { 854, 480, 2 }, { 1920, 1080, 4 }, { 1024, 768, 2 }, { 1280, 720, 2 }, { 1920, 1080, 2 } };

	private static void size(ClientGameTestContext context, int[] s) {
		context.getInput().resizeWindow(s[0], s[1]);
		context.runOnClient(mc -> TestHooks.guiScale(s[2]));
		context.waitTicks(3);
	}

	private static String name(int[] s) {
		return s[0] + "x" + s[1] + "-gui" + s[2];
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		// the friends test alone (with a launcher bridge) skips the long screenshot tour
		if (Boolean.getBoolean("slashclient.test.friendsOnly")) {
			// the runner wants every test to end on the game's own title screen
			context.runOnClient(mc -> TestHooks.vanillaMenu());
			return;
		}
		context.runOnClient(mc -> TestHooks.audit(true));
		// every screen at every size: does everything fit?
		context.waitTicks(40);
		for (int[] s : SIZES) {
			size(context, s);
			context.takeScreenshot("size-" + name(s) + "-menu");
		}
		size(context, SIZES[1]);
		// the game starts on the main menu: ours, then the game's own with the button back
		context.waitTicks(40);
		context.takeScreenshot("main-menu");
		context.runOnClient(mc -> TestHooks.vanillaMenu());
		context.waitTicks(10);
		context.takeScreenshot("main-menu-vanilla");
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.waitTicks(5);

		// the HUD editor opened from the main menu, before any world: item icons can't be made
		// yet there (components are bound only with a world), which used to crash the game
		context.runOnClient(mc -> TestHooks.allModules());
		context.setScreen(HudEditScreen::settingsWindow);
		context.waitTicks(10);
		context.takeScreenshot("editor-main-menu");
		context.setScreen(() -> null);
		context.waitTicks(5);

		// SkyUp.pl pinned first in the multiplayer list
		context.runOnClient(mc -> TestHooks.checkPinnedServer());
		context.setScreen(() -> new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(new net.minecraft.client.gui.screens.TitleScreen()));
		context.waitTicks(20);
		context.getInput().setCursorPos(427, 98);
		context.getInput().pressMouse(0);
		context.waitTicks(5);
		boolean deleteActive = context.computeOnClient(mc -> TestHooks.buttonActive("selectServer.delete"));
		boolean editActive = context.computeOnClient(mc -> TestHooks.buttonActive("selectServer.edit"));
		if (deleteActive || editActive) throw new AssertionError("Edit and Delete must be greyed out for SkyUp.pl");
		context.getInput().setCursorPos(150, 98);
		context.waitTicks(5);
		context.takeScreenshot("servers-pinned-hover");
		context.getInput().setCursorPos(150, 170);
		context.waitTicks(5);
		context.takeScreenshot("servers-second-hover");
		// a partner server's picture behind its row
		context.runOnClient(mc -> TestHooks.samplePartner("skyup.pl"));
		context.getInput().setCursorPos(10, 10);
		context.waitTicks(40);
		context.takeScreenshot("servers-partner");
		context.setScreen(() -> null);
		context.waitTicks(5);

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			// gear and effects so the armour, item and effect modules have something to show
			for (String cmd : new String[] {
				"item replace entity @p armor.head with diamond_helmet",
				"item replace entity @p armor.chest with iron_chestplate",
				"item replace entity @p armor.legs with golden_leggings",
				"item replace entity @p armor.feet with diamond_boots",
				"item replace entity @p weapon.mainhand with diamond_sword",
				"give @p ender_pearl 16",
				"give @p arrow 48",
				"give @p totem_of_undying 1",
				"effect give @p speed 300 1",
				"effect give @p night_vision 600 0",
				"summon zombie ~ ~ ~3 {NoAI:1b}",
			}) world.getServer().runCommand(cmd);
			context.waitTicks(60);
			context.getInput().holdKey(o -> o.keyUp);
			context.waitTicks(10);
			context.takeScreenshot("hud-in-game");
			context.getInput().releaseKey(o -> o.keyUp);
			// the advancement toasts from the armour would cover the editor
			context.waitTicks(160);
			context.setScreen(HudEditScreen::new);
			context.waitTicks(5);
			context.takeScreenshot("hud-editor");
			context.setScreen(HudEditScreen::settingsWindow);
			context.waitTicks(5);
			context.takeScreenshot("hud-editor-window");
			context.setScreen(() -> new HudEditScreen("crosshair"));
			context.waitTicks(5);
			context.takeScreenshot("hud-editor-settings");
			context.setScreen(() -> HudEditScreen.category("share"));
			context.waitTicks(5);
			context.takeScreenshot("hud-editor-share");

			for (int[] sz : SIZES) {
				size(context, sz);
				context.setScreen(HudEditScreen::new);
				context.waitTicks(3);
				context.takeScreenshot("size-" + name(sz) + "-layout");
				context.setScreen(HudEditScreen::settingsWindow);
				context.waitTicks(3);
				context.takeScreenshot("size-" + name(sz) + "-window");
				context.setScreen(() -> new HudEditScreen("crosshair"));
				context.waitTicks(3);
				context.takeScreenshot("size-" + name(sz) + "-settings");
				context.setScreen(() -> new HudEditScreen("fps"));
				context.waitTicks(3);
				context.takeScreenshot("size-" + name(sz) + "-module");
				context.setScreen(() -> HudEditScreen.category("share"));
				context.waitTicks(3);
				context.takeScreenshot("size-" + name(sz) + "-share");
				context.setScreen(() -> new dev.slash3rss.slashclient.hud.ChatTabsScreen(null));
				context.waitTicks(3);
				context.takeScreenshot("size-" + name(sz) + "-chattabs");
				context.setScreen(() -> new ChatScreen("", false));
				context.waitTicks(3);
				context.takeScreenshot("size-" + name(sz) + "-chat");
			}
			size(context, SIZES[1]);
			context.runOnClient(mc -> TestHooks.reportAudit());

			// every module on, to see that nothing overlaps
			context.runOnClient(mc -> HudEditScreen.enableAll());
			context.setScreen(() -> null);
			context.waitTicks(5);
			context.takeScreenshot("hud-all-modules");

			// extras: own crosshair, zoom held, time stamps
			context.runOnClient(mc -> TestHooks.extras());
			context.getInput().holdKey(TestHooks::zoomKey);
			context.waitTicks(20);
			context.takeScreenshot("extras-zoom-crosshair");
			context.getInput().releaseKey(TestHooks::zoomKey);

			// chat tabs: a few lines, then the "@" tab that catches the player's name
			world.getServer().runCommand("tellraw @a \"Hello everyone\"");
			world.getServer().runCommand("tellraw @a \"Player0, are you there?\"");
			world.getServer().runCommand("tellraw @a \"[Party] Steve: gg\"");
			context.waitTicks(5);
			context.setScreen(() -> new ChatScreen("", false));
			context.waitTicks(5);
			context.takeScreenshot("chat-all");
			context.runOnClient(mc -> TestHooks.selectTab(0));
			context.waitTicks(5);
			context.takeScreenshot("chat-mentions-tab");
			context.runOnClient(mc -> TestHooks.selectTab(-1));

			// sharing: a code made here must give the same settings back
			context.runOnClient(mc -> TestHooks.shareRoundTrip());
			// the test runner expects to end on the game's own title screen
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
			context.setScreen(() -> null);
		}

		// the logo on the tab list needs multiplayer: a real dedicated server
		context.runOnClient(mc -> TestHooks.badgeServer("http://localhost:8787"));
		context.runOnClient(mc -> TestHooks.defaults());
		try (var server = context.worldBuilder().createServer(); var connection = server.connect()) {
			//#if MC >= 26.2
			connection.waitForChunksRender();
			//#else
			//$ context.waitTicks(100);
			//#endif
			// the game's own "chat cannot be verified" toast would cover the tab list
			context.waitTicks(240);
			context.getInput().holdKey(o -> o.keyPlayerList);
			context.waitTicks(5);
			context.takeScreenshot("badge-tab");
			// as most players see it: Full HD at the automatic GUI scale
			size(context, new int[] { 1920, 1080, 3 });
			context.waitTicks(5);
			context.takeScreenshot("badge-tab-fullhd");
			context.getInput().releaseKey(o -> o.keyPlayerList);
			size(context, SIZES[1]);
			context.runOnClient(mc -> TestHooks.logBadge());
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}
}
