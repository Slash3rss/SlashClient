package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Rounded modules: the HUD-wide corners (the keystrokes' keys too), one module with its own,
 * and one with the accent frame following its corners; a module without its own takes the HUD's.
 */
public class GameHudRound implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			String radii = context.computeOnClient(mc -> {
				var c = SlashHud.config;
				c.cornerRadius = 4;
				c.placement("fps").radius = 8;
				c.placement("coords").outline = true;
				c.placement("keystrokes").enabled = true;
				return c.placement("fps").radius(c) + " " + c.placement("coords").radius(c);
			});
			if (!radii.equals("8 4")) throw new AssertionError("Corner radii (own, HUD-wide): " + radii);
			context.waitTicks(5);
			context.takeScreenshot("hud-rounded");
			// the game's scoreboard and tab list (with the server's texts above and below) rounded too
			for (String cmd : new String[] {
				"scoreboard objectives add round dummy \"SlashClient\"",
				"scoreboard objectives setdisplay sidebar round",
				"scoreboard objectives setdisplay list round",
				"scoreboard players set Gracz round 42",
				"scoreboard players set Drugi round 7",
			}) world.getServer().runCommand(cmd);
			context.runOnClient(mc -> {
				TestHooks.tabHeader();
				// the scoreboard where the game puts it, at its own size (other tests move it)
				var p = SlashHud.config.placement("scoreboard");
				p.ax = 1f;
				p.ay = 0.5f;
				p.dx = 0;
				p.dy = 0;
				SlashHud.config.scoreboardScale = 1f;
			});
			context.waitTicks(40);
			context.getInput().holdKey(o -> o.keyPlayerList);
			context.waitTicks(20);
			context.takeScreenshot("hud-rounded-parts");
			context.getInput().releaseKey(o -> o.keyPlayerList);
			context.runOnClient(mc -> {
				var c = SlashHud.config;
				c.cornerRadius = 0;
				c.placement("fps").radius = null;
				c.placement("coords").outline = false;
			});
		}
	}
}
