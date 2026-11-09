package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.skyup.SkyBoosts;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * SkyUp's boosts and job skills from their boss bars: a boost running low warns (a minute before), one gone in
 * its last moments has ended, one gone with an hour left (another sector) has not; a job skill gone at its end
 * has ended, and is ready again after its cooldown.
 */
public class GameSkyAlerts implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		// SkyUp is played on 26.3: the banners are there only (the class is in every version's list)
		//#if MC >= 26.3
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			var server = world.getServer();
			context.waitTicks(40);
			context.runOnClient(mc -> {
				SkyBoosts.testWorld = true;
				SkyBoosts.clearForTest();
				SkyBoosts.cooldownForTest = 2_000;
			});
			try {
				// an hour left: no warning; gone (another sector): not ended
				server.runCommand("bossbar add far \"Boost » Wzrost roślin » 1 godz 59 min\"");
				server.runCommand("bossbar set far players @a");
				context.waitTicks(20);
				server.runCommand("bossbar remove far");
				context.waitTicks(20);
				expect(context, "");

				// a minute and a bit left: warned once
				server.runCommand("bossbar add drop \"Boost » Drop z mobów » 0 min 50 sek\"");
				server.runCommand("bossbar set drop players @a");
				context.waitTicks(20);
				expect(context, "Boost running out: Drop z mobów – ~ s left");
				context.takeScreenshot("sky-alerts-boost-soon");
				// its last seconds, then gone: ended
				server.runCommand("bossbar set drop name \"Boost » Drop z mobów » 2 sek\"");
				context.waitTicks(20);
				server.runCommand("bossbar remove drop");
				context.waitTicks(20);
				expect(context, "Boost ended: Drop z mobów");

				// a job skill at its end: over, then ready again after the cooldown
				server.runCommand("bossbar add skill \"⚔ Nawałnica (pozostało 1 sek)\"");
				server.runCommand("bossbar set skill players @a");
				context.waitTicks(15);
				server.runCommand("bossbar remove skill");
				context.waitTicks(15);
				expect(context, "Skill ended: Nawałnica – cooling down");
				context.takeScreenshot("sky-alerts-skill-end");
				context.waitTicks(60);
				expect(context, "Skill ready: Nawałnica – you can use it again");
			} finally {
				context.runOnClient(mc -> {
					SkyBoosts.testWorld = false;
					SkyBoosts.cooldownForTest = -1;
					SkyBoosts.clearForTest();
				});
			}
		}
		//#endif
	}

	private static void expect(ClientGameTestContext context, String banner) {
		String last = context.computeOnClient(mc -> SkyBoosts.lastForTest());
		// "~": a number of seconds, which may be one off as the time passes
		if (!last.matches(java.util.regex.Pattern.quote(banner).replace("~", "\\E\\d+\\Q"))) throw new AssertionError("Banner: \"" + last + "\", expected \"" + banner + "\"");
	}
}
