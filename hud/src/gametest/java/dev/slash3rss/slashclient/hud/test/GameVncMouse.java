package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * "Myszka przez VNC" (camera.VncMouse): the edges' turn (none in the middle, more nearer an edge), and in a
 * world a cursor that only moves – no movement of its own, as a remote desktop sends it – turning the
 * player with the mode on and not without it.
 */
public class GameVncMouse implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 26.3
		double[] middle = dev.slash3rss.slashclient.hud.camera.VncMouse.edgeTurn(500, 300, 1000, 600, 0.1, 600);
		double[] left = dev.slash3rss.slashclient.hud.camera.VncMouse.edgeTurn(0, 300, 1000, 600, 0.1, 600);
		double[] nearRight = dev.slash3rss.slashclient.hud.camera.VncMouse.edgeTurn(980, 599, 1000, 600, 0.1, 600);
		if (middle[0] != 0 || middle[1] != 0 || left[0] != -60 || left[1] != 0 || nearRight[0] <= 0 || nearRight[0] >= 60 || nearRight[1] <= 0)
			throw new AssertionError("Edge turn: " + java.util.Arrays.toString(middle) + java.util.Arrays.toString(left) + java.util.Arrays.toString(nearRight));
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(20);
			String withMode = turn(context, true);
			String without = turn(context, false);
			// (the test client never really takes the cursor, so the hiding is checked on a Raspberry Pi over VNC, not here)
			if (!withMode.contains(" turned ") || !without.contains(" still "))
				throw new AssertionError("A cursor that only moves: with the mode " + withMode + ", without " + without);
		} finally {
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.camera.VncMouse.forTest = false);
		}
		//#endif
	}

	//#if MC >= 26.3
	/** The cursor moved 200 px to the right (inside the window) with no movement of its own: whether the player turned. */
	private static String turn(ClientGameTestContext context, boolean mode) {
		context.runOnClient(mc -> {
			dev.slash3rss.slashclient.hud.camera.VncMouse.forTest = mode;
			mc.mouseHandler.releaseMouse();
			mc.mouseHandler.grabMouse();
		});
		context.waitTicks(3);
		float[] before = new float[1];
		context.runOnClient(mc -> {
			before[0] = mc.player.getYRot();
			long window = mc.getWindow().handle();
			double cx = mc.getWindow().getScreenWidth() / 2.0, cy = mc.getWindow().getScreenHeight() / 2.0;
			// the first move after taking the cursor only notes where it is
			mc.mouseHandler.onMove(window, cx, cy, 0, 0);
			mc.mouseHandler.onMove(window, cx + 100, cy, 0, 0);
			mc.mouseHandler.onMove(window, cx + 200, cy, 0, 0);
		});
		context.waitTicks(3);
		return context.computeOnClient(mc -> {
			boolean taken = dev.slash3rss.slashclient.hud.camera.VncMouse.taken;
			boolean turned = Math.abs(mc.player.getYRot() - before[0]) > 1;
			mc.mouseHandler.releaseMouse();
			String out = (taken ? "taken" : "locked") + " " + (turned ? "turned" : "still") + " " + (mc.player.getYRot() - before[0]);
			mc.mouseHandler.grabMouse();
			return out + " afterRelease=" + dev.slash3rss.slashclient.hud.camera.VncMouse.taken;
		});
	}
	//#endif
}
