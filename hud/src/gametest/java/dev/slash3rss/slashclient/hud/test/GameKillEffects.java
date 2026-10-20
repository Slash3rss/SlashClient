package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Kill effects: a weak husk in front of us, hit once, plays the effect we wear where it falls
 * (screenshots in the middle of a few of them); switched off, nothing plays; the menu's tab and preview.
 */
public class GameKillEffects implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> { TestHooks.firstPerson(); TestHooks.lookSouth(); TestHooks.killEffects(true, true); });
			for (String kind : new String[] {"firework", "lightning", "soulrise", "coins", "ghost", "blast"}) {
				context.runOnClient(mc -> { TestHooks.wear("kill", kind); TestHooks.killEffectForget(); TestHooks.lookSouth(); });
				String state = kill(context, world);
				if (!state.startsWith(kind + ":self|")) throw new AssertionError("Our kill effect did not play for " + kind + ": " + state);
				context.waitTicks(kind.equals("ghost") ? 12 : kind.equals("soulrise") ? 14 : 3);
				context.takeScreenshot("kill-effect-" + kind);
				context.waitTicks(40);
			}
			// switched off: the kill counts, the effect does not play
			context.runOnClient(mc -> { TestHooks.killEffects(false, true); TestHooks.killEffectForget(); });
			String off = kill(context, world);
			if (!off.equals("|0")) throw new AssertionError("A kill effect played while switched off: " + off);
			context.runOnClient(mc -> TestHooks.killEffects(true, true));
			// the menu's tab, and its preview beside our player
			context.runOnClient(mc -> TestHooks.audit(true));
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("kill"));
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.killPreview("confetti"));
			context.waitTicks(8);
			context.takeScreenshot("kill-effect-menu-preview");
			context.runOnClient(mc -> TestHooks.reportAudit());
			context.runOnClient(mc -> TestHooks.audit(false));
			context.setScreen(() -> null);
			context.runOnClient(mc -> { TestHooks.wear("kill", null); TestHooks.firstPerson(); });
		}
	}

	/** Summons a husk with one heart in front of us and hits it until the kill shows: the kill effect's state then. */
	private static String kill(ClientGameTestContext context, TestSingleplayerContext world) {
		world.getServer().runCommand("execute at @a run summon husk ~ ~ ~2.5 {Health:1f,NoAI:1b,Silent:1b}");
		context.waitTicks(10);
		if (!context.computeOnClient(mc -> TestHooks.attackNearest())) throw new AssertionError("Nothing to hit");
		String state = "";
		for (int i = 0; i < 60; i++) {
			context.waitTicks(1);
			state = context.computeOnClient(mc -> TestHooks.killEffectState());
			if (!state.startsWith("|")) return state;
			// a husk that is still standing: the first hit did not land, hit again
			if (i % 15 == 14) context.runOnClient(mc -> TestHooks.attackNearest());
		}
		return state;
	}
}
