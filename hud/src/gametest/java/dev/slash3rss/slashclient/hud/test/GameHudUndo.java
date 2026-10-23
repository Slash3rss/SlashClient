package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Undo and redo in the HUD editor: a module moved, another hidden and a setting switched are three
 * steps, taken back one by one to where the editor started and brought back again, with the
 * buttons and with Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z. A drag of a module or of a slider is one step,
 * a new change after an undo forgets what could be redone, and the buttons are greyed out when
 * there is nothing to undo or redo.
 */
public class GameHudUndo implements FabricClientGameTest {
	private static void steps(ClientGameTestContext context, String want, String after) {
		String got = context.computeOnClient(mc -> TestHooks.historyState());
		if (!got.equals(want)) throw new AssertionError("After " + after + " the editor has steps (back forward) " + got + ", expected " + want);
	}

	private static String probe(ClientGameTestContext context) {
		return context.computeOnClient(mc -> TestHooks.undoProbe());
	}

	private static void same(String got, String want, String what) {
		if (!got.equals(want)) throw new AssertionError(what + ": " + got + ", expected " + want);
	}

	private static void click(ClientGameTestContext context, double[] at) {
		context.runOnClient(mc -> {
			TestHooks.mouse("press", at);
			TestHooks.mouse("release", at);
		});
		context.waitTicks(2);
	}

	private static void key(ClientGameTestContext context, char letter, boolean shift) {
		context.runOnClient(mc -> TestHooks.commandKey(letter, shift));
		context.waitTicks(2);
	}

