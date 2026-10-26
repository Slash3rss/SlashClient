package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
//#if MC >= 26.3
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.skyup.SkyWardrobeTestHooks;
//#endif
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
//#endif

/**
 * SkyUp's wardrobe module (26.3 only), with the window of the owner's GUI dumps: its five places (worn: an item, not the red pane)
 * and the two switches read from it, read again when the window changes, kept over a restart; the module on the HUD.
 */
public class GameSkyWardrobe implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		//#if MC >= 26.3
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			context.runOnClient(mc -> SkyWardrobeTestHooks.reset());
			if (context.computeOnClient(mc -> SkyWardrobeTestHooks.visible())) throw new AssertionError("Wardrobe: shown before its window was opened");
			// the chestplate and the leggings worn, the wardrobe on, not seen by the player
			context.runOnClient(mc -> SkyWardrobeTestHooks.open(true, false, true));
			context.waitTicks(10);
			check(context, "on true seen false worn Kosmetyczna zbroja Kosmetyczne spodnie");
			context.setScreen(() -> null);
			context.waitTicks(5);
			context.takeScreenshot("skywardrobe");
			// the leggings taken off, the wardrobe off and seen
			context.runOnClient(mc -> SkyWardrobeTestHooks.open(false, true, false));
			context.waitTicks(10);
			check(context, "on false seen true worn Kosmetyczna zbroja");
			context.setScreen(() -> null);
			// after a restart, from the file
			context.runOnClient(mc -> SkyWardrobeTestHooks.reload());
			check(context, "on false seen true worn Kosmetyczna zbroja");
			if (!context.computeOnClient(mc -> SkyWardrobeTestHooks.visible())) throw new AssertionError("Wardrobe: not shown once read");
			// the chestplate keeps the look the server gave it (its model and custom model data)
			String look = context.computeOnClient(mc -> SkyWardrobeTestHooks.look());
			if (!look.equals("minecraft:netherite_chestplate|7.0,skyup")) throw new AssertionError("Wardrobe: the chestplate's look lost: " + look);
			context.takeScreenshot("skywardrobe-off");
		}
		//#endif
	}

	//#if MC >= 26.3
	private static void check(ClientGameTestContext context, String want) {
		String got = context.computeOnClient(mc -> SkyWardrobeTestHooks.read());
		if (!got.equals(want)) throw new AssertionError("Wardrobe: want \"" + want + "\", got \"" + got + "\"");
	}
	//#endif
}
