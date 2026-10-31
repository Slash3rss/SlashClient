package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.HudEditScreen;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * A module's key set right on its settings page: a click on the zoom's key waits, the next key is
 * its new one (the game's own binding, saved to options.txt, so the Controls show it too), Esc gives
 * up without a change, Backspace leaves it without a key, a key another binding has is warned about
 * and a mouse button works too. Cards with two keys (holding a button) show both.
 */
public class GameModuleKeys implements FabricClientGameTest {
	private static final String ZOOM = "key.slashclient-hud.zoom";

	/** The test's cursor on a point of the GUI (it sits in window pixels): rows only take clicks with the mouse over the list. */
	private static void cursor(ClientGameTestContext context, double[] at) {
		double scale = context.computeOnClient(mc -> mc.getWindow().getScreenWidth() / (double) mc.getWindow().getGuiScaledWidth());
		context.getInput().setCursorPos(at[0] * scale, at[1] * scale);
		context.waitTicks(3);
	}

	private static void click(ClientGameTestContext context, double[] at) {
		cursor(context, at);
		context.runOnClient(mc -> {
			TestHooks.mouse("press", at);
			TestHooks.mouse("release", at);
		});
		context.waitTicks(2);
	}

	/** Clicks the zoom's key button, which then waits for a key. */
	private static void listen(ClientGameTestContext context) {
		double[] at = context.computeOnClient(mc -> TestHooks.keyButton(ZOOM));
		if (at == null) throw new AssertionError("No key button for the zoom on its settings page");
		click(context, at);
	}

	private static void expect(ClientGameTestContext context, String want, String after) {
		String got = context.computeOnClient(mc -> TestHooks.keyOf(ZOOM));
		if (!got.equals(want)) throw new AssertionError("After " + after + " the zoom's key is " + got + ", expected " + want);
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		// in a world, as the editor is mostly opened (from the main menu older versions draw the panorama over it)
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(20);
			context.runOnClient(mc -> TestHooks.defaultKey(ZOOM));
			context.setScreen(() -> new HudEditScreen("zoom"));
			context.waitTicks(5);
			expect(context, "key.keyboard.c", "opening");

			// a click: the button waits and says what to press
			listen(context);
			context.waitTicks(3);
			context.takeScreenshot("module-keys-waiting");
			context.getInput().pressKey(InputConstants.KEY_G);
			context.waitTicks(3);
			expect(context, "key.keyboard.g", "pressing G");
			String saved = context.computeOnClient(mc -> TestHooks.savedKey(ZOOM));
			if (!"key.keyboard.g".equals(saved)) throw new AssertionError("options.txt has the zoom on " + saved);
			context.takeScreenshot("module-keys-set");

			// Esc gives up and keeps the page open
			listen(context);
			context.getInput().pressKey(InputConstants.KEY_ESCAPE);
			context.waitTicks(3);
			expect(context, "key.keyboard.g", "Esc");
			if (!context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc) instanceof HudEditScreen) || context.computeOnClient(mc -> TestHooks.keyButton(ZOOM)) == null)
				throw new AssertionError("Esc while waiting for a key closed the settings page");

			// Backspace: no key
			listen(context);
			context.getInput().pressKey(InputConstants.KEY_BACKSPACE);
			context.waitTicks(3);
			expect(context, "key.keyboard.unknown", "Backspace");

			// W walks forward too: the key is red and the line under it names the other binding
			listen(context);
			context.getInput().pressKey(InputConstants.KEY_W);
			context.waitTicks(3);
			expect(context, "key.keyboard.w", "pressing W");
			context.takeScreenshot("module-keys-clash");

			// a mouse button
			listen(context);
			double[] at = context.computeOnClient(mc -> TestHooks.keyButton(ZOOM));
			context.runOnClient(mc -> TestHooks.rightClick(at));
			context.waitTicks(3);
			expect(context, "key.mouse.right", "the right mouse button");

			// holding a button: its two keys on its own page
			context.setScreen(() -> new HudEditScreen("holdKeys"));
			context.waitTicks(5);
			if (context.computeOnClient(mc -> TestHooks.keyButton("key.slashclient-hud.holdAttack")) == null
				|| context.computeOnClient(mc -> TestHooks.keyButton("key.slashclient-hud.holdUse")) == null)
				throw new AssertionError("The page of holding a button has no rows for its two keys");
			context.takeScreenshot("module-keys-hold");

			context.runOnClient(mc -> TestHooks.defaultKey(ZOOM));
			context.setScreen(() -> null);
		}
	}
}