	/** The test's cursor on a point of the GUI (it sits in window pixels). */
	private static void cursor(ClientGameTestContext context, double[] at) {
		double scale = context.computeOnClient(mc -> mc.getWindow().getScreenWidth() / (double) mc.getWindow().getGuiScaledWidth());
		context.getInput().setCursorPos(at[0] * scale, at[1] * scale);
		context.waitTicks(3);
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(20);
			context.runOnClient(mc -> {
				TestHooks.place("fps", 0, 0, 2, 2);
				TestHooks.place("ping", 0, 0, 2, 17);
			});
			context.setScreen(HudEditScreen::new);
			context.waitTicks(5);
			String start = probe(context);
			steps(context, "0 0", "opening");
			// nothing to undo: the button is there, greyed out, and a click on it does nothing
			double[] undo = context.computeOnClient(mc -> TestHooks.historyButton(false));
			if (undo == null || context.computeOnClient(mc -> TestHooks.historyButton(true)) == null) throw new AssertionError("No undo and redo buttons in the layout editor");
			click(context, undo);
			steps(context, "0 0", "a click on the greyed-out undo");
			same(probe(context), start, "A click on the greyed-out undo changed the HUD");
			context.takeScreenshot("hud-undo-start");

			// 1. the FPS dragged in several moves: one step
			double[] from = context.computeOnClient(mc -> TestHooks.modulePoint("fps"));
			// to a free spot in the upper left third, away from the other modules (a right click there must find the FPS)
			double[] to = context.computeOnClient(mc -> new double[] { mc.getWindow().getGuiScaledWidth() * 0.3, mc.getWindow().getGuiScaledHeight() * 0.18 });
			context.runOnClient(mc -> {
				TestHooks.mouse("press", from);
				for (int i = 1; i <= 4; i++) TestHooks.mouse("drag", new double[] { from[0] + (to[0] - from[0]) * i / 4, from[1] + (to[1] - from[1]) * i / 4 });
				TestHooks.mouse("release", to);
			});
			context.waitTicks(2);
			steps(context, "1 0", "one drag");
			String moved = probe(context);
			if (moved.equals(start)) throw new AssertionError("The drag did not move the FPS: " + moved);

			// 2. the ping hidden with its ×
			double[] close = context.computeOnClient(mc -> TestHooks.closePoint("ping"));
			cursor(context, close);
			click(context, close);
			if (context.computeOnClient(mc -> TestHooks.moduleOn("ping"))) throw new AssertionError("The × did not hide the ping");
			steps(context, "2 0", "hiding the ping");
			String hidden = probe(context);
			undo = context.computeOnClient(mc -> TestHooks.historyButton(false));
			cursor(context, undo);
			context.takeScreenshot("hud-undo-layout");

			// 3. the FPS's settings with a right click, its background switched
			double[] fps = context.computeOnClient(mc -> TestHooks.modulePoint("fps"));
			context.runOnClient(mc -> TestHooks.rightClick(fps));
			context.waitTicks(3);
			steps(context, "2 0", "opening the settings");
			double[] row = context.computeOnClient(mc -> TestHooks.settingsRow("slashclient-hud.background"));
			if (row == null) throw new AssertionError("The FPS's settings did not open on a right click");
			cursor(context, row);
			click(context, row);
			steps(context, "3 0", "switching the background");
			String changed = probe(context);
			if (changed.equals(hidden)) throw new AssertionError("The background did not switch: " + changed);

			// a slider dragged in several moves is one step too, and the undo button takes it back
			double[] a = context.computeOnClient(mc -> TestHooks.sliderPoint("slashclient-hud.set.scale", 0.2));
			double[] b = context.computeOnClient(mc -> TestHooks.sliderPoint("slashclient-hud.set.scale", 0.5));
			double[] c = context.computeOnClient(mc -> TestHooks.sliderPoint("slashclient-hud.set.scale", 0.8));
			cursor(context, a);
			context.runOnClient(mc -> {
				TestHooks.mouse("press", a);
				TestHooks.mouse("drag", b);
				TestHooks.mouse("drag", c);
				TestHooks.mouse("release", c);
			});
			context.waitTicks(2);
			steps(context, "4 0", "one drag of a slider");
			if (probe(context).equals(changed)) throw new AssertionError("The slider did not change the scale");
			double[] undoInWindow = context.computeOnClient(mc -> TestHooks.historyButton(false));
			if (undoInWindow == null) throw new AssertionError("No undo button in the settings window");
			cursor(context, undoInWindow);
			context.takeScreenshot("hud-undo-settings");
			click(context, undoInWindow);
			steps(context, "3 1", "the undo button");
			same(probe(context), changed, "The undo button did not put the scale back");

			// a new change after an undo: what was undone cannot come back
			cursor(context, row);
			click(context, row);
			steps(context, "4 0", "a change after an undo");
			key(context, 'z', false);
			steps(context, "3 1", "Ctrl+Z");
			same(probe(context), changed, "Ctrl+Z did not switch the background back");

			// three more times: the HUD as the editor found it, and undo greyed out
			for (int i = 0; i < 3; i++) key(context, 'z', false);
			steps(context, "0 4", "undoing everything");
			same(probe(context), start, "Undoing everything did not bring back the start");
			double[] greyed = context.computeOnClient(mc -> TestHooks.historyButton(false));
			click(context, greyed);
			steps(context, "0 4", "a click on the greyed-out undo");
			cursor(context, greyed);
			context.takeScreenshot("hud-undo-undone");

			// redo: Ctrl+Y the drag, Ctrl+Shift+Z the hidden ping
			key(context, 'y', false);
			steps(context, "1 3", "Ctrl+Y");
			same(probe(context), moved, "Ctrl+Y did not move the FPS again");
			key(context, 'z', true);
			steps(context, "2 2", "Ctrl+Shift+Z");
			same(probe(context), hidden, "Ctrl+Shift+Z did not hide the ping again");
			context.takeScreenshot("hud-undo-redone");

			// left as it was found
			key(context, 'z', false);
			key(context, 'z', false);
			same(probe(context), start, "The HUD is not back as it was");
			context.getInput().setCursorPos(0, 0);
			context.setScreen(() -> null);
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
