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

		// pinned partner servers first in the multiplayer list
		context.runOnClient(mc -> TestHooks.checkPinnedServer());
		context.setScreen(() -> new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(new net.minecraft.client.gui.screens.TitleScreen()));
		context.waitTicks(20);
		context.getInput().setCursorPos(427, 98);
		context.getInput().pressMouse(0);
		context.waitTicks(5);
		boolean deleteActive = context.computeOnClient(mc -> TestHooks.buttonActive("selectServer.delete"));
		boolean editActive = context.computeOnClient(mc -> TestHooks.buttonActive("selectServer.edit"));
		if (deleteActive || !editActive) throw new AssertionError("A pinned server: Delete greyed out, Edit available (for the resource pack)");
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
				context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
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
			context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
			context.waitTicks(5);
			context.takeScreenshot("chat-all");
			context.runOnClient(mc -> TestHooks.selectTab(0));
			context.waitTicks(5);
			context.takeScreenshot("chat-mentions-tab");
			context.runOnClient(mc -> TestHooks.selectTab(-1));
			// with the tabs there, the up arrow still brings back the last message sent (not the "All" tab)
			context.runOnClient(mc -> TestHooks.rememberSent("/say last one"));
			context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
			context.waitTicks(3);
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_UP);
			context.waitTicks(2);
			String recalled = context.computeOnClient(mc -> TestHooks.chatInput());
			if (!"/say last one".equals(recalled)) throw new AssertionError("Up arrow in the chat gave: " + recalled);
			context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());

			// "but not": what the second field names stays out; only it filled = everything except it
			if (!context.computeOnClient(mc -> TestHooks.tabCatches("gg", "", "[Party] Steve: gg"))
				|| context.computeOnClient(mc -> TestHooks.tabCatches("gg", "party", "[Party] Steve: gg"))
				|| !context.computeOnClient(mc -> TestHooks.tabCatches("", "party", "Hello everyone"))
				|| context.computeOnClient(mc -> TestHooks.tabCatches("", "party", "[Party] Steve: gg")))
				throw new AssertionError("The chat tab's exclusions do not work");
			// a mention is the nick as a word, not the line's own sender
			for (String[] c : new String[][] { { "Player0, are you there?", "true" }, { "<Player0> hello", "false" }, { "[VIP] Player0: hi", "false" }, { "Player01 joined", "false" }, { "hej player0 :)", "true" } }) {
				boolean got = context.computeOnClient(mc -> TestHooks.mentionCheck(c[0], "Player0"));
				if (got != Boolean.parseBoolean(c[1])) throw new AssertionError("Mention of \"" + c[0] + "\": " + got);
			}

			// pulling the "PM" tab out of the row with the mouse: it becomes a window of its own
			double[] pm = context.computeOnClient(mc -> TestHooks.chatTabCenter("PM"));
			if (pm == null) throw new AssertionError("No PM tab in the chat");
			context.runOnClient(mc -> TestHooks.mouse("press", pm));
			context.runOnClient(mc -> TestHooks.mouse("drag", new double[] { pm[0] + 20, pm[1] - 40 }));
			context.runOnClient(mc -> TestHooks.mouse("drag", new double[] { 330, 90 }));
			context.waitTicks(2);
			context.takeScreenshot("chat-window-dragging");
			context.runOnClient(mc -> TestHooks.mouse("release", new double[] { 330, 90 }));
			context.waitTicks(5);
			if (!"pulled-out".equals(context.computeOnClient(mc -> TestHooks.chatTabState("PM")))) throw new AssertionError("The PM tab did not come out of the chat");
			world.getServer().runCommand("tellraw @a \"[MSG] Steve -> me: are you coming?\"");
			world.getServer().runCommand("tellraw @a \"[MSG] Alex -> me: ok, see you\"");
			world.getServer().runCommand("tellraw @a \"Hello again everyone\"");
			context.waitTicks(5);
			if (context.computeOnClient(mc -> TestHooks.chatWindowLines("PM")) < 2) throw new AssertionError("The PM window got no lines");
			context.takeScreenshot("chat-window-open");
			// in the game: the window's lines fade like the chat's; a mention shows the "@" badge
			context.setScreen(() -> null);
			world.getServer().runCommand("tellraw @a \"Player0 look over here!\"");
			context.waitTicks(5);
			context.takeScreenshot("chat-window-game");
			context.runOnClient(mc -> TestHooks.dockAllChatTabs());

			// lots of health in one row, with absorption on top
			world.getServer().runCommand("attribute @p minecraft:max_health base set 70");
			world.getServer().runCommand("effect give @p instant_health 1 20");
			world.getServer().runCommand("effect give @p absorption 60 1");
			context.waitTicks(10);
			context.takeScreenshot("hearts-compact");
			world.getServer().runCommand("attribute @p minecraft:max_health base set 20");
			world.getServer().runCommand("effect clear @p absorption");

			// a tool nearly gone: the warning once
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:diamond_pickaxe[minecraft:damage=1555]");
			context.waitTicks(5);
			context.takeScreenshot("tool-warning");

			// the hand refill: an emptied hand gets the same blocks from the backpack
			context.runOnClient(mc -> TestHooks.assist(true));
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:cobblestone 1");
			world.getServer().runCommand("item replace entity @p inventory.10 with minecraft:cobblestone 40");
			context.waitTicks(5);
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:air");
			context.waitTicks(10);
			String hand = context.computeOnClient(mc -> TestHooks.handItem());
			if (!hand.equals("minecraft:cobblestone x40")) throw new AssertionError("hand refill: " + hand);
			context.runOnClient(mc -> TestHooks.assist(false));

			// mouse tweaks: the wheel over a hotbar stack sends one to the backpack, and brings it back
			world.getServer().runCommand("clear @p");
			world.getServer().runCommand("item replace entity @p hotbar.0 with minecraft:cobblestone 10");
			context.waitTicks(5);
			context.setScreen(() -> new net.minecraft.client.gui.screens.inventory.InventoryScreen(net.minecraft.client.Minecraft.getInstance().player));
			context.waitTicks(5);
			double[] at = context.computeOnClient(mc -> TestHooks.slotOnWindow(36));
			context.getInput().setCursorPos(at[0], at[1]);
			context.waitTicks(3);
			context.getInput().scroll(-1);
			context.waitTicks(5);
			String afterDown = context.computeOnClient(mc -> TestHooks.cobblestone());
			if (!afterDown.equals("9/1")) throw new AssertionError("wheel down should send one to the backpack: " + afterDown);
			context.getInput().scroll(1);
			context.waitTicks(5);
			String afterUp = context.computeOnClient(mc -> TestHooks.cobblestone());
			if (!afterUp.equals("10/0")) throw new AssertionError("wheel up should bring it back: " + afterUp);
			context.setScreen(() -> null);

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
			// the ping is measured with ping packets, not read from the tab list (0 on many servers)
			int ping = context.computeOnClient(mc -> TestHooks.ping());
			if (ping < 0) throw new AssertionError("No measured ping from the server");
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
