package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The dungeon loot highlight: a made-up dungeon room in the sky with loot of every kind (a double
 * chest, barrels, a pot, a flower pot, an ore in a wall, and a chest behind a wall), nothing
 * outlined before the dungeon starts, everything once in it, a barrel broken gone at once, the
 * chest behind the wall seen only through walls, the distance limit, and nothing after leaving.
 */
public class GameLootHighlight implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			TestServerContext server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("weather clear");
			server.runCommand("gamemode creative @a");
			int x0 = 3000, z0 = 3000, y = 130;
			server.runCommand(String.format("tp @a %d %d %d 180 15", x0, y + 20, z0 + 6));
			context.waitTicks(60);
			// a room: floor, walls round it, a wall across with a chest behind it
			server.runCommand(String.format("fill %d %d %d %d %d %d polished_deepslate", x0 - 10, y - 1, z0 - 10, x0 + 10, y - 1, z0 + 10));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 - 10, y, z0 - 10, x0 + 10, y + 3, z0 - 10));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 - 10, y, z0 + 10, x0 + 10, y + 3, z0 + 10));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 - 10, y, z0 - 10, x0 - 10, y + 3, z0 + 10));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 + 10, y, z0 - 10, x0 + 10, y + 3, z0 + 10));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 - 4, y, z0 - 5, x0 + 4, y + 3, z0 - 5));
			// the loot: a double chest (its left half east), two barrels, a pot, a flower pot, an ore in the wall, a chest behind it
			server.runCommand(String.format("setblock %d %d %d chest[facing=south,type=left]", x0 - 1, y, z0 - 2));
			server.runCommand(String.format("setblock %d %d %d chest[facing=south,type=right]", x0 - 2, y, z0 - 2));
			server.runCommand(String.format("setblock %d %d %d barrel[facing=up]", x0 + 1, y, z0 - 2));
			server.runCommand(String.format("setblock %d %d %d barrel[facing=up]", x0 + 3, y, z0));
			server.runCommand(String.format("setblock %d %d %d decorated_pot", x0 + 3, y, z0 - 3));
			server.runCommand(String.format("setblock %d %d %d potted_dandelion", x0 - 4, y, z0 - 3));
			server.runCommand(String.format("setblock %d %d %d deepslate_diamond_ore", x0 + 2, y + 1, z0 - 5));
			server.runCommand(String.format("setblock %d %d %d chest[facing=south]", x0, y, z0 - 7));
			server.runCommand(String.format("tp @a %d.5 %d %d.5 180 15", x0, y, z0 + 6));
			context.waitTicks(20);
			// switched on outside a dungeon: nothing
			String shown = context.computeOnClient(mc -> TestHooks.lootHighlight(true, false, -1));
			if (!shown.startsWith("0 ")) throw new AssertionError("Loot outlined outside a dungeon: " + shown);
			// as on SkyUp: the hint, then the boss bar
			server.runCommand("tellraw @a \"Dungeon » Czy wiesz że... test\"");
			context.waitTicks(10);
			server.runCommand("bossbar add dungeon \"Dungeon poz. 1\"");
			server.runCommand("bossbar set dungeon players @a");
			context.waitTicks(60);
			shown = context.computeOnClient(mc -> TestHooks.lootHighlight(true, false, -1));
			System.out.println("SlashClient test: loot highlight " + shown);
			if (!shown.equals("7 [2, 2, 1, 1, 1]")) throw new AssertionError("Loot in the dungeon: " + shown);
			double widest = context.computeOnClient(mc -> TestHooks.lootWidest());
			if (widest < 1.8 || widest > 2.01) throw new AssertionError("The double chest is not one box: " + widest);
			context.takeScreenshot("loot-highlight-all");
			// a barrel broken: gone from the highlight at once, before the map's next scan
			server.runCommand(String.format("setblock %d %d %d air", x0 + 3, y, z0));
			context.waitTicks(2);
			shown = context.computeOnClient(mc -> TestHooks.lootHighlight(true, false, -1));
			if (!shown.equals("6 [2, 1, 1, 1, 1]")) throw new AssertionError("The broken barrel still outlined: " + shown);
			context.waitTicks(20);
			// and once the map noticed, it stays gone
			shown = context.computeOnClient(mc -> TestHooks.lootHighlight(true, false, -1));
			if (!shown.equals("6 [2, 1, 1, 1, 1]")) throw new AssertionError("Taken loot came back: " + shown);
			context.takeScreenshot("loot-highlight");
			// through walls: the chest behind the wall shows too
			context.runOnClient(mc -> TestHooks.lootHighlight(true, true, -1));
			context.waitTicks(5);
			context.takeScreenshot("loot-highlight-walls");
			// only what is near: the ore and the chest behind the wall are further than 10 blocks
			shown = context.computeOnClient(mc -> TestHooks.lootHighlight(true, false, 10));
			int near = Integer.parseInt(shown.split(" ")[0]);
			if (near <= 0 || near >= 5) throw new AssertionError("The distance limit: " + shown);
			// leaving: the server's line and the boss bar gone, nothing outlined
			server.runCommand("tellraw @a \"Dungeon » Opuszczono Dungeon poz. 1\"");
			server.runCommand("bossbar remove dungeon");
			context.waitTicks(40);
			shown = context.computeOnClient(mc -> TestHooks.lootHighlight(true, false, -1));
			if (!shown.startsWith("0 ")) throw new AssertionError("Loot outlined after leaving: " + shown);
			context.takeScreenshot("loot-highlight-left");
			context.runOnClient(mc -> TestHooks.lootHighlight(false, false, 32));
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
