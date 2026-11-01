package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The dungeon map's rooms as on SkyUp, from the floor alone (no map above it): each room has its own
 * wall, so two rooms are two blocks apart, and the doorways between them are five blocks wide. A big
 * start room, small rooms around it, one with a pillar in it, a long one: each its own tile on the
 * simple map, none run together through a doorway or split by the pillar.
 */
public class GameDungeonRooms implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode creative @a");
			int x0 = 3000, z0 = 3000, y = 120;
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 + 30, y + 20, z0 + 30));
			context.waitTicks(60);
			// floor, ceiling and solid walls everywhere; the rooms and doorways are cut out of them
			server.runCommand(String.format("fill %d %d %d %d %d %d polished_deepslate", x0 - 3, y - 1, z0 - 3, x0 + 69, y - 1, z0 + 68));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_tiles", x0 - 3, y + 4, z0 - 3, x0 + 69, y + 4, z0 + 68));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 - 3, y, z0 - 3, x0 + 69, y + 3, z0 + 68));
			// rooms (x from, x to, z from, z to): the start room, then columns 35–49 and 52–66, rows 0–14, 17–31, 34–48, 51–65
			int[][] rooms = { { 0, 32, 0, 32 }, { 35, 49, 0, 14 }, { 35, 49, 17, 31 }, { 52, 66, 0, 14 }, { 52, 66, 17, 31 }, { 35, 49, 34, 48 }, { 35, 49, 51, 65 }, { 52, 66, 34, 65 } };
			for (int[] r : rooms) server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 + r[0], y, z0 + r[2], x0 + r[1], y + 3, z0 + r[3]));
			// doorways five wide through the two blocks of wall between rooms
			int[][] doors = { { 33, 34, 5, 9 }, { 33, 34, 22, 26 }, { 40, 44, 15, 16 }, { 50, 51, 5, 9 }, { 50, 51, 22, 26 }, { 57, 61, 15, 16 },
				{ 40, 44, 32, 33 }, { 40, 44, 49, 50 }, { 57, 61, 32, 33 }, { 50, 51, 39, 43 } };
			for (int[] d : doors) server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 + d[0], y, z0 + d[2], x0 + d[1], y + 2, z0 + d[3]));
			// a pillar in the middle of a room: not a wall between two rooms
			server.runCommand(String.format("fill %d %d %d %d %d %d stone", x0 + 58, y, z0 + 23, x0 + 59, y + 3, z0 + 24));
			server.runCommand(String.format("fill %d %d %d %d %d %d lime_concrete", x0, y - 1, z0, x0 + 32, y - 1, z0 + 32));
			// in, as on SkyUp: the hint, the teleport into the start room, the boss bar
			server.runCommand("tellraw @a \"Dungeon » Czy wiesz że... test\"");
			context.waitTicks(10);
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 + 16, y, z0 + 16));
			context.waitTicks(20);
			server.runCommand("bossbar add dungeon \"Dungeon poz. 5\"");
			server.runCommand("bossbar set dungeon players @a");
			// a mob in the long room, a chest in the room with the pillar
			server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b}", x0 + 59, y, z0 + 50));
			server.runCommand(String.format("setblock %d %d %d chest", x0 + 54, y, z0 + 19));
			context.waitTicks(140);
			String found = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!found.startsWith("8 rooms") || !found.endsWith("doors 10")) throw new AssertionError("Rooms and doors as SkyUp builds them: " + found);
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.dungeonStyle = "simple");
			context.waitTicks(10);
			context.takeScreenshot("dungeon-rooms-simple");
			context.runOnClient(mc -> TestHooks.dungeonFull(true));
			context.waitTicks(10);
			context.takeScreenshot("dungeon-rooms-simple-full");
			context.runOnClient(mc -> {
				TestHooks.dungeonFull(false);
				dev.slash3rss.slashclient.hud.SlashHud.config.dungeonStyle = "detailed";
			});
			context.waitTicks(10);
			context.takeScreenshot("dungeon-rooms-detailed");
			server.runCommand("bossbar remove dungeon");
		}
	}
}
