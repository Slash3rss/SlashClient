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
 * walls of its own inside on the grid's lines, rooms of 1×1, 2×2, 1×3, 2×1 (their signs as SkyUp writes them),
 * one with a pillar in it and one not seen yet, known from its sign and SkyUp's concrete map over it
 * (its door too): each its own tile on the simple map, and one start room, whole.
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
			// (the size down by across in the top left and bottom right corners, across by down in the others)
			String[] kinds = { "5x5-start-1", "1x1-G-1", "2x2-G-1", "3x1-G-1", "2x1-G-1", "1x1-A-1", "1x3-G-1", "2x2-G-1" };
			int[] turns = { 0, 1, 2, 0, 1, 3, 3, 0 };
			for (int i = 0; i < rooms.length; i++) {
				int[] r = rooms[i];
				server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 + r[0] * c + 1, y, z0 + r[1] * c + 1, x0 + (r[2] + 1) * c - 2, y + 2, z0 + (r[3] + 1) * c - 2));
				server.runCommand(sign(x0, z0, c, r, turns[i], kinds[i]));
			}
			// a room below the start room not seen yet: only its sign
			server.runCommand(sign(x0, z0, c, new int[] { 0, 5, 1, 5 }, 2, "1x2-G-1"));
			// over it SkyUp's map in concrete (y 37, one to one): grey inside, a black wall round it, and a
			// yellow way through the wall to the start room, so the map knows its door before it is seen
			server.runCommand(String.format("fill %d 37 %d %d 37 %d black_concrete", x0, z0 + 5 * c, x0 + 2 * c - 1, z0 + 6 * c - 1));
			server.runCommand(String.format("fill %d 37 %d %d 37 %d gray_concrete", x0 + 1, z0 + 5 * c + 1, x0 + 2 * c - 2, z0 + 6 * c - 2));
			server.runCommand(String.format("fill %d 37 %d %d 37 %d yellow_concrete", x0 + 6, z0 + 5 * c - 1, x0 + 6, z0 + 5 * c + 6));
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
			// a mob with a player's model (an NPC's id, as servers' NPCs have) in the 1×1 room: a mob there, not a player
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.testing.MapSortTestHooks.fakePlayer("Npc", x0 + 5 * c + 6.5, y, z0 + 6.5, true));
			context.waitTicks(20);
			String npc = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!npc.contains("mob tiles 2")) throw new AssertionError("A mob with a player's model on its room's tile: " + npc);
			// such a mob on the tab list still: its name has health and a level in it, a player's has not
			if (!dev.slash3rss.slashclient.hud.skyup.DungeonMap.mobName("27.5 ❤ | ☠ Dezerter (poz. 6)") || dev.slash3rss.slashclient.hud.skyup.DungeonMap.mobName("Slash3rss"))
				throw new AssertionError("A mob's name told from a player's");
			// the long room's tile shows its strongest mobs: the mini boss, the elite, then normal ones
			String[][] mobs = { { "Rycerz poz. 2", "yellow" }, { "Rycerz poz. 3", "yellow" }, { "Rycerz poz. 2", "yellow" }, { "Kat poz. 5", "dark_red" }, { "Łucznik poz. 1", "gold" } };
			for (int i = 0; i < mobs.length; i++) {
				server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b," + name("{\"text\":\"" + mobs[i][0] + "\",\"color\":\"" + mobs[i][1] + "\"}") + "}", x0 + 7 * c + 3 + i % 3 * 3, y, z0 + 3 * c + 3 + i / 3 * 6));
			}
			// the zombie without a name of its own: its name, class and level over its head, on a hologram (as on SkyUp)
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b,NoGravity:1b,Marker:1b,CustomNameVisible:1b," + name("{\"text\":\"Rycerz poz. 9\",\"color\":\"yellow\"}") + "}", x0 + 7 * c + 6, y + 2, z0 + 5 * c + 6));
			context.waitTicks(20);
			String shown = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.DungeonRooms.shownMobs());
			if (!shown.contains("[3/5, 2/1, 1/9, 1/3]")) throw new AssertionError("The strongest mobs first on a tile (class, then level): " + shown);
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
			if (!found.startsWith("9 rooms") || !found.contains("doors 12,") || !found.contains("tiles 9, tile doors 12, starts 1,")) throw new AssertionError("Rooms and doors as SkyUp builds them: " + found);
			// the map's settings on the simple map: larger, following the player zoomed in, mobs as dots,
			// no loot icons; the floor's own settings (colours, a round map) hidden while it is simple
			context.runOnClient(mc -> {
				TestHooks.dungeonFull(false);
				var cfg = dev.slash3rss.slashclient.hud.SlashHud.config;
				cfg.dungeonSize = 180;
				cfg.dungeonFollow = true;
				cfg.dungeonZoom = 2f;
				cfg.dungeonMobOther = "dot";
				cfg.dungeonContainers = false;
			});
			// by the start room's corner, the other rooms in sight
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 + 58, y, z0 + 58));
			context.waitTicks(15);
			context.takeScreenshot("dungeon-rooms-simple-settings");
			// far off, the game no longer knows of the zombie in the long room: the map still shows it there
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 + 30, y + 10, z0 + 300));
			context.waitTicks(40);
			String far = context.computeOnClient(mc -> TestHooks.dungeonRooms() + (java.util.stream.StreamSupport.stream(mc.level.entitiesForRendering().spliterator(), false).noneMatch(e -> net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).getPath().equals("zombie")) ? " (out of sight)" : " (still known)"));
			if (!far.contains("remembered 6") || !far.contains("(out of sight)")) throw new AssertionError("A mob out of sight is remembered on its room: " + far);
			context.runOnClient(mc -> TestHooks.dungeonFull(true));
			context.waitTicks(10);
			context.takeScreenshot("dungeon-rooms-remembered");
			context.runOnClient(mc -> TestHooks.dungeonFull(false));
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 + 58, y, z0 + 58));
			context.waitTicks(20);
			String hidden = context.computeOnClient(mc -> {
				var entry = dev.slash3rss.slashclient.hud.ui.Catalog.entries(() -> {}).stream().filter(e -> e.id().equals("dungeonmap")).findFirst().orElseThrow();
				return entry.settings().stream().filter(st -> dev.slash3rss.slashclient.hud.ui.Catalog.hidden("dungeonmap", st)).map(st -> st.labelKey()).toList().toString();
			});
			if (!hidden.equals("[slashclient-hud.dungeon.plan, slashclient-hud.dungeon.blockColors, slashclient-hud.set.shape, slashclient-hud.dungeon.noSpawner]")) throw new AssertionError("Settings hidden on the simple map: " + hidden);
			context.runOnClient(mc -> {
				var cfg = dev.slash3rss.slashclient.hud.SlashHud.config;
				cfg.dungeonSize = 120;
				cfg.dungeonFollow = false;
				cfg.dungeonZoom = 1f;
				cfg.dungeonMobOther = "head";
				cfg.dungeonContainers = true;
				cfg.dungeonStyle = "detailed";
			});
			context.waitTicks(10);
			context.takeScreenshot("dungeon-rooms-detailed");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.testing.MapSortTestHooks.fakePlayersGone());
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

	/** A custom name in a summon's NBT (JSON text): a component from 1.21.5, a JSON string before. */
	private static String name(String json) {
		//#if MC >= 1.21.5
		return "CustomName:" + json;
		//#else
		//$ return "CustomName:'" + json + "'";
		//#endif
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
