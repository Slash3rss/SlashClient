package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** What first person shows: the looked-at block's outline in our colour, a low shield and smaller held items. */
public class GameHandView implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			// a block at eye height two blocks south, looked at; a sword in the main hand and a shield in the other
			world.getServer().runCommand("execute as @p at @s run setblock ~ ~1 ~2 minecraft:gold_block");
			context.runOnClient(mc -> TestHooks.lookSouth());
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:diamond_sword");
			world.getServer().runCommand("item replace entity @p weapon.offhand with minecraft:shield");
			context.runOnClient(mc -> {
				TestHooks.firstPerson();
				TestHooks.handView(false, false);
			});
			context.waitTicks(20);
			String hit = context.computeOnClient(mc -> TestHooks.hitKind());
			if (!hit.equals("block")) throw new AssertionError("The crosshair is not on the block: " + hit);
			context.takeScreenshot("handview-vanilla");
			String before = context.computeOnClient(mc -> TestHooks.handViewCounts());
			if (!before.equals("0,0")) throw new AssertionError("Changed while switched off: " + before);

			context.runOnClient(mc -> TestHooks.handView(true, true));
			context.waitTicks(10);
			String[] after = context.computeOnClient(mc -> TestHooks.handViewCounts()).split(",");
			if (Integer.parseInt(after[0]) < 1) throw new AssertionError("The outline was not drawn in our colour");
			// both hands each frame: the sword (smaller) and the shield (lower and smaller)
			if (Integer.parseInt(after[1]) < 2) throw new AssertionError("The held items were not changed");
			context.takeScreenshot("handview-custom");
			context.runOnClient(mc -> TestHooks.handView(false, false));
		}
	}
}
