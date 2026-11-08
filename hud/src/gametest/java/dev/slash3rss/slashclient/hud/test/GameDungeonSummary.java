package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.skyup.DungeonHistoryScreen;
import dev.slash3rss.slashclient.hud.skyup.DungeonRun;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The summary of a dungeon trip: the boss bar "Dungeon poz. 2" up, items picked up from the ground (one a
 * server's own, paper with a model), cobblestone given by a command and cobblestone thrown away and picked up
 * again (neither is loot), and kills: a normal mob, an elite and a mini boss; the boss bar gone, the card with the summary, and the list of trips kept.
 */
public class GameDungeonSummary implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			var server = world.getServer();
			context.waitTicks(40);
			server.runCommand("time set 6000");
			server.runCommand("gamemode survival @a");
			server.runCommand("clear @a");
			context.runOnClient(mc -> DungeonRun.quickForTest());
			server.runCommand("bossbar add dungeon \"Dungeon poz. 2\"");
			server.runCommand("bossbar set dungeon players @a");
			context.waitTicks(40);
			if (!context.computeOnClient(mc -> DungeonRun.running())) throw new AssertionError("No trip began with the boss bar");
			// the bar 40% full: of level 2's 225 xp (130·2 − 9·4 + 8/5), 90
			server.runCommand("bossbar set dungeon max 100");
			server.runCommand("bossbar set dungeon value 40");
			context.waitTicks(20);
			String bar = context.computeOnClient(mc -> {
				var overlay = dev.slash3rss.slashclient.hud.Compat.bossOverlay(mc);
				var event = ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values().iterator().next();
				return dev.slash3rss.slashclient.hud.skyup.DungeonMap.withXp(event.getName(), 0.4f).getString();
			});
			if (!bar.equals("Dungeon poz. 2 · 90/225 xp")) throw new AssertionError("The dungeon's boss bar: " + bar);
			context.takeScreenshot("dungeon-xp");

			// given by a command: not the dungeon's
			server.runCommand("item replace entity @a hotbar.0 with cobblestone 5");
			// on the ground: the dungeon's
			server.runCommand("execute at @p run summon item ~ ~ ~ {Item:{id:\"minecraft:diamond\",count:3}}");
			server.runCommand("execute at @p run summon item ~ ~ ~ {Item:{id:\"minecraft:paper\",count:2,components:{\"minecraft:custom_model_data\":{floats:[5f]}}}}");
			context.waitTicks(30);
			// thrown away and picked up again: not loot
			context.runOnClient(mc -> {
				TestHooks.selectSlot(0);
				//#if MC >= 26.3
				mc.gameMode.dropItem(mc.player, true);
				//#else
				//$ mc.player.drop(true);
				//#endif
			});
			context.waitTicks(15);
			// to where it fell, to pick it up again
			server.runCommand("execute as @p at @e[type=item,limit=1,sort=nearest] run tp @s ~ ~ ~");
			context.waitTicks(60);
			int back = context.computeOnClient(mc -> mc.player.getInventory().countItem(net.minecraft.world.item.Items.COBBLESTONE));
			if (back != 5) throw new AssertionError("The cobblestone did not come back: " + back);

			// kills, by the mob's class: a normal one, an elite and two mini bosses
			context.runOnClient(mc -> {
				DungeonRun.killed(1, 1);
				DungeonRun.killed(1, 2);
				DungeonRun.killed(2, 3);
			});
			// the player's own XP (spent XP does not count) and a job's boss bar, its XP growing and a level going up
			server.runCommand("xp add @p 7 points");
			server.runCommand("bossbar add job \"Górnik (poziom 2) 744/3 599 xp (+3 xp)\"");
			server.runCommand("bossbar set job players @a");
			context.waitTicks(15);
			server.runCommand("bossbar set job name \"Górnik (poziom 2) 3 590/3 599 xp (+3 xp)\"");
			context.waitTicks(15);
			server.runCommand("bossbar set job name \"Górnik (poziom 3) 3/5 000 xp (+12 xp)\"");
			server.runCommand("xp add @p -3 points");
			context.waitTicks(15);
			context.takeScreenshot("dungeon-xp-live");
			server.runCommand("bossbar remove job");
			// a level up on the way: all of level 2 (225, from an empty bar) and a tenth of level 3's 314 (130·3 − 81 + 27/5)
			server.runCommand("bossbar set dungeon name \"Dungeon poz. 3\"");
			server.runCommand("bossbar set dungeon value 10");
			context.waitTicks(30);
			server.runCommand("bossbar remove dungeon");
			context.waitTicks(25);
			String last = context.computeOnClient(mc -> DungeonRun.lastForTest());
			if (!last.equals("poz. 3, loot 0, kills 4/1/2, xp 256, got diamond 3 paper* 2")) throw new AssertionError("The trip kept: " + last);
			if (!context.computeOnClient(mc -> DungeonRun.showing())) throw new AssertionError("No summary card");
			// 7 of the player's own; the miner's 2 846 to 3 590, then 9 to its level's end and 3 into the next
			String xp = context.computeOnClient(mc -> DungeonRun.xpForTest());
			if (!xp.equals("player 7, Górnik 2858")) throw new AssertionError("The trip's XP: " + xp);
			// the list keeps the server's model on its items
			String kept = context.computeOnClient(mc -> DungeonRun.keptLooksForTest());
			if (!kept.equals("diamond paper*")) throw new AssertionError("The list's items: " + kept);
			context.takeScreenshot("dungeon-summary");

			context.setScreen(() -> new DungeonHistoryScreen(null));
			context.waitTicks(10);
			context.takeScreenshot("dungeon-history");
			context.runOnClient(mc -> ((DungeonHistoryScreen) dev.slash3rss.slashclient.hud.Compat.screen(mc)).openNewestForTest());
			context.waitTicks(5);
			context.takeScreenshot("dungeon-history-whole");
			context.setScreen(() -> null);
		}
	}
}
