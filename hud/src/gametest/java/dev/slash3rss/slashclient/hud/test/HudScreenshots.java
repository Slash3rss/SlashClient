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
		if (TestFilter.skip(context, getClass())) return;
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

		// pinned partner servers first in the multiplayer list (the game's own list here: ours has GameServerList)
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.customServerList = false);
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
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.customServerList = true);
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
			// snapping: a module dragged close beside another lands right next to it, top edges level
			context.runOnClient(mc -> TestHooks.snapDrag(true));
			context.waitTicks(2);
			context.takeScreenshot("hud-editor-snap");
			String snapped = context.computeOnClient(mc -> TestHooks.snapDrag(false));
			if (!snapped.equals("ok")) throw new AssertionError("module snapping: " + snapped);
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
				if (sz[0] == 1920 && sz[2] == 2) {
					// a card's name too long for it slides through while the mouse is on the card
					context.setScreen(() -> HudEditScreen.category("chat"));
					context.waitTicks(5);
					double[] card = context.computeOnClient(mc -> TestHooks.cardCenter("chatWindowsOnly"));
					if (card == null) throw new AssertionError("the card of pulled-out tabs is not on the screen");
					context.getInput().setCursorPos(card[0], card[1]);
					context.waitTicks(10);
					context.takeScreenshot("hud-card-name-start");
					context.waitTicks(50);
					context.takeScreenshot("hud-card-name-slid");
					context.getInput().setCursorPos(0, 0);
				}
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

			// a private message before the tab comes out: the window must start with it, not empty
			world.getServer().runCommand("tellraw @a \"[MSG] Steve -> me: written before the window\"");
			context.waitTicks(3);
			// pulling the "PM" tab out of the row with the mouse: it becomes a window of its own
			double[] pm = context.computeOnClient(mc -> TestHooks.chatTabCenter("PM"));
			if (pm == null) throw new AssertionError("No PM tab in the chat");
			// Esc in the middle of the drag: back in the chat, nothing follows the cursor and the tab is still in the row
			context.runOnClient(mc -> TestHooks.mouse("press", pm));
			context.runOnClient(mc -> TestHooks.mouse("drag", new double[] { pm[0] + 20, pm[1] - 40 }));
			context.runOnClient(mc -> TestHooks.mouse("drag", new double[] { 330, 90 }));
			if (context.computeOnClient(mc -> TestHooks.chatTabDragging()) < 0) throw new AssertionError("The PM tab was not being dragged out");
			context.setScreen(() -> null);
			context.waitTicks(2);
			context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
			context.waitTicks(3);
			if (context.computeOnClient(mc -> TestHooks.chatTabDragging()) >= 0) throw new AssertionError("After Esc mid-drag the tab is still stuck to the cursor");
			if (!"docked".equals(context.computeOnClient(mc -> TestHooks.chatTabState("PM")))) throw new AssertionError("Esc mid-drag pulled the PM tab out");
			context.runOnClient(mc -> TestHooks.mouse("press", pm));
			context.runOnClient(mc -> TestHooks.mouse("drag", new double[] { pm[0] + 20, pm[1] - 40 }));
			context.runOnClient(mc -> TestHooks.mouse("drag", new double[] { 330, 90 }));
			context.waitTicks(2);
			context.takeScreenshot("chat-window-dragging");
			context.runOnClient(mc -> TestHooks.mouse("release", new double[] { 330, 90 }));
			context.waitTicks(5);
			if (!"pulled-out".equals(context.computeOnClient(mc -> TestHooks.chatTabState("PM")))) throw new AssertionError("The PM tab did not come out of the chat");
			if (context.computeOnClient(mc -> TestHooks.chatWindowLines("PM")) < 1) throw new AssertionError("The pulled-out PM window did not start with the earlier message");
			// "All" still shows everything, unless the setting keeps a window's lines to the window
			if (!context.computeOnClient(mc -> TestHooks.visibleChat()).contains("written before the window")) throw new AssertionError("\"All\" lost the pulled-out tab's line: " + context.computeOnClient(mc -> TestHooks.visibleChat()));
			context.runOnClient(mc -> TestHooks.chatWindowsOnly(true));
			context.waitTicks(2);
			if (context.computeOnClient(mc -> TestHooks.visibleChat()).contains("written before the window")) throw new AssertionError("With the setting on, \"All\" still shows the window's line");
			context.runOnClient(mc -> TestHooks.chatWindowsOnly(false));
			context.waitTicks(2);
			world.getServer().runCommand("tellraw @a \"[MSG] Steve -> me: are you coming?\"");
			world.getServer().runCommand("tellraw @a \"[MSG] Alex -> me: ok, see you\"");
			world.getServer().runCommand("tellraw @a \"Hello again everyone\"");
			context.waitTicks(5);
			if (context.computeOnClient(mc -> TestHooks.chatWindowLines("PM")) < 2) throw new AssertionError("The PM window got no lines");
			context.takeScreenshot("chat-window-open");
			// with the GUI hidden (F1) the window goes away whole: no × left floating on its own
			context.runOnClient(mc -> TestHooks.hideGui(true));
			context.setScreen(() -> null);
			context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
			context.waitTicks(2);
			context.takeScreenshot("chat-window-hidden-gui");
			context.runOnClient(mc -> TestHooks.hideGui(false));
			context.setScreen(() -> null);
			context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
			context.waitTicks(2);
			// its corner grip: dragged right and down, the window gets wider and shows more lines
			double[] grip = context.computeOnClient(mc -> TestHooks.chatWindowGrip("PM"));
			if (grip == null) throw new AssertionError("The PM window has no corner grip");
			String before = context.computeOnClient(mc -> TestHooks.chatWindowSize("PM"));
			context.runOnClient(mc -> TestHooks.mouse("press", grip));
			context.runOnClient(mc -> TestHooks.mouse("drag", new double[] { grip[0] + 80, grip[1] + 36 }));
			context.runOnClient(mc -> TestHooks.mouse("release", new double[] { grip[0] + 80, grip[1] + 36 }));
			context.waitTicks(2);
			String after = context.computeOnClient(mc -> TestHooks.chatWindowSize("PM"));
			if (!"210x8".equals(before) || !"290x12".equals(after)) throw new AssertionError("Resizing the PM window: " + before + " -> " + after);
			context.takeScreenshot("chat-window-resized");
			// a server's [Odpowiedz] in the window: its hover shows, and a click types its command in the chat
			//#if MC >= 1.21.5
			world.getServer().runCommand("tellraw @a [\"[MSG] Steve -> me: \",{\"text\":\"[Odpowiedz]\",\"color\":\"aqua\",\"click_event\":{\"action\":\"suggest_command\",\"command\":\"/msg Steve \"},\"hover_event\":{\"action\":\"show_text\",\"value\":\"Kliknij, aby odpisać\"}}]");
			//#else
			//$ world.getServer().runCommand("tellraw @a [\"[MSG] Steve -> me: \",{\"text\":\"[Odpowiedz]\",\"color\":\"aqua\",\"clickEvent\":{\"action\":\"suggest_command\",\"value\":\"/msg Steve \"},\"hoverEvent\":{\"action\":\"show_text\",\"contents\":\"Kliknij, aby odpisać\"}}]");
			//#endif
			context.waitTicks(5);
			double[] reply = context.computeOnClient(mc -> TestHooks.chatWindowClickable());
			if (reply == null) throw new AssertionError("No clickable [Odpowiedz] in the PM window");
			double guiScale = context.computeOnClient(mc -> mc.getWindow().getGuiScale());
			context.getInput().setCursorPos(reply[0] * guiScale, reply[1] * guiScale);
			context.waitTicks(3);
			context.takeScreenshot("chat-window-hover");
			context.runOnClient(mc -> TestHooks.mouse("press", reply));
			context.runOnClient(mc -> TestHooks.mouse("release", reply));
			context.waitTicks(2);
			String typed = context.computeOnClient(mc -> TestHooks.chatInput());
			if (!"/msg Steve ".equals(typed)) throw new AssertionError("A click on [Odpowiedz] in the window typed: " + typed);
			reopenChat(context);
			chatTabTyping(context);
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
		try (var server = context.worldBuilder().createServer(freePort()); var connection = server.connect()) {
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

	/** Reopens the chat, so its widgets are made again for changed tab settings. */
	private static void reopenChat(ClientGameTestContext context) {
		context.setScreen(() -> null);
		context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
		context.waitTicks(2);
	}

	private static void clickField(ClientGameTestContext context, String tab) {
		double[] at = context.computeOnClient(mc -> TestHooks.chatFieldCenter(tab));
		if (at == null) throw new AssertionError("The " + tab + " window has no typing line");
		context.runOnClient(mc -> TestHooks.mouse("press", at));
		context.runOnClient(mc -> TestHooks.mouse("release", at));
		context.waitTicks(1);
		String focus = context.computeOnClient(mc -> TestHooks.chatFocus());
		if (!("window:" + tab).equals(focus)) throw new AssertionError("A click on the " + tab + " window's line did not put the cursor there: " + focus);
	}

	private static void expectSent(ClientGameTestContext context, String expected, String what) {
		String got = context.computeOnClient(mc -> TestHooks.takeOutgoing());
		if (!expected.equals(got)) throw new AssertionError(what + ": expected \"" + expected + "\", sent \"" + got + "\"");
	}

	/**
	 * A pulled-out tab's own typing line and the tabs' reply prefix (the chat is open with the PM
	 * window out): off by default, then typing in the window, Enter, Esc, an empty line, history,
	 * a command of the player's own, and the open tab's prefix in the chat's own line.
	 */
	private static void chatTabTyping(ClientGameTestContext context) {
		var keys = context.getInput();
		if (context.computeOnClient(mc -> TestHooks.chatFieldCenter("PM")) != null) throw new AssertionError("A window has a typing line without the setting");
		context.runOnClient(mc -> TestHooks.captureOutgoing(true));
		try {
			// the line on, without a prefix: what is typed goes as a plain message
			context.runOnClient(mc -> TestHooks.chatTabTyping("PM", true, ""));
			reopenChat(context);
			clickField(context, "PM");
			keys.typeChars("hello there");
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_RETURN);
			context.waitTicks(2);
			expectSent(context, "chat:hello there", "The window's line without a prefix");
			if (context.computeOnClient(mc -> TestHooks.chatOpen())) throw new AssertionError("Enter in the window's line left the chat open");

			// with a prefix: it is written dim in front and goes before the message
			context.runOnClient(mc -> TestHooks.chatTabTyping("PM", true, "/msg Steve "));
			reopenChat(context);
			context.takeScreenshot("chattab-window-field");
			clickField(context, "PM");
			keys.typeChars("are you coming?");
			context.waitTicks(2);
			context.takeScreenshot("chattab-window-typing");
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_RETURN);
			context.waitTicks(2);
			expectSent(context, "command:/msg Steve are you coming?", "The window's line with a command prefix");

			// Esc leaves the line for the chat's own, sending nothing and keeping the chat open
			reopenChat(context);
			clickField(context, "PM");
			keys.typeChars("not this");
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_ESCAPE);
			context.waitTicks(2);
			if (!context.computeOnClient(mc -> TestHooks.chatOpen())) throw new AssertionError("Esc in the window's line closed the chat");
			if (!"chat".equals(context.computeOnClient(mc -> TestHooks.chatFocus()))) throw new AssertionError("Esc in the window's line did not go back to the chat's line");
			expectSent(context, "", "Esc in the window's line");
			// Up in the window's line: the last message as it was written, without the prefix
			clickField(context, "PM");
			context.runOnClient(mc -> TestHooks.chatFieldClear("PM"));
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_UP);
			context.waitTicks(1);
			String recalled = context.computeOnClient(mc -> TestHooks.chatFieldValue("PM"));
			if (!"are you coming?".equals(recalled)) throw new AssertionError("Up in the window's line gave: " + recalled);
			// an empty line (spaces only) sends nothing
			context.runOnClient(mc -> TestHooks.chatFieldClear("PM"));
			keys.typeChars("   ");
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_RETURN);
			context.waitTicks(2);
			expectSent(context, "", "An empty window line");
			// a command the player writes himself goes without the prefix
			reopenChat(context);
			clickField(context, "PM");
			keys.typeChars("/time query day");
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_RETURN);
			context.waitTicks(2);
			expectSent(context, "command:/time query day", "A command typed in the window's line");
			// a chat prefix ("@") and a command prefix without its space ("/g")
			context.runOnClient(mc -> TestHooks.chatTabTyping("PM", true, "@"));
			reopenChat(context);
			clickField(context, "PM");
			keys.typeChars("hi all");
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_RETURN);
			context.waitTicks(2);
			expectSent(context, "chat:@hi all", "The window's line with a chat prefix");

			// the setting off again: no line, and the window as before
			context.runOnClient(mc -> TestHooks.chatTabTyping("PM", false, "/g"));
			reopenChat(context);
			if (context.computeOnClient(mc -> TestHooks.chatFieldCenter("PM")) != null) throw new AssertionError("The typing line stayed after it was switched off");

			// the chat's own line while a docked tab with a prefix is open: the prefix goes in front
			context.runOnClient(mc -> TestHooks.chatTabTyping("@", false, "/g"));
			context.runOnClient(mc -> TestHooks.selectChatTab("@"));
			context.waitTicks(1);
			if (context.computeOnClient(mc -> TestHooks.chatInputX()) <= 4) throw new AssertionError("The chat's line did not move over for the open tab's prefix");
			keys.typeChars("team meeting");
			context.waitTicks(2);
			context.takeScreenshot("chattab-main-prefix");
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_RETURN);
			context.waitTicks(2);
			expectSent(context, "command:/g team meeting", "The chat's line with the open tab's prefix");
			// "All" open: the same line goes as it is
			reopenChat(context);
			context.runOnClient(mc -> TestHooks.selectChatTab(""));
			if (context.computeOnClient(mc -> TestHooks.chatInputX()) != 4) throw new AssertionError("On \"All\" the chat's line is not back in its place");
			keys.typeChars("plain message");
			keys.pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_RETURN);
			context.waitTicks(2);
			expectSent(context, "chat:plain message", "The chat's line on \"All\"");

			// the settings: a tab's more settings line with the prefix and the switch
			context.runOnClient(mc -> TestHooks.chatTabTyping("PM", true, "/msg Steve "));
			context.runOnClient(mc -> TestHooks.chatTabSound("PM", "pling"));
			context.setScreen(() -> new HudEditScreen("chatTabs").tabMore(1));
			context.waitTicks(10);
			context.takeScreenshot("chattab-settings");
			// a mention the PM tab catches rings its own sound; one no tab with a sound catches, the bell
			String me = context.computeOnClient(mc -> mc.player.getName().getString());
			String pm = context.computeOnClient(mc -> TestHooks.mentionSoundFor("[MSG] Steve -> me: hej " + me));
			String plain = context.computeOnClient(mc -> TestHooks.mentionSoundFor("<Alex> hej " + me));
			context.runOnClient(mc -> TestHooks.chatTabSound("PM", "none"));
			String muted = context.computeOnClient(mc -> TestHooks.mentionSoundFor("[MSG] Steve -> me: cisza " + me));
			context.runOnClient(mc -> TestHooks.chatTabSound("PM", ""));
			if (!"pling".equals(pm) || !"".equals(plain) || !"none".equals(muted)) throw new AssertionError("Mention sounds per tab: " + pm + " / " + plain + " / " + muted);
		} finally {
			context.runOnClient(mc -> TestHooks.captureOutgoing(false));
			context.runOnClient(mc -> TestHooks.chatTabTyping("PM", false, ""));
			context.runOnClient(mc -> TestHooks.chatTabTyping("@", false, ""));
			context.runOnClient(mc -> TestHooks.selectChatTab(""));
		}
		context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
		context.waitTicks(2);
	}

	/**
	 * The test server on a port nothing else uses (not 25565): several game test runs, in
	 * different worktrees, can then go at the same time.
	 */
	private static java.util.Properties freePort() {
		java.util.Properties properties = new java.util.Properties();
		try (java.net.ServerSocket socket = new java.net.ServerSocket(0)) {
			properties.setProperty("server-port", String.valueOf(socket.getLocalPort()));
		} catch (java.io.IOException e) {
			// no free port to be found: the server's default
		}
		return properties;
	}
}
