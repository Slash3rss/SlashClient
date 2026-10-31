package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

import java.util.HashSet;
import java.util.Set;

/**
 * The benchmark's test scene from the menu, as the launcher starts it: its world is made, the
 * places found and the chunks loaded, then the camera flies the seven scenes (three times faster
 * here), each photographed, and the result shows every scene on its own.
 */
public class GameBenchScene implements FabricClientGameTest {
	private static final String[] SCENES = { "forest", "panorama", "village", "water", "entities", "particles", "night" };
	private static final double SPEED = 3;

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		// a usual render distance (the tests' own is small), as a player would have it
		int distance = context.computeOnClient(mc -> TestHooks.renderDistance());
		context.runOnClient(mc -> TestHooks.renderDistance(10));
		context.runOnClient(mc -> TestHooks.benchEarlierRuns());
		context.runOnClient(mc -> TestHooks.benchScene(SPEED));
		// the world is made the first time, then the places are found and the chunks loaded: not measured
		long started = System.currentTimeMillis();
		String state;
		boolean preparingShot = false;
		while (!(state = context.computeOnClient(mc -> TestHooks.benchSceneState())).startsWith("running")) {
			if (System.currentTimeMillis() - started > 420_000) throw new AssertionError("The test scene did not start: " + state);
			if (!preparingShot && state.startsWith("chunks")) {
				context.takeScreenshot("bench-scene-preparing");
				preparingShot = true;
			}
			context.waitTick();
		}
		System.out.println("SlashClient test scene ready after " + (System.currentTimeMillis() - started) / 1000 + " s");
		Set<String> shot = new HashSet<>();
		String last = "";
		long since = System.currentTimeMillis(), flying = since;
		while ((state = context.computeOnClient(mc -> TestHooks.benchSceneState())).endsWith("true")) {
			if (System.currentTimeMillis() - flying > 180_000) throw new AssertionError("The test scene did not end: " + state);
			String[] parts = state.split(" ");
			String id = parts.length == 3 ? parts[1] : "";
			if (!id.equals(last)) {
				last = id;
				since = System.currentTimeMillis();
			}
			// a little into each scene, past the cut
			if (!id.isEmpty() && !shot.contains(id) && System.currentTimeMillis() - since > 1200) {
				context.takeScreenshot("bench-scene-" + id);
				System.out.println("SlashClient test scene camera in " + id + ": " + context.computeOnClient(mc -> TestHooks.benchCamera()));
				shot.add(id);
			}
			context.waitTick();
		}
		context.waitTicks(5);
		context.takeScreenshot("bench-scene-result");
		String result = context.computeOnClient(mc -> TestHooks.benchSceneResult());
		System.out.println("SlashClient test scene result: " + result);
		String[] r = result.split(" ");
		if (!r[0].startsWith("slashclient-") || Integer.parseInt(r[1]) < 100 || Double.parseDouble(r[2]) <= 0 || !"true".equals(r[3]))
			throw new AssertionError("No proper test scene result: " + result);
		for (String id : SCENES) {
			boolean found = false;
			for (int i = 4; i < r.length; i++) {
				String[] sc = r[i].split(":");
				if (sc[0].equals(id) && Double.parseDouble(sc[1]) > 0 && Integer.parseInt(sc[2]) > 10) found = true;
			}
			if (!found) throw new AssertionError("Scene " + id + " not measured: " + result);
			if (!shot.contains(id)) throw new AssertionError("Scene " + id + " not seen during the run");
		}
		// compared with the test scene run before, not with the newer one in an own world
		String compared = context.computeOnClient(mc -> TestHooks.benchCompared());
		if (!compared.startsWith("slashclient-") || !compared.endsWith(" 40.0")) throw new AssertionError("Compared with the wrong run: " + compared);
		context.runOnClient(mc -> TestHooks.benchSceneDone());
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.leaveWorld());
		long leaving = System.currentTimeMillis();
		while (context.computeOnClient(mc -> TestHooks.inWorld())) {
			if (System.currentTimeMillis() - leaving > 60_000) throw new AssertionError("The test scene's world did not close");
			context.waitTick();
		}
		context.waitTicks(20);
		context.runOnClient(mc -> TestHooks.renderDistance(distance));
		context.runOnClient(mc -> TestHooks.vanillaMenu());
		context.waitTicks(5);
	}
}
