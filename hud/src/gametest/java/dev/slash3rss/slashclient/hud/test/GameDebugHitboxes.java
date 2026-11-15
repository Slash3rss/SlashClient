package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.Compat;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** The HUD steps aside for the F3 text, but stays with the hitboxes (F3 + B) and the chunk borders (F3 + G) on. */
public class GameDebugHitboxes implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("summon pig ~2 ~ ~3");
			context.waitTicks(10);
			if (context.computeOnClient(Compat::debugText)) throw new AssertionError("F3 text counted on at the start");
			// F3 + B, then F3 + G: lines in the world, no text
			for (int key : new int[] { InputConstants.KEY_B, InputConstants.KEY_G }) {
				context.getInput().holdKey(InputConstants.KEY_F3);
				context.getInput().pressKey(key);
				context.getInput().releaseKey(InputConstants.KEY_F3);
				context.waitTicks(5);
			}
			if (context.computeOnClient(Compat::debugText)) throw new AssertionError("The HUD hides with the hitboxes and chunk borders on");
			context.takeScreenshot("debug-hitboxes-hud");
			// F3 alone: the text, the HUD hides
			context.getInput().pressKey(InputConstants.KEY_F3);
			context.waitTicks(5);
			if (!context.computeOnClient(Compat::debugText)) throw new AssertionError("The F3 text not seen");
			context.getInput().pressKey(InputConstants.KEY_F3);
			context.waitTicks(5);
			if (context.computeOnClient(Compat::debugText)) throw new AssertionError("The F3 text still counted after closing it");
			// back as it was
			for (int key : new int[] { InputConstants.KEY_B, InputConstants.KEY_G }) {
				context.getInput().holdKey(InputConstants.KEY_F3);
				context.getInput().pressKey(key);
				context.getInput().releaseKey(InputConstants.KEY_F3);
				context.waitTicks(2);
			}
		}
	}
}
