package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The dungeon map's rooms as SkyUp builds them, from the floor alone (no map above it): squares of
 * 13 blocks, each room with its own wall (two rooms are two blocks apart), doorways five blocks wide,
 * and under each room at y 20 a sign with its size ("1x3-G-1") in the corner block the room spreads
 * from (as on SkyUp: top left unturned; rooms turned, their signs with them). A 5×5 start room with
 * walls of its own inside on the grid's lines, rooms of 1×1, 2×2, 1×3, 2×1 (its sign turned: "1x2"),
 * one with a pillar in it and one not seen yet, known from its sign alone: each its own tile on the
 * simple map, and one start room, whole.
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
			int x0 = 3003, z0 = 2994, y = 120, c = 13;
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 + 50, y + 20, z0 + 40));
			context.waitTicks(60);
			// floor, ceiling and solid walls over the squares used; the rooms and doorways are cut out of them
			for (int[] part : new int[][] { { 0, 0, 8, 5 }, { 5, 5, 8, 6 } }) {
				server.runCommand(String.format("fill %d %d %d %d %d %d polished_deepslate", x0 + part[0] * c, y - 1, z0 + part[1] * c, x0 + part[2] * c - 1, y - 1, z0 + part[3] * c - 1));
				server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_tiles", x0 + part[0] * c, y + 3, z0 + part[1] * c, x0 + part[2] * c - 1, y + 3, z0 + part[3] * c - 1));
			}
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0, y, z0, x0 + 8 * c - 1, y + 2, z0 + 5 * c - 1));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 + 5 * c, y, z0 + 5 * c, x0 + 8 * c - 1, y + 2, z0 + 6 * c - 1));
			// rooms in squares (x from, z from, x to, z to) and their signs' text (null: no sign)
			int[][] rooms = { { 0, 0, 4, 4 }, { 5, 0, 5, 0 }, { 6, 0, 7, 1 }, { 5, 1, 5, 3 }, { 6, 2, 7, 2 }, { 6, 3, 6, 3 }, { 7, 3, 7, 5 }, { 5, 4, 6, 5 } };
			// signs as SkyUp's: the size unturned, the room turned (quarters round, the start room never)
			String[] kinds = { "5x5-start-1", "1x1-G-1", "2x2-G-1", "1x3-G-1", "1x2-G-1", "1x1-A-1", "3x1-G-1", "2x2-G-1" };
			int[] turns = { 0, 1, 2, 0, 1, 3, 3, 0 };
			for (int i = 0; i < rooms.length; i++) {
				int[] r = rooms[i];
				server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 + r[0] * c + 1, y, z0 + r[1] * c + 1, x0 + (r[2] + 1) * c - 2, y + 2, z0 + (r[3] + 1) * c - 2));
				server.runCommand(sign(x0, z0, c, r, turns[i], kinds[i]));
			}
			// a room below the start room not seen yet: only its sign
			server.runCommand(sign(x0, z0, c, new int[] { 0, 5, 1, 5 }, 2, "2x1-G-1"));
			// doorways five wide through the two blocks of wall between rooms: across (x of the wall line, square down) or down
			int[][] across = { { 5, 0 }, { 5, 2 }, { 5, 4 }, { 6, 0 }, { 6, 2 }, { 6, 3 }, { 7, 3 }, { 7, 5 } };
			int[][] down = { { 5, 1 }, { 6, 2 }, { 5, 4 } };
			for (int[] d : across) server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 + d[0] * c - 1, y, z0 + d[1] * c + 4, x0 + d[0] * c, y + 1, z0 + d[1] * c + 8));
			for (int[] d : down) server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 + d[0] * c + 4, y, z0 + d[1] * c - 1, x0 + d[0] * c + 8, y + 1, z0 + d[1] * c));
			// a pillar in the middle of the 2×2 room: not a wall between two rooms
			server.runCommand(String.format("fill %d %d %d %d %d %d stone", x0 + 6 * c + 12, y, z0 + 12, x0 + 6 * c + 14, y + 2, z0 + 14));
			// the start room's own walls inside it, on the grid's lines: still one room
			for (int[] w : new int[][] { { 12, 1, 13, 9 }, { 27, 25, 37, 26 }, { 51, 40, 52, 50 } }) server.runCommand(String.format("fill %d %d %d %d %d %d stone", x0 + w[0], y, z0 + w[1], x0 + w[2], y + 2, z0 + w[3]));
			server.runCommand(String.format("fill %d %d %d %d %d %d lime_concrete", x0 + 1, y - 1, z0 + 1, x0 + 5 * c - 2, y - 1, z0 + 5 * c - 2));
			// in, as on SkyUp: the hint, the teleport into the start room, the boss bar
			server.runCommand("tellraw @a \"Dungeon » Czy wiesz że... test\"");
			context.waitTicks(10);
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 + 30, y, z0 + 34));
			context.waitTicks(20);
			server.runCommand("bossbar add dungeon \"Dungeon poz. 5\"");
			server.runCommand("bossbar set dungeon players @a");
			// a mob in the long room, a chest in the room with the pillar
			server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b}", x0 + 7 * c + 6, y, z0 + 5 * c + 6));
			server.runCommand(String.format("setblock %d %d %d chest", x0 + 6 * c + 3, y, z0 + 3));
			context.waitTicks(140);
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.dungeonStyle = "simple");
			context.waitTicks(10);
			context.takeScreenshot("dungeon-rooms-simple");
			context.runOnClient(mc -> TestHooks.dungeonFull(true));
			context.waitTicks(10);
			context.takeScreenshot("dungeon-rooms-simple-full");
			// debug: the grid and the signs over the full map, and what the map knows saved to a file
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.dungeonDebug = true);
			context.waitTicks(5);
			context.takeScreenshot("dungeon-rooms-debug");
			String saved = context.computeOnClient(mc -> TestHooks.dungeonDebugFile());
			if (!saved.contains("<<DUNGEON_TC>>") || !saved.contains("start")) throw new AssertionError("Debug file: " + saved.substring(0, Math.min(400, saved.length())));
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.dungeonDebug = false);
			// (the pictures first: on a failure they show what went wrong)
			String found = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!found.startsWith("8 rooms") || !found.contains("doors 11,") || !found.endsWith("tiles 9, tile doors 11, starts 1")) throw new AssertionError("Rooms and doors as SkyUp builds them: " + found);
			context.runOnClient(mc -> {
				TestHooks.dungeonFull(false);
				dev.slash3rss.slashclient.hud.SlashHud.config.dungeonStyle = "detailed";
			});
			context.waitTicks(10);
			context.takeScreenshot("dungeon-rooms-detailed");
			server.runCommand("bossbar remove dungeon");
		}
	}

	/**
	 * The sign under a room (squares x from, z from, x to, z to), turned `turn` quarters round: as on
	 * SkyUp, in the corner block the room spreads from (top left unturned), turned with the room.
	 */
	private static String sign(int x0, int z0, int c, int[] r, int turn, String kind) {
		int left = x0 + r[0] * c, top = z0 + r[1] * c, right = x0 + (r[2] + 1) * c - 1, bottom = z0 + (r[3] + 1) * c - 1;
		int[][] corner = { { left, top }, { right, top }, { right, bottom }, { left, bottom } };
		return sign(corner[turn][0], corner[turn][1], kind);
	}

	/** The sign under a room (y 20) with SkyUp's three lines; its text as SNBT from 1.21.5, JSON strings before. */
	private static String sign(int x, int z, String kind) {
		//#if MC >= 1.21.5
		return String.format("setblock %d 20 %d oak_sign{front_text:{messages:[\"<<DUNGEON_TC>>\",\"d-zwykly\",\"%s\",\"\"]}}", x, z, kind);
		//#else
		//$ return String.format("setblock %d 20 %d oak_sign{front_text:{messages:['\"<<DUNGEON_TC>>\"','\"d-zwykly\"','\"%s\"','\"\"']}}", x, z, kind);
		//#endif
	}
}
