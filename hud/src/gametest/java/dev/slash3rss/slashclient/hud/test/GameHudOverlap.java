package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.HudEditScreen;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * Modules lying on each other in the HUD editor, moved with the real mouse. The module the mouse
 * came onto stays the hovered one (drawn on top) while the mouse moves inside it, also over a part
 * where another module lies on it, and a drag moves that one alone. The one underneath is reached
 * with a second click in the same place or with Alt+click, also under a big module.
 */
public class GameHudOverlap implements FabricClientGameTest {
	private static int[] box(ClientGameTestContext context, String id) {
		return context.computeOnClient(mc -> TestHooks.editorBox(id));
	}

	private static double scale(ClientGameTestContext context) {
		return context.computeOnClient(mc -> mc.getWindow().getScreenWidth() / (double) mc.getWindow().getGuiScaledWidth());
	}

	/** The cursor on a GUI point (the test's cursor sits in window pixels). */
	private static void cursor(ClientGameTestContext context, double x, double y) {
		double s = scale(context);
		context.getInput().setCursorPos(x * s, y * s);
		context.waitTicks(2);
	}

	/** Off every module: the cursor leaves whatever it was on. */
	private static void away(ClientGameTestContext context) {
		cursor(context, 4, context.computeOnClient(mc -> mc.getWindow().getGuiScaledHeight()) - 4);
	}

	private static void hovered(ClientGameTestContext context, String want, String when) {
		String got = context.computeOnClient(mc -> TestHooks.editorHovered());
		if (!Objects.equals(got, want)) throw new AssertionError(when + ": the editor's hovered module is " + got + ", expected " + want);
	}

