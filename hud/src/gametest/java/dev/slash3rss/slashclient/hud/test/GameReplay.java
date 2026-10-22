package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.ReplayTestHooks;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.util.HashSet;
import java.util.Set;

/**
 * Instant replay: with clips off it records by itself; a few seconds of a turning camera and a
 * changing sky, then the viewer: positions on the timeline (each a different picture), a frame
 * step, the speeds (2× runs twice as fast as 0.25× ×8), a selection saved as a clip in clips/
 * with exactly its frames, closing it, and nothing kept once it is off.
 */
public class GameReplay implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("gamemode creative @a");
			server.runCommand("time set 1000");
			server.runCommand("tp @a 0 120 0 0 10");
			context.waitTicks(20);
			context.runOnClient(mc -> ReplayTestHooks.setup(true, 15, true));

			// about 6 s of play: the camera turns and the day goes on
			long started = System.currentTimeMillis();
			int tick = 0;
			while (System.currentTimeMillis() - started < 6000) {
				context.runOnClient(mc -> ReplayTestHooks.turnCamera(6f));
				if (++tick % 10 == 0) server.runCommand("time add 1500");
				context.waitTick();
			}
			String buffer = context.computeOnClient(mc -> ReplayTestHooks.buffer());
			String decode = context.computeOnClient(mc -> ReplayTestHooks.decodeMicros());
			System.out.println("SlashClient replay buffer (frames KB seconds size): " + buffer + ", decoding a frame (all, JPEG reader) in us: " + decode);
			int frames = Integer.parseInt(buffer.split(" ")[0]);
			if (frames < 60) throw new AssertionError("Too few frames recorded with only the replay on: " + buffer);

			// the key (F6) opens it
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_F6);
			context.waitTicks(10);
			if (!context.computeOnClient(mc -> ReplayTestHooks.isOpen())) throw new AssertionError("The replay did not open");
			String state = context.computeOnClient(mc -> ReplayTestHooks.state());
			System.out.println("SlashClient replay opened: " + state);
			if (!state.endsWith(" true")) throw new AssertionError("Singleplayer not paused while watching: " + state);
			context.takeScreenshot("replay-playing");

			// positions on the timeline: each shows its own picture
			Set<Integer> pictures = new HashSet<>();
			for (double at : new double[] { 0.05, 0.4, 0.75, 1.0 }) {
				context.runOnClient(mc -> ReplayTestHooks.seek(at));
				int hash = waitShown(context);
				pictures.add(hash);
				context.takeScreenshot("replay-at-" + Math.round(at * 100));
			}
			if (pictures.size() < 4) throw new AssertionError("Different positions show the same picture: " + pictures.size() + " different of 4");

			// one frame on
			context.runOnClient(mc -> ReplayTestHooks.seek(0.5));
			waitShown(context);
			String before = context.computeOnClient(mc -> ReplayTestHooks.state());
			context.runOnClient(mc -> ReplayTestHooks.step(1));
			waitShown(context);
			String after = context.computeOnClient(mc -> ReplayTestHooks.state());
			if (Integer.parseInt(after.split(" ")[2]) != Integer.parseInt(before.split(" ")[2]) + 1)
				throw new AssertionError("A step did not move one frame: " + before + " -> " + after);

			// speeds: how far the playback goes in the same time
			double fast = played(context, 2f), slow = played(context, 0.25f);
			System.out.printf("SlashClient replay speeds: 2x %.3f, 0.25x %.3f (seconds of replay per second)%n", fast, slow);
			if (fast < 1.4 || fast > 2.6 || slow < 0.15 || slow > 0.35) throw new AssertionError("Speeds off: 2x " + fast + ", 0.25x " + slow);
			context.runOnClient(mc -> ReplayTestHooks.play(1f));
			context.waitTicks(5);
			context.takeScreenshot("replay-speed-1x");

			// a selection from 20% to 60%, saved as a clip with exactly those frames
			context.runOnClient(mc -> ReplayTestHooks.seek(0.2));
			waitShown(context);
			context.runOnClient(mc -> ReplayTestHooks.markIn());
			context.runOnClient(mc -> ReplayTestHooks.seek(0.6));
			waitShown(context);
			context.runOnClient(mc -> ReplayTestHooks.markOut());
			String selected = context.computeOnClient(mc -> ReplayTestHooks.state());
			int range = Integer.parseInt(selected.split(" ")[3]);
			if (range < 10 || range >= frames) throw new AssertionError("Selection not set: " + selected);
			context.takeScreenshot("replay-selection");
			String name = context.computeOnClient(mc -> ReplayTestHooks.save());
			if (name.equals("none") || !name.startsWith("replay-")) throw new AssertionError("Saving did not start: " + name);
			for (int i = 0; i < 200 && context.computeOnClient(mc -> ReplayTestHooks.saving()); i++) context.waitTick();
			context.waitTicks(2);
			context.takeScreenshot("replay-saved");
			String clip = context.computeOnClient(mc -> ReplayTestHooks.clip(name));
			System.out.println("SlashClient replay clip: " + name + " " + clip + " (selected " + range + ")");
			String[] c = clip.split(" ");
			if (c.length < 3 || !c[2].equals("RIFFAVI") || Integer.parseInt(c[1]) != range)
				throw new AssertionError("The saved clip is not the selection: " + clip + ", selected " + range);

			// Escape closes it; recording goes on afterwards
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_ESCAPE);
			context.waitTicks(5);
			if (context.computeOnClient(mc -> ReplayTestHooks.isOpen())) throw new AssertionError("Escape did not close the replay");
			int closedAt = Integer.parseInt(context.computeOnClient(mc -> ReplayTestHooks.buffer()).split(" ")[0]);
			long t = System.currentTimeMillis();
			while (System.currentTimeMillis() - t < 1000) context.waitTick();
			String later = context.computeOnClient(mc -> ReplayTestHooks.buffer());
			if (Integer.parseInt(later.split(" ")[0]) <= closedAt && Integer.parseInt(later.split(" ")[0]) < 400)
				throw new AssertionError("Recording did not go on after the replay closed: " + closedAt + " -> " + later);

			// the settings card
			context.runOnClient(mc -> ReplayTestHooks.settingsCard());
			context.waitTicks(10);
			context.takeScreenshot("replay-settings");
			context.runOnClient(mc -> mc.setScreenAndShow(null));
			context.waitTicks(2);

			// off: nothing kept
			context.runOnClient(mc -> ReplayTestHooks.setup(false, 30, true));
			context.waitTicks(3);
			if (!context.computeOnClient(mc -> ReplayTestHooks.buffer()).startsWith("0 ")) throw new AssertionError("Frames kept after the replay was turned off");
			context.runOnClient(mc -> TestHooks.clips(false));
		}
	}

	/** Waits until the picture for the position is decoded and shown; its hash. */
	private static int waitShown(ClientGameTestContext context) {
		for (int i = 0; i < 100; i++) {
			context.waitTick();
			String[] s = context.computeOnClient(mc -> ReplayTestHooks.state()).split(" ");
			if (s[1].equals(s[2])) return context.computeOnClient(mc -> ReplayTestHooks.shownHash());
		}
		throw new AssertionError("The frame was not shown: " + context.computeOnClient(mc -> ReplayTestHooks.state()));
	}

	/** Seconds of replay played per real second at this speed (from the start, about one second). */
	private static double played(ClientGameTestContext context, float speed) {
		context.runOnClient(mc -> ReplayTestHooks.seek(0.0));
		context.waitTicks(2);
		double from = context.computeOnClient(mc -> ReplayTestHooks.position());
		long t = System.nanoTime();
		context.runOnClient(mc -> ReplayTestHooks.play(speed));
		while (System.nanoTime() - t < 1_200_000_000L) context.waitTick();
		double to = context.computeOnClient(mc -> ReplayTestHooks.position());
		long elapsed = System.nanoTime() - t;
		context.runOnClient(mc -> ReplayTestHooks.seek(0.0));
		return (to - from) / (elapsed / 1e9);
	}
}
