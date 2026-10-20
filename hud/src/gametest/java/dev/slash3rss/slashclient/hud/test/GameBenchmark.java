package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** A whole benchmark run in a world: the camera turns, the result is saved and shown, the look comes back. */
public class GameBenchmark implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			context.runOnClient(mc -> TestHooks.audit(false));
			float yaw = context.computeOnClient(mc -> TestHooks.yaw());
			context.runOnClient(mc -> TestHooks.startBenchmark());
			// the run is timed by the clock, not by ticks: about 30 s
			boolean shot = false;
			long started = System.currentTimeMillis();
			while (context.computeOnClient(mc -> TestHooks.benchmarkRunning())) {
				if (System.currentTimeMillis() - started > 120_000) throw new AssertionError("The benchmark did not end");
				context.waitTick();
				if (!shot && System.currentTimeMillis() - started > 8_000) {
					context.takeScreenshot("benchmark-running");
					shot = true;
				}
			}
			// only the result screen: during the run waypoint labels leave the screen as the camera turns, as they should
			context.runOnClient(mc -> TestHooks.audit(true));
			context.waitTicks(5);
			context.takeScreenshot("benchmark-result");
			String[] r = context.computeOnClient(mc -> TestHooks.benchmarkResult()).split(" ");
			if (r.length < 5 || Integer.parseInt(r[0]) < 100 || Double.parseDouble(r[1]) <= 0 || Double.parseDouble(r[2]) <= 0)
				throw new AssertionError("No proper result saved: " + String.join(" ", r));
			if (!"true".equals(r[3])) throw new AssertionError("The result screen did not open");
			float after = context.computeOnClient(mc -> TestHooks.yaw());
			if (Math.abs(after - yaw) > 0.5f) throw new AssertionError("The look was not restored: " + yaw + " -> " + after);
			context.runOnClient(mc -> TestHooks.reportAudit());
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.audit(false));
		}
	}
}
