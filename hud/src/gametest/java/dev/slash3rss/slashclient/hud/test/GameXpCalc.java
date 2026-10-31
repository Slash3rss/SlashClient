package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.testing.XpTestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The XP calculators: the sums as on slash3rss.dev, the window laid out within itself; on 26.3 also
 * SkyUp's edition (bottling from level 30 at 52 XP: "/schowajexp 52 13", 43 XP left, 676 lost to the
 * tax) and its countdown, on the HUD while it runs.
 */
public class GameXpCalc implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String sums = context.computeOnClient(mc -> XpTestHooks.sums());
		if (!sums.equals("1395 112 352 1507 30/105/112")) throw new AssertionError("XP sums: " + sums);
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			context.runOnClient(mc -> TestHooks.audit(true));
			context.runOnClient(mc -> XpTestHooks.open());
			context.waitTicks(5);
			context.takeScreenshot("xpcalc");
			//#if MC >= 26.3
			String sky = context.computeOnClient(mc -> XpTestHooks.openSky());
			if (!sky.equals("/schowajexp 52 13 | 13 43 4/3/15 676")) throw new AssertionError("SkyUp XP: " + sky);
			context.waitTicks(5);
			context.takeScreenshot("skyxpcalc");
			//#endif
			String problems = context.computeOnClient(mc -> XpTestHooks.problems());
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("XP calculator layout:\n" + problems);
			//#if MC >= 26.3
			// the countdown: 3 bottles every 2 s, on the HUD with the calculator closed
			context.setScreen(() -> null);
			context.runOnClient(mc -> XpTestHooks.startSky(6, 2));
			context.waitTicks(50);
			String running = context.computeOnClient(mc -> XpTestHooks.sky());
			if (!running.contains("running true") || !running.contains("bottles 2") || !running.endsWith("shown true")) throw new AssertionError("SkyUp countdown: " + running);
			context.takeScreenshot("skyxp-countdown");
			context.waitTicks(100);
			String done = context.computeOnClient(mc -> XpTestHooks.sky());
			if (!done.contains("left 0") || !done.contains("running false") || !done.endsWith("shown true")) throw new AssertionError("SkyUp countdown at the end: " + done);
			context.runOnClient(mc -> XpTestHooks.stopSky());
			//#endif
		}
	}
}
