package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.BenchDisplay;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/** The launcher's Benchmark in a borderless window: the game's window takes its whole monitor, then goes back. */
public class GameBenchDisplay implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try {
			context.runOnClient(mc -> BenchDisplay.apply(mc, "borderless"));
			context.waitTicks(10);
			String size = context.computeOnClient(mc -> BenchDisplay.sizeForTest(mc));
			String[] s = size.split(" ");
			if (!s[0].equals(s[2]) || !s[1].equals(s[3])) throw new AssertionError("A borderless window the size of the monitor: " + size);
			context.takeScreenshot("bench-borderless");
		} finally {
			context.runOnClient(mc -> BenchDisplay.windowedForTest(mc));
			context.waitTicks(5);
			context.getInput().resizeWindow(854, 480);
			context.waitTicks(5);
		}
	}
}
