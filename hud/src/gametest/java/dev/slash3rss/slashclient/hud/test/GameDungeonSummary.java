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
			// a minute later: the miner's 2 858 a minute, its 4 997 left in about 2 minutes (the "time to level" module)
			context.runOnClient(mc -> {
				dev.slash3rss.slashclient.hud.skyup.LevelEta.agoForTest(60_000);
				DungeonRun.startedAgoForTest(60_000);
			});
			String eta = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.LevelEta.linesForTest());
			String miner = eta.lines().filter(l -> l.contains("Górnik")).findFirst().orElse("");
			if (!miner.contains("~2 min")) throw new AssertionError("The time to the miner's next level: " + eta);
			if (eta.lines().count() != 2) throw new AssertionError("The player and the miner: " + eta);
			// the jobs' and the player's show no time in the dungeon's module
			String live = context.computeOnClient(mc -> DungeonRun.liveForTest());
			if (live.lines().anyMatch(l -> l.contains("Górnik") && l.contains("~"))) throw new AssertionError("The dungeon's module: " + live);
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
			// levels gone up: the dungeon 2 → 3, the player 0 → 1 (7 points, then 3 spent: still counted), the miner 2 → 3
			if (!xp.equals("player 7, Górnik 2858 | levels [2, 3] [0, 1] Górnik[2, 3]")) throw new AssertionError("The trip's XP: " + xp);
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

			// the XP a level takes, learned from the damage dealt: a server whose level 2 takes 300, not the formula's 225
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.DungeonXp.clearForTest());
			server.runCommand("bossbar add dungeon \"Dungeon poz. 2\"");
			server.runCommand("bossbar set dungeon players @a");
			server.runCommand("bossbar set dungeon max 300");
			server.runCommand("bossbar set dungeon value 120");
			server.runCommand("execute at @p run summon husk ^ ^ ^3 {NoAI:1b,PersistenceRequired:1b,Tags:[\"xp\"],attributes:[{id:\"minecraft:max_health\",base:100}],Health:100f}");
			context.waitTicks(40);
			for (int hit = 1; hit <= 3; hit++) {
				context.runOnClient(mc -> {
					var husk = mc.level.getEntitiesOfClass(net.minecraft.world.entity.Mob.class, mc.player.getBoundingBox().inflate(8)).get(0);
					dev.slash3rss.slashclient.hud.skyup.DungeonXp.attacked(mc.player, husk);
				});
				server.runCommand("damage @e[type=husk,tag=xp,limit=1] 10");
				context.waitTicks(3);
				server.runCommand("bossbar set dungeon value " + (120 + hit * 10));
				context.waitTicks(30);
			}
			String learned = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.DungeonXp.learnedForTest(2));
			if (!learned.startsWith("30/0.1/3")) throw new AssertionError("Learned of level 2: " + learned);
			String learnedBar = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.DungeonMap.withXp(net.minecraft.network.chat.Component.literal("Dungeon poz. 2"), 0.5f).getString());
			if (!learnedBar.equals("Dungeon poz. 2 · 150/300 xp")) throw new AssertionError("The bar with the learned XP: " + learnedBar);
			// a level not measured: the formula, scaled as level 2 was (300/225): level 3 314 → 419
			int three = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.DungeonMap.xpNeeded(3));
			if (three != 419) throw new AssertionError("Level 3 scaled: " + three);
			server.runCommand("bossbar remove dungeon");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.DungeonXp.clearForTest());
		}
	}
}
