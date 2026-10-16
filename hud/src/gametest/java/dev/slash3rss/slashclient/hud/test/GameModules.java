package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Durability, ammo, compass, sky, K/D, block info, hit strength, TPS and the FPS graph in a
 * world, then every new module in the layout editor.
 */
public class GameModules implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			context.runOnClient(mc -> TestHooks.extraModules(true));
			for (String cmd : new String[] {
				"item replace entity @a weapon.mainhand with diamond_pickaxe[damage=1500]",
				"item replace entity @a weapon.offhand with bow",
				"item replace entity @a armor.chest with elytra",
				"give @a arrow 12",
				"give @a firework_rocket 5",
				"setblock ~ ~1 ~3 diamond_ore",
				"time set 11000",
				"weather rain",
				"summon chicken ~ ~ ~1.5 {Health:1f,NoAI:1b}",
			}) world.getServer().runCommand(cmd);
			context.waitTicks(20);
			if (!context.computeOnClient(mc -> TestHooks.attackNearest())) throw new AssertionError("Nothing to hit");
			context.waitTicks(5);
			context.takeScreenshot("modules-in-game");
			context.waitTicks(20);
			String stats = context.computeOnClient(mc -> TestHooks.moduleStats());
			String[] st = stats.split(" ");
			if (!"1".equals(st[0])) throw new AssertionError("The kill was not counted: " + stats);
			if (Double.parseDouble(st[2]) < 15) throw new AssertionError("TPS looks wrong: " + stats);

			context.setScreen(dev.slash3rss.slashclient.hud.HudEditScreen::new);
			context.waitTicks(5);
			context.takeScreenshot("modules-editor");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.extraModules(false));
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
