package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The game's own HUD parts made adjustable: a scoreboard (smaller, higher, no red numbers),
 * a boss bar, a title, the tab list with the ping in milliseconds (and a header and a footer) and
 * your own name in F5. In the editor the scoreboard's and the tab list's boxes are their real size.
 */
public class GameHudParts implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.gameParts());
		// the titles closed with ✕ in the editor come back from the module list
		if (!context.computeOnClient(mc -> TestHooks.titlesBackAfterClose())) throw new AssertionError("The titles cannot be switched back on after ✕");
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			for (String cmd : new String[] {
				"scoreboard objectives add test dummy \"SlashClient\"",
				"scoreboard objectives setdisplay sidebar test",
				"scoreboard players set Gracz test 42",
				"scoreboard players set Drugi test 7",
				"bossbar add slash \"Boss SlashClient\"",
				"bossbar set slash players @a",
				"title @a times 0 200 20",
				"title @a title \"Witaj\"",
				"title @a actionbar \"Pasek akcji SlashClient\"",
			}) world.getServer().runCommand(cmd);
			context.runOnClient(mc -> TestHooks.tabHeader());
			context.waitTicks(40);
			context.runOnClient(mc -> TestHooks.thirdPerson(true));
			context.getInput().holdKey(o -> o.keyPlayerList);
			context.waitTicks(20);
			context.takeScreenshot("game-hud-parts");
			// the server's texts hidden: drawn without them, and still there for what reads them (the tab status)
			context.runOnClient(mc -> TestHooks.tabTexts(true));
			context.waitTicks(5);
			context.takeScreenshot("game-hud-tab-plain");
			// its backgrounds see-through: none under the players, a faint one behind the list (in singleplayer
			// the game shows the list only with a score in it)
			world.getServer().runCommand("scoreboard objectives add tabtest dummy");
			world.getServer().runCommand("scoreboard objectives setdisplay list tabtest");
			context.waitTicks(5);
			context.takeScreenshot("game-hud-tab-default");
			context.runOnClient(mc -> {
				dev.slash3rss.slashclient.hud.SlashHud.config.tabRowOpacity = 0;
				dev.slash3rss.slashclient.hud.SlashHud.config.tabPanelOpacity = 15;
			});
			context.waitTicks(3);
			context.takeScreenshot("game-hud-tab-clear");
			context.runOnClient(mc -> {
				dev.slash3rss.slashclient.hud.SlashHud.config.tabRowOpacity = dev.slash3rss.slashclient.hud.HudConfig.TAB_ROW_DEFAULT;
				dev.slash3rss.slashclient.hud.SlashHud.config.tabPanelOpacity = dev.slash3rss.slashclient.hud.HudConfig.TAB_PANEL_DEFAULT;
			});
			world.getServer().runCommand("scoreboard objectives remove tabtest");
			String kept = context.computeOnClient(mc -> TestHooks.tabTexts(false));
			if (!kept.equals("SlashClient\nNagłówek listy graczy, dość długi|Stopka")) throw new AssertionError("The tab list's texts after drawing it without them: " + kept);
			context.getInput().releaseKey(o -> o.keyPlayerList);
			context.runOnClient(mc -> TestHooks.thirdPerson(false));
			// dragged in the editor: the scoreboard on the left edge, the action bar in the middle
			context.runOnClient(mc -> TestHooks.moveGameParts());
			world.getServer().runCommand("title @a actionbar \"Pasek akcji SlashClient\"");
			int[] board = context.computeOnClient(mc -> TestHooks.gamePartBox("scoreboard"));
			if (board[0] != 4) throw new AssertionError("The scoreboard's box is not on the left: x=" + board[0]);
			// as tall as the game draws it: the title and two lines, 9 pixels each and 1 more, at 0.8
			if (board[3] != Math.round(28 * 0.8f)) throw new AssertionError("The scoreboard's box is not its real height: h=" + board[3]);
			context.waitTicks(5);
			context.takeScreenshot("game-hud-parts-moved");
			// the editor: the parts as boxes, and the armour at its biggest
			context.setScreen(dev.slash3rss.slashclient.hud.HudEditScreen::new);
			context.waitTicks(5);
			context.takeScreenshot("game-hud-parts-editor");
			// nothing on the scoreboard and no action bar: samples in their boxes
			world.getServer().runCommand("scoreboard objectives remove test");
			world.getServer().runCommand("title @a clear");
			context.waitTicks(80);
			context.takeScreenshot("game-hud-parts-editor-samples");
			context.setScreen(() -> null);
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