	/** A click in place with the real mouse: pressed and let go without moving. */
	private static void click(ClientGameTestContext context) {
		context.getInput().holdMouse(InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTick();
		context.getInput().releaseMouse(InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTicks(2);
	}

	/** A real drag from where the cursor is: the left button held, moved in steps, let go. */
	private static void drag(ClientGameTestContext context, double dx, double dy) {
		double s = scale(context);
		context.getInput().holdMouse(InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTick();
		for (int i = 0; i < 8; i++) {
			context.getInput().moveCursor(dx / 8 * s, dy / 8 * s);
			context.waitTick();
		}
		context.getInput().releaseMouse(InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTicks(2);
	}

	private static void moved(int[] before, int[] after, String id) {
		if (Math.abs(after[0] - before[0]) < 40 || Math.abs(after[1] - before[1]) < 20)
			throw new AssertionError("The drag did not move the " + id + ": " + Arrays.toString(before) + " -> " + Arrays.toString(after));
	}

	private static void still(int[] before, int[] after, String id) {
		if (after[0] != before[0] || after[1] != before[1])
			throw new AssertionError("The " + id + " moved though the drag was not on it: " + Arrays.toString(before) + " -> " + Arrays.toString(after));
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		List<String> was = context.computeOnClient(mc -> TestHooks.onlyModules("fps", "ping", "inventory"));
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(20);
			context.runOnClient(mc -> {
				TestHooks.place("fps", 0, 0, 60, 60);
				// the ping 6 pixels lower: the FPS's top rows are its own, its lower ones under the ping
				TestHooks.place("ping", 0, 0, 60, 66);
				TestHooks.place("inventory", 0, 0, 60, 140);
			});
			context.setScreen(HudEditScreen::new);
			context.waitTicks(5);
			away(context);
			hovered(context, null, "The cursor off every module");

			// 1. the mouse comes onto the FPS above the ping, then moves down over the ping lying on it: still the FPS
			// (boxes are measured again before each use: the FPS's width follows its number, which earlier tests' load changes)
			int[] fps = box(context, "fps"), ping = box(context, "ping");
			if (!(ping[1] > fps[1] + 2 && ping[1] < fps[1] + fps[3] - 2)) throw new AssertionError("The ping does not lie on the FPS's lower part: " + Arrays.toString(fps) + " " + Arrays.toString(ping));
			cursor(context, fps[0] + 3, fps[1] + 2);
			hovered(context, "fps", "The cursor on the FPS above the ping");
			cursor(context, fps[0] + 3, fps[1] + fps[3] - 2);
			hovered(context, "fps", "The cursor moved inside the FPS onto the ping lying on it");
			context.takeScreenshot("hudoverlap-sticky");
			drag(context, 90, 50);
			moved(fps, box(context, "fps"), "FPS");
			still(ping, box(context, "ping"), "ping");
			context.takeScreenshot("hudoverlap-dragged");

			// 2. coming from outside onto both, the top one (the ping) is taken and moves alone
			context.runOnClient(mc -> TestHooks.place("fps", 0, 0, 60, 60));
			away(context);
			fps = box(context, "fps");
			cursor(context, ping[0] + 3, fps[1] + fps[3] - 2);
			hovered(context, "ping", "The cursor from outside onto the FPS and the ping lying on each other");
			drag(context, 90, 50);
			moved(ping, box(context, "ping"), "ping");
			still(fps, box(context, "fps"), "FPS");

			// 3. a small module under a big one: a click in place moves nothing, a second click there takes the one under it
			context.runOnClient(mc -> TestHooks.place("inventory", 0, 0, 40, 40));
			away(context);
			int[] inv = box(context, "inventory");
			fps = box(context, "fps");
			if (!(inv[0] <= fps[0] && inv[1] <= fps[1] && inv[0] + inv[2] >= fps[0] + fps[2] && inv[1] + inv[3] >= fps[1] + fps[3]))
				throw new AssertionError("The inventory does not cover the FPS: " + Arrays.toString(inv) + " " + Arrays.toString(fps));
			cursor(context, fps[0] + 3, fps[1] + 4);
			hovered(context, "inventory", "The cursor on the FPS under the inventory");
			click(context);
			hovered(context, "inventory", "One click on the inventory");
			still(inv, box(context, "inventory"), "inventory");
			click(context);
			hovered(context, "fps", "A second click in the same place");
			context.takeScreenshot("hudoverlap-under");
			// and it stays the one, drawn on top, while the mouse moves inside it
			int[] now = box(context, "fps");
			cursor(context, now[0] + now[2] / 2.0, now[1] + now[3] / 2.0);
			hovered(context, "fps", "The cursor moved inside the FPS taken from under the inventory");
			drag(context, 0, -70);
			int[] fpsOut = box(context, "fps");
			if (fpsOut[1] > fps[1] - 40) throw new AssertionError("The FPS taken from under the inventory did not move: " + Arrays.toString(fps) + " -> " + Arrays.toString(fpsOut));
			still(inv, box(context, "inventory"), "inventory");
			context.takeScreenshot("hudoverlap-out");
			// clicks in place go on down and come back to the top: inventory, FPS, inventory again
			context.runOnClient(mc -> TestHooks.place("fps", 0, 0, 60, 60));
			away(context);
			cursor(context, fps[0] + 3, fps[1] + 4);
			hovered(context, "inventory", "The cursor on the inventory again");
			click(context);
			click(context);
			hovered(context, "fps", "A second click");
			click(context);
			hovered(context, "inventory", "A third click with two modules there");

			// 4. Alt+click takes the one under it at once
			away(context);
			cursor(context, fps[0] + 3, fps[1] + 4);
			hovered(context, "inventory", "The cursor on the inventory before Alt+click");
			context.getInput().holdKey(InputConstants.KEY_LALT);
			context.waitTick();
			click(context);
			context.getInput().releaseKey(InputConstants.KEY_LALT);
			context.waitTick();
			hovered(context, "fps", "Alt+click on the inventory over the FPS");

			// 5. the module last taken moves with the arrows and WASD: a pixel, ten with Shift; the undo button (Ctrl+Z) takes a step back
			context.runOnClient(mc -> TestHooks.place("ping", 0, 0, 200, 120));
			away(context);
			int[] p0 = box(context, "ping");
			cursor(context, p0[0] + 3, p0[1] + 3);
			click(context);
			if (!"ping".equals(context.computeOnClient(mc -> TestHooks.editorSelected()))) throw new AssertionError("A click did not select the ping");
			away(context);
			for (int i = 0; i < 3; i++) context.getInput().pressKey(InputConstants.KEY_RIGHT);
			context.getInput().pressKey(InputConstants.KEY_D);
			context.getInput().pressKey(InputConstants.KEY_W);
			context.getInput().holdKey(InputConstants.KEY_LSHIFT);
			context.getInput().pressKey(InputConstants.KEY_DOWN);
			context.getInput().releaseKey(InputConstants.KEY_LSHIFT);
			context.waitTicks(2);
			int[] p1 = box(context, "ping");
			if (p1[0] - p0[0] != 4 || p1[1] - p0[1] != 9) throw new AssertionError("The keys moved the ping by " + (p1[0] - p0[0]) + ", " + (p1[1] - p0[1]) + " (expected 4, 9)");
			context.takeScreenshot("hudoverlap-nudged");
			// (the undo button: the test's key presses carry no Ctrl)
			double[] undoAt = context.computeOnClient(mc -> TestHooks.historyButton(false));
			cursor(context, undoAt[0], undoAt[1]);
			click(context);
			context.waitTicks(2);
			int[] p2 = box(context, "ping");
			if (p2[1] - p0[1] != -1 || p2[0] - p0[0] != 4) throw new AssertionError("Undo did not take back the last step: " + (p2[0] - p0[0]) + ", " + (p2[1] - p0[1]));
			context.setScreen(() -> null);
			// as a player does it: the settings window from the menu, "Edit layout", a click on the module, the mouse left on it
			context.setScreen(dev.slash3rss.slashclient.hud.ui.HudEditScreen::settingsWindow);
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.editorLayout());
			context.waitTicks(3);
			int[] q0 = box(context, "ping");
			cursor(context, q0[0] + 3, q0[1] + 3);
			click(context);
			context.getInput().pressKey(InputConstants.KEY_RIGHT);
			context.getInput().pressKey(InputConstants.KEY_RIGHT);
			context.getInput().pressKey(InputConstants.KEY_S);
			context.waitTicks(2);
			int[] q1 = box(context, "ping");
			System.out.println("SlashClient nudge as a player: selected " + context.computeOnClient(mc -> TestHooks.editorSelected()) + " moved " + (q1[0] - q0[0]) + ", " + (q1[1] - q0[1]));
			if (q1[0] - q0[0] != 2 || q1[1] - q0[1] != 1) throw new AssertionError("The keys moved the ping (mouse on it) by " + (q1[0] - q0[0]) + ", " + (q1[1] - q0[1]) + " (expected 2, 1)");
			context.setScreen(() -> null);
		} finally {
			context.runOnClient(mc -> TestHooks.modulesOn(was));
		}
	}
}
