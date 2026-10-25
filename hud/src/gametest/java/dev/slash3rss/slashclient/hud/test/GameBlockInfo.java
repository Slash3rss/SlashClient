package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Block info's extra lines: wheat half grown, a hive full of honey with two bees (and its facing in the state),
 * the block's coordinates and id; the module on the HUD with them.
 */
public class GameBlockInfo implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("fill -2 99 -2 2 99 4 farmland");
			server.runCommand("setblock 0 100 2 minecraft:wheat[age=3]");
			// two bees inside, staying put
			//#if MC >= 1.20.5
			server.runCommand("setblock 1 100 3 minecraft:beehive[honey_level=5,facing=north]{bees:[{entity_data:{id:\"minecraft:bee\"},ticks_in_hive:0,min_ticks_in_hive:999999},{entity_data:{id:\"minecraft:bee\"},ticks_in_hive:0,min_ticks_in_hive:999999}]}");
			//#else
			//$ server.runCommand("setblock 1 100 3 minecraft:beehive[honey_level=5,facing=north]{Bees:[{EntityData:{id:\"minecraft:bee\"},TicksInHive:0,MinOccupationTicks:999999},{EntityData:{id:\"minecraft:bee\"},TicksInHive:0,MinOccupationTicks:999999}]}");
			//#endif
			// standing south of the wheat, looking down at it
			server.runCommand("tp @a 0.5 100 0.5 0 45");
			context.waitTicks(20);
			String wheat = context.computeOnClient(mc -> TestHooks.blockInfoLines());
			check(wheat.contains("43%") && wheat.contains("(3/7)") && wheat.contains("0 100 2") && wheat.contains("minecraft:wheat"), "the wheat", wheat);
			context.takeScreenshot("blockinfo-wheat");
			server.runCommand("tp @a 1.5 100 1.5 0 20");
			context.waitTicks(20);
			String hive = context.computeOnClient(mc -> TestHooks.blockInfoLines());
			check(hive.contains("5/5") && hive.contains("2/3") && hive.contains("facing=north") && !hive.contains("honey_level="), "the hive", hive);
			context.takeScreenshot("blockinfo-hive");
			// a frame with a worn sword turned three times, on stone (with a floor to stand on)
			server.runCommand("fill 4 99 0 10 99 4 stone");
			server.runCommand("setblock 9 100 3 minecraft:stone");
			//#if MC >= 1.20.5
			server.runCommand("summon minecraft:item_frame 9 100 2 {Facing:2b,ItemRotation:3b,Item:{id:\"minecraft:diamond_sword\",count:1,components:{\"minecraft:damage\":100}}}");
			//#else
			//$ server.runCommand("summon minecraft:item_frame 9 100 2 {Facing:2b,ItemRotation:3b,Item:{id:\"minecraft:diamond_sword\",Count:1b,tag:{Damage:100}}}");
			//#endif
			server.runCommand("tp @a 9.5 100 1.5 0 35");
			context.waitTicks(20);
			String frame = context.computeOnClient(mc -> TestHooks.blockInfoLines());
			check(frame.contains("3/8") && frame.contains("1461/1561"), "the frame", frame);
			context.takeScreenshot("blockinfo-frame");
			// obsidian: a netherite pickaxe at best, a diamond one at least
			server.runCommand("setblock 5 99 1 minecraft:obsidian");
			server.runCommand("tp @a 5.5 100 1.5 0 90");
			context.waitTicks(10);
			String best = context.computeOnClient(mc -> TestHooks.blockInfoLines());
			check(best.contains("best Netherite Pickaxe · min. Diamond Pickaxe"), "obsidian, the best pickaxe", best);
			context.takeScreenshot("blockinfo-best-tool");
			// dug half way: the bar along the bottom; another block dug: none for this one
			float half = context.computeOnClient(mc -> TestHooks.digging(5, 99, 1, 0.5f));
			// really dug for a while with a diamond pickaxe: the bar on the screen
			world.getServer().runCommand("gamemode survival @a");
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:diamond_pickaxe");
			context.waitTicks(5);
			context.getInput().holdKey(o -> o.keyAttack);
			context.waitTicks(40);
			float dug = context.computeOnClient(mc -> TestHooks.breakingAt(5, 99, 1));
			context.takeScreenshot("blockinfo-breaking");
			context.getInput().releaseKey(o -> o.keyAttack);
			if (dug <= 0.05f || dug >= 1f) throw new AssertionError("Block info's breaking bar while digging: " + dug);
			float other = context.computeOnClient(mc -> {
				TestHooks.digging(6, 99, 1, 0.5f);
				return TestHooks.breakingAt(5, 99, 1);
			});
			context.runOnClient(mc -> TestHooks.digging(5, 99, 1, -1));
			if (half != 0.5f || other != -1f) throw new AssertionError("Block info's breaking bar (this block, another): " + half + " " + other);
			//#if MC >= 1.21.9
			// a shelf with five diamonds in its first slot
			server.runCommand("setblock 5 100 3 minecraft:oak_shelf[facing=north]{Items:[{Slot:0b,id:\"minecraft:diamond\",count:5}]}");
			server.runCommand("tp @a 5.5 100 1.5 0 35");
			context.waitTicks(20);
			String shelf = context.computeOnClient(mc -> TestHooks.blockInfoLines());
			check(shelf.contains("1. ") && shelf.contains("×5") && shelf.contains("2. "), "the shelf", shelf);
			context.takeScreenshot("blockinfo-shelf");
			//#endif
		}
	}

	private static void check(boolean ok, String what, String got) {
		if (!ok) throw new AssertionError("Block info, " + what + ":\n" + got);
	}
}
