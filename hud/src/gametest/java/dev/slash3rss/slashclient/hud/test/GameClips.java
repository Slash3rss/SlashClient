package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** Clips: the game keeps frames while they are on, and the key's action writes a playable AVI. */
public class GameClips implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			// turned on in the middle of play, from the settings (as a player does), then back in the game
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.HudEditScreen("clips"));
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.clips(true));
			long open = System.currentTimeMillis();
			while (System.currentTimeMillis() - open < 1500) context.waitTick();
			context.takeScreenshot("clips-settings");
			context.setScreen(() -> null);
			// frames come by the clock: a few seconds of play
			long started = System.currentTimeMillis();
			while (System.currentTimeMillis() - started < 4000) context.waitTick();
			int frames = context.computeOnClient(mc -> TestHooks.clipFrames());
			if (frames < 20) throw new AssertionError("Too few frames kept: " + frames);
			String before = context.computeOnClient(mc -> TestHooks.newestClip());
			context.runOnClient(mc -> TestHooks.saveClip());
			String clip = before;
			for (int i = 0; i < 200 && clip.equals(before); i++) {
				context.waitTick();
				clip = context.computeOnClient(mc -> TestHooks.newestClip());
			}
			String[] c = clip.split(" ");
			if (c.length < 4 || !c[3].equals("RIFFAVI") || Integer.parseInt(c[2]) < 20 || Long.parseLong(c[1]) < 50_000)
				throw new AssertionError("No proper clip written: " + clip);
			context.waitTicks(5);
			context.takeScreenshot("clips-saved");
			context.runOnClient(mc -> TestHooks.clips(false));
			context.waitTicks(2);
			if (context.computeOnClient(mc -> TestHooks.clipFrames()) != 0) throw new AssertionError("Frames kept after clips were turned off");
		}
	}
}
