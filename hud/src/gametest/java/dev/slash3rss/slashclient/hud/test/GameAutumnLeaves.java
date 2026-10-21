package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Autumn leaves on our own player: both leaf auras (golden, and red, brown and golden) falling around
 * the player standing still, both leaf rings lying under the feet and kicking leaves up when walking,
 * and the aura and ring tabs of the cosmetics menu with the figure wearing them.
 */
public class GameAutumnLeaves implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> { TestHooks.ringMoveEffects(true, true, true); TestHooks.lookSouth(); TestHooks.cosmeticsSelf(null, true); });
			// the auras: leaves keep falling around the player standing still
			for (String variant : new String[] {"gold", "autumn"}) {
				int before = context.computeOnClient(mc -> TestHooks.leavesMade());
				context.runOnClient(mc -> TestHooks.wear("aura", "leaves_" + variant));
				context.waitTicks(70);
				int made = context.computeOnClient(mc -> TestHooks.leavesMade()) - before;
				if (made < 10) throw new AssertionError("The " + variant + " leaf aura made only " + made + " leaves");
				context.takeScreenshot("leaves-aura-" + variant);
			}
			context.runOnClient(mc -> TestHooks.wear("aura", null));
			context.waitTicks(100);
			// the rings: leaves lying under the feet, from the front; walking kicks some up (seen from behind)
			for (String variant : new String[] {"gold", "autumn"}) {
				context.runOnClient(mc -> { TestHooks.wear("ring", "ring_leaves_" + variant); TestHooks.cosmeticsSelf(null, true); mc.player.setXRot(0); });
				context.waitTicks(4);
				int still = context.computeOnClient(mc -> TestHooks.leavesMade());
				context.waitTicks(20);
				if (context.computeOnClient(mc -> TestHooks.leavesMade()) != still) throw new AssertionError("Leaves were kicked up standing still");
				context.takeScreenshot("leaves-ring-" + variant);
				context.runOnClient(mc -> { TestHooks.cosmeticsSelf(null, false); TestHooks.lookSouth(); mc.player.setXRot(35); TestHooks.walk(true, false); });
				context.waitTicks(24);
				int kicked = context.computeOnClient(mc -> TestHooks.leavesMade()) - still;
				if (kicked < 3) throw new AssertionError("Walking over the " + variant + " leaves kicked up only " + kicked);
				context.takeScreenshot("leaves-ring-" + variant + "-walking");
				context.runOnClient(mc -> TestHooks.walk(false, false));
				context.waitTicks(30);
			}
			context.runOnClient(mc -> { TestHooks.wear("ring", null); mc.player.setXRot(0); });

			// the menu: both auras on the figure, then both rings under it (the mouse off the tiles: nothing tried on)
			for (String variant : new String[] {"gold", "autumn"}) {
				context.runOnClient(mc -> { TestHooks.cosmeticsMenu("aura"); TestHooks.cosmeticsWorn("aura", "leaves_" + variant); });
				context.getInput().setCursorPos(4, 4);
				context.waitTicks(60);
				context.takeScreenshot("leaves-menu-aura-" + variant);
			}
			for (String variant : new String[] {"gold", "autumn"}) {
				context.runOnClient(mc -> { TestHooks.cosmeticsMenu("ring"); TestHooks.cosmeticsWorn("ring", "ring_leaves_" + variant); });
				context.getInput().setCursorPos(4, 4);
				context.waitTicks(10);
				context.takeScreenshot("leaves-menu-ring-" + variant);
			}
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}
}
