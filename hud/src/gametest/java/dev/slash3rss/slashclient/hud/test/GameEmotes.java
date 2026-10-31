package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The emotes as moves: each of the eight played on our own player, seen from the front half way
 * through (its picture in front of the face), one from the side; the camera turned to the front for
 * our own and back after; walking off ends it.
 */
public class GameEmotes implements FabricClientGameTest {
	private static final String[] EMOTES = { "wave", "heart", "laugh", "gg", "like", "angry", "question", "fire", "sixseven" };

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			for (String emote : EMOTES) {
				context.runOnClient(mc -> TestHooks.emoteSelf(emote));
				context.waitTicks(30);
				context.takeScreenshot("emote-" + emote);
				String playing = context.computeOnClient(mc -> TestHooks.emotePlaying());
				if (!playing.equals(emote)) throw new AssertionError("Emote " + emote + " is not playing: " + playing);
				context.waitTicks(60);
			}
			// from the side: the picture still turned to the camera
			context.runOnClient(mc -> TestHooks.turnSelf(90));
			context.runOnClient(mc -> TestHooks.emoteSelf("wave"));
			context.waitTicks(30);
			context.takeScreenshot("emote-wave-side");
			context.waitTicks(60);
			context.runOnClient(mc -> TestHooks.turnSelf(0));
			// our own, sent from the wheel: the camera turns to the front, and back once it is over
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.emoteSend("gg"));
			String during = context.computeOnClient(mc -> mc.options.getCameraType().name());
			context.waitTicks(100);
			String after = context.computeOnClient(mc -> mc.options.getCameraType().name());
			if (!during.equals("THIRD_PERSON_FRONT") || !after.equals("FIRST_PERSON")) throw new AssertionError("The camera for our own emote: " + during + " → " + after);
			// walking off ends it
			context.runOnClient(mc -> TestHooks.emoteSend("fire"));
			context.waitTicks(5);
			context.getInput().holdKey(o -> o.keyUp);
			context.waitTicks(5);
			context.getInput().releaseKey(o -> o.keyUp);
			String walked = context.computeOnClient(mc -> TestHooks.emotePlaying());
			String camera = context.computeOnClient(mc -> mc.options.getCameraType().name());
			if (!walked.isEmpty() || !camera.equals("FIRST_PERSON")) throw new AssertionError("Walking off the emote: " + walked + " / " + camera);
			context.runOnClient(mc -> TestHooks.firstPerson());
		}
	}
}
