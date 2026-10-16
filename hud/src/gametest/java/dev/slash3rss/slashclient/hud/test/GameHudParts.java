package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The game's own HUD parts made adjustable: a scoreboard (smaller, higher, no red numbers),
 * a boss bar, a title, the tab list with the ping in milliseconds and your own name in F5.
 */
public class GameHudParts implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		context.runOnClient(mc -> TestHooks.gameParts());
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
			}) world.getServer().runCommand(cmd);
			context.waitTicks(40);
			context.runOnClient(mc -> TestHooks.thirdPerson(true));
			context.getInput().holdKey(o -> o.keyPlayerList);
			context.waitTicks(20);
			context.takeScreenshot("game-hud-parts");
			context.getInput().releaseKey(o -> o.keyPlayerList);
			context.runOnClient(mc -> TestHooks.thirdPerson(false));
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
