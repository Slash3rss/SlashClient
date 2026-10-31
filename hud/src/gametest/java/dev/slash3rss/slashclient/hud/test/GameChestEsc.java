package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * A chest opened with the right mouse button and closed with Esc stays closed (a tester's report: on
 * SkyUp the chest opened again at once and needed a second Esc). As a player does it: the button
 * pressed on the chest and let go over its window, or held a moment; with the autoclicker off (the
 * settings as they come) and on, holding the right button.
 */
public class GameChestEsc implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			context.runOnClient(mc -> { TestHooks.firstPerson(); TestHooks.lookSouth(); TestHooks.autoClicker(false, "hold", true, false, false, 10); });
			// a chest at the height of the eyes, two blocks ahead, under the crosshair
			world.getServer().runCommand("execute at @a run setblock ~ ~1 ~2 chest");
			context.waitTicks(10);
			StringBuilder wrong = new StringBuilder();
			for (String way : new String[] { "click", "held", "autoclicker" }) {
				if (way.equals("autoclicker")) context.runOnClient(mc -> TestHooks.autoClicker(true, "hold", true, true, false, 10));
				context.getInput().holdMouse(InputConstants.MOUSE_BUTTON_RIGHT);
				context.waitTicks(way.equals("click") ? 1 : 8);
				context.getInput().releaseMouse(InputConstants.MOUSE_BUTTON_RIGHT);
				context.waitTicks(10);
				boolean opened = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc) instanceof net.minecraft.client.gui.screens.inventory.ContainerScreen);
				if (!opened) {
					wrong.append(way).append(": did not open; ");
					continue;
				}
				context.getInput().pressKey(InputConstants.KEY_ESCAPE);
				context.waitTicks(30);
				String after = context.computeOnClient(mc -> String.valueOf(dev.slash3rss.slashclient.hud.Compat.screen(mc)));
				if (!after.equals("null")) {
					wrong.append(way).append(": open again after Esc (").append(after).append("); ");
					context.setScreen(() -> null);
					context.waitTicks(5);
				}
			}
			context.runOnClient(mc -> TestHooks.autoClicker(false, "hold", true, false, false, 10));
			if (!wrong.isEmpty()) throw new AssertionError("A chest closed with Esc: " + wrong);
		}
	}
}
