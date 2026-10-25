package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Block info's extra lines: wheat half grown, a hive full of honey (with its facing in the state),
 * the block's coordinates and id; the module on the HUD with them.
 */
public class GameBlockInfo implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("fill -2 99 -2 2 99 4 farmland");
			server.runCommand("setblock 0 100 2 minecraft:wheat[age=3]");
			server.runCommand("setblock 1 100 3 minecraft:beehive[honey_level=5,facing=north]");
			// standing south of the wheat, looking down at it
			server.runCommand("tp @a 0.5 100 0.5 0 45");
			context.waitTicks(20);
			String wheat = context.computeOnClient(mc -> TestHooks.blockInfoLines());
			check(wheat.contains("43%") && wheat.contains("(3/7)") && wheat.contains("0 100 2") && wheat.contains("minecraft:wheat"), "the wheat", wheat);
			context.takeScreenshot("blockinfo-wheat");
			server.runCommand("tp @a 1.5 100 1.5 0 20");
			context.waitTicks(20);
			String hive = context.computeOnClient(mc -> TestHooks.blockInfoLines());
			check(hive.contains("5/5") && hive.contains("facing=north") && !hive.contains("honey_level="), "the hive", hive);
			context.takeScreenshot("blockinfo-hive");
		}
	}

	private static void check(boolean ok, String what, String got) {
		if (!ok) throw new AssertionError("Block info, " + what + ":\n" + got);
	}
}
