package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.NarratorStatus;

/**
 * The narrator left on, with the sound muted: joining a world says so in a toast (it reads the chat
 * out and stalls the game, unheard), once a game run; with the narrator off, no toast.
 */
public class GameNarratorNotice implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		// a computer without a voice for the narrator (no speech on Linux without flite): nothing to say there
		if (!context.computeOnClient(mc -> mc.getNarrator().isActive())) {
			System.out.println("GameNarratorNotice: no narrator voice on this computer, skipped");
			return;
		}
		try {
			// off: no toast
			context.runOnClient(mc -> {
				mc.options.narrator().set(NarratorStatus.OFF);
				dev.slash3rss.slashclient.hud.NarratorNotice.resetForTest();
			});
			int before = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.social.Social.toastsForTest());
			try (TestSingleplayerContext world = context.worldBuilder().create()) {
				context.waitTicks(20);
				if (context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.social.Social.toastsForTest()) != before)
					throw new AssertionError("A narrator toast with the narrator off");
			}
			// on (the chat only), the sound muted, as the player who did not know: the toast, once
			context.runOnClient(mc -> {
				mc.options.narrator().set(NarratorStatus.CHAT);
				mc.options.getSoundSourceOptionInstance(net.minecraft.sounds.SoundSource.MASTER).set(0.0);
			});
			before = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.social.Social.toastsForTest());
			try (TestSingleplayerContext world = context.worldBuilder().create()) {
				context.waitTicks(15);
				if (context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.social.Social.toastsForTest()) != before + 1)
					throw new AssertionError("No toast with the narrator on");
				context.takeScreenshot("narrator-toast");
			}
			// the next world in the same run: not again
			before = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.social.Social.toastsForTest());
			try (TestSingleplayerContext world = context.worldBuilder().create()) {
				context.waitTicks(20);
				if (context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.social.Social.toastsForTest()) != before)
					throw new AssertionError("The narrator toast came twice in a run");
			}
		} finally {
			context.runOnClient(mc -> {
				mc.options.narrator().set(NarratorStatus.OFF);
				mc.options.getSoundSourceOptionInstance(net.minecraft.sounds.SoundSource.MASTER).set(1.0);
				mc.options.save();
			});
		}
	}
}
