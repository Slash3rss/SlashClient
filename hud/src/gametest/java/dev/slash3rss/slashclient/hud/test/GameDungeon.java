package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The dungeon map: a made-up dungeon of nine rooms in the sky (a green start room among them),
 * the server's line on entering and its boss bar, then the map drawn from what is around.
 */
public class GameDungeon implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			// the window says SlashClient with the launcher's and the game's versions, servers are told "slashclient" with both
			String branding = context.computeOnClient(mc -> TestHooks.branding());
			String game = context.computeOnClient(mc -> net.minecraft.SharedConstants.getCurrentVersion().name());
			if (!branding.equals("SlashClient 9.9.9-test · " + game + "|slashclient 9.9.9-test/" + game)) throw new AssertionError("Title and brand: " + branding);
			String f3 = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.brandedVersion("Minecraft 1.21.4 (1.21.4/vanilla)"));
			if (!f3.equals("SlashClient 9.9.9-test/1.21.4 (1.21.4/vanilla)")) throw new AssertionError("F3's version line: " + f3);
			server.runCommand("time set 6000");
			// flying, so waiting above the place before the dungeon is built is safe
			server.runCommand("gamemode creative @a");
			int x0 = 1000, z0 = 1000, y = 120;
			// there first: blocks can only be placed where the world is loaded
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0, y + 20, z0 + 12));
			context.waitTicks(60);
			// floor and ceiling, then walls every 12 blocks, with a door in the middle of each
			server.runCommand(String.format("fill %d %d %d %d %d %d polished_deepslate", x0 - 18, y - 1, z0 - 18, x0 + 18, y - 1, z0 + 18));
			server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_tiles", x0 - 18, y + 4, z0 - 18, x0 + 18, y + 4, z0 + 18));
			for (int i = -18; i <= 18; i += 12) {
				server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 - 18, y, z0 + i, x0 + 18, y + 3, z0 + i));
				server.runCommand(String.format("fill %d %d %d %d %d %d deepslate_bricks", x0 + i, y, z0 - 18, x0 + i, y + 3, z0 + 18));
			}
			for (int a = -12; a <= 12; a += 12) {
				for (int b = -6; b <= 6; b += 12) {
					server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 + a - 1, y, z0 + b, x0 + a + 1, y + 2, z0 + b));
					server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 + b, y, z0 + a - 1, x0 + b, y + 2, z0 + a + 1));
				}
			}
			// SkyUp's map above it (y 38, one to one): rooms inside, black walls, a yellow way through each door
			server.runCommand(String.format("fill %d 38 %d %d 38 %d gray_terracotta", x0 - 18, z0 - 18, x0 + 18, z0 + 18));
			for (int i = -18; i <= 18; i += 12) {
				server.runCommand(String.format("fill %d 38 %d %d 38 %d black_terracotta", x0 - 18, z0 + i, x0 + 18, z0 + i));
				server.runCommand(String.format("fill %d 38 %d %d 38 %d black_terracotta", x0 + i, z0 - 18, x0 + i, z0 + 18));
			}
			for (int a = -12; a <= 12; a += 12) {
				for (int b = -6; b <= 6; b += 12) {
					server.runCommand(String.format("setblock %d 38 %d yellow_terracotta", x0 + a, z0 + b));
					server.runCommand(String.format("setblock %d 38 %d yellow_terracotta", x0 + b, z0 + a));
				}
			}
			// a pit four blocks deep in the room west of the start: the same room, its floor on the map
			server.runCommand(String.format("fill %d %d %d %d %d %d air", x0 - 15, y - 4, z0 + 9, x0 - 9, y - 1, z0 + 15));
			server.runCommand(String.format("fill %d %d %d %d %d %d polished_deepslate", x0 - 15, y - 5, z0 + 9, x0 - 9, y - 5, z0 + 15));
			// the start room's floor is green
			server.runCommand(String.format("fill %d %d %d %d %d %d lime_concrete", x0 - 5, y - 1, z0 + 7, x0 + 5, y - 1, z0 + 17));
			// as on SkyUp: the hint while still in the lobby, then the teleport, then the boss bar
			// the lobby close by and higher: the map starts there, the teleport does not start it anew,
			// and the dungeon's ground must come from where the player is when the boss bar shows
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 - 40, y + 30, z0));
			context.waitTicks(20);
			server.runCommand("tellraw @a \"Dungeon » Czy wiesz że... test\"");
			context.waitTicks(20);
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0, y, z0 + 12));
			context.waitTicks(40);
			server.runCommand("bossbar add dungeon \"Dungeon poz. 3\"");
			server.runCommand("bossbar set dungeon players @a");
			context.waitTicks(40);
			String map = context.computeOnClient(mc -> TestHooks.dungeonMap());
			String[] parts = map.split(",");
			if (Integer.parseInt(parts[0]) < 500 || !parts[1].equals("true") || !parts[2].equals("true")) throw new AssertionError("The dungeon map saw nothing: " + map);
			context.takeScreenshot("dungeon-map");
			// what is about: a mob, a spawner (an armour stand with one on its head), round and zoomed in
			server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b}", x0 + 6, y, z0 + 6));
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b," + head("minecraft:spawner") + "}", x0 - 6, y, z0 + 6));
			context.runOnClient(mc -> TestHooks.dungeonRound(true));
			context.waitTicks(30);
			context.takeScreenshot("dungeon-map-round");
			context.runOnClient(mc -> TestHooks.dungeonRound(false));
			// rooms: three containers in three rooms, one broken; a mob killed in the room next door
			// the chest at the bottom of the pit, 4 blocks under the floor: still counted, in its room
			server.runCommand(String.format("setblock %d %d %d chest", x0 - 12, y - 4, z0 + 12));
			server.runCommand(String.format("setblock %d %d %d barrel", x0 + 12, y, z0));
			server.runCommand(String.format("setblock %d %d %d decorated_pot", x0, y, z0 + 2));
			server.runCommand(String.format("setblock %d %d %d potted_dandelion", x0 - 3, y, z0 + 15));
			// an ore in a wall of the room east of the start, mined later
			server.runCommand(String.format("setblock %d %d %d deepslate_diamond_ore", x0 + 18, y + 1, z0 + 15));
			// and ancient debris in the same wall
			server.runCommand(String.format("setblock %d %d %d ancient_debris", x0 + 18, y + 1, z0 + 17));
			// the start room has nothing to take: this chest and the potted dandelion there are not counted
			server.runCommand(String.format("setblock %d %d %d chest", x0 + 3, y, z0 + 15));
			// the husk's room has a spawner: only such a room counts down to its mobs coming back
			server.runCommand(String.format("setblock %d %d %d spawner", x0 + 14, y, z0 + 10));
			server.runCommand(String.format("summon husk %d %d %d {NoAI:1b,PersistenceRequired:1b}", x0 + 12, y, z0 + 12));
			context.waitTicks(30);
			String rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!rooms.contains("containers 0/3") || !rooms.contains("ores 0/2")) throw new AssertionError("Containers not found: " + rooms);
			server.runCommand(String.format("setblock %d %d %d air", x0, y, z0 + 2));
			server.runCommand(String.format("setblock %d %d %d deepslate_bricks", x0 + 18, y + 1, z0 + 15));
			server.runCommand("kill @e[type=husk]");
			context.waitTicks(30);
			rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!rooms.contains("containers 1/3") || !rooms.contains("ores 1/2") || rooms.contains("cleared 0") || !rooms.contains("without spawner 0")) throw new AssertionError("Rooms (the start room is never one without a spawner): " + rooms);
			// from the map above: exactly the nine rooms, none run together through a door
			if (Integer.parseInt(rooms.split(" ")[0]) != 9) throw new AssertionError("Rooms from the map above: " + rooms);
			context.takeScreenshot("dungeon-rooms");
			// zoomed in, following the player, the start room out of sight: an arrow on the map's edge to it
			context.runOnClient(mc -> {
				dev.slash3rss.slashclient.hud.SlashHud.config.dungeonFollow = true;
				dev.slash3rss.slashclient.hud.SlashHud.config.dungeonZoom = 4f;
			});
			server.runCommand(String.format("tp @a %d %d %d", x0 + 30, y + 2, z0 + 30));
			context.waitTicks(20);
			context.takeScreenshot("dungeon-start-arrow");
			context.runOnClient(mc -> {
				dev.slash3rss.slashclient.hud.SlashHud.config.dungeonFollow = false;
				dev.slash3rss.slashclient.hud.SlashHud.config.dungeonZoom = 1f;
			});
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0, y, z0 + 12));
			context.waitTicks(10);
			// spawner holograms (armour stand names): the respawn time counts as cleared
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b,NoGravity:1b,CustomNameVisible:1b," + name("\"Posiłki za: 30s\"") + "}", x0 - 12, y + 1, z0 - 12));
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b,NoGravity:1b,CustomNameVisible:1b," + name("\"Pozostałe moby: 4\"") + "}", x0 + 12, y + 1, z0 - 12));
			// mob classes by their name's colour: an elite (gold) and a mini boss (dark red)
			server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b," + name("{\"text\":\"Elita\",\"color\":\"gold\"}") + "}", x0 - 3, y, z0 + 9));
			server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b," + name("{\"text\":\"Mini boss\",\"color\":\"dark_red\"}") + "}", x0 + 3, y, z0 + 9));
			// as on SkyUp: the health first in red, then the name in its class's colour; a spawner's hologram
			server.runCommand(String.format("summon husk %d %d %d {NoAI:1b,PersistenceRequired:1b," + name("[{\"text\":\"20.0 ❤ | \",\"color\":\"red\"},{\"text\":\"Giermek \",\"color\":\"gold\"},{\"text\":\"poz. 1\",\"color\":\"gray\"}]") + "}", x0 + 12, y, z0 - 9));
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b,NoGravity:1b,CustomNameVisible:1b," + name("{\"text\":\"Spawner\",\"color\":\"gold\"}") + "}", x0 + 12, y + 2, z0 - 12));
			context.waitTicks(30);
			// a minion: its name in dark purple
			server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b," + name("{\"text\":\"Minion\",\"color\":\"dark_purple\"}") + "}", x0 + 6, y, z0 - 3));
			context.waitTicks(5);
			String target = context.computeOnClient(mc -> TestHooks.targetName());
			if (!target.equals("☺ Żniwiarz poz. 100|Steve")) throw new AssertionError("Target's name: " + target);
			String kinds = context.computeOnClient(mc -> TestHooks.dungeonKinds());
			if (!kinds.equals("[2, 2, 3, 4] spawners 1")) throw new AssertionError("Mob classes and spawners: " + kinds);
			rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!rooms.contains("cleared 2")) throw new AssertionError("Hologram not read: " + rooms);
			context.takeScreenshot("dungeon-holograms");
			// a room can have up to three spawners: one cleared and one still with mobs is no cleared room yet
			server.runCommand(String.format("summon armor_stand %d %d %d {Tags:[\"second\"],Invisible:1b,NoGravity:1b,CustomNameVisible:1b," + name("\"Pozostałe moby: 2\"") + "}", x0 - 9, y + 1, z0 - 12));
			context.waitTicks(30);
			rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!rooms.contains("cleared 1")) throw new AssertionError("A room with a spawner still full counted as cleared: " + rooms);
			// that one cleared too: the room is cleared again
			server.runCommand("kill @e[tag=second]");
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b,NoGravity:1b,CustomNameVisible:1b," + name("\"Posiłki za: 50s\"") + "}", x0 - 9, y + 1, z0 - 12));
			context.waitTicks(30);
			rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!rooms.contains("cleared 2")) throw new AssertionError("Both spawners cleared, but the room is not: " + rooms);
			// a spawner block up on a ledge in the room south-east: visited, it is a room with a spawner
			server.runCommand(String.format("fill %d %d %d %d %d %d stone", x0 + 15, y, z0 + 15, x0 + 16, y + 2, z0 + 16));
			server.runCommand(String.format("setblock %d %d %d spawner", x0 + 15, y + 3, z0 + 15));
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 + 10, y, z0 + 10));
			context.waitTicks(30);
			rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0, y, z0 + 12));
			context.waitTicks(10);
			if (!rooms.contains("without spawner 0")) throw new AssertionError("The spawner on the ledge was not counted: " + rooms);
			context.runOnClient(mc -> TestHooks.dungeonFull(true));
			context.waitTicks(10);
			context.takeScreenshot("dungeon-full");
			context.runOnClient(mc -> TestHooks.dungeonFull(false));
			// leaving: the server's line and the boss bar gone end the map; the lobby is not mapped
			server.runCommand("tellraw @a \"Dungeon » Opuszczono drużynę.\"");
			server.runCommand("tellraw @a \"Dungeon » Opuszczono Dungeon poz. 3\"");
			server.runCommand("bossbar remove dungeon");
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 - 600, y + 20, z0));
			context.waitTicks(40);
			map = context.computeOnClient(mc -> TestHooks.dungeonMap());
			if (!map.split(",")[1].equals("false")) throw new AssertionError("The map stayed on after leaving: " + map);
		}
	}

	/** A custom name in a summon's NBT (JSON text): a component from 1.21.5, a JSON string before. */
	private static String name(String json) {
		//#if MC >= 1.21.5
		return "CustomName:" + json;
		//#else
		//$ return "CustomName:'" + json + "'";
		//#endif
	}

	/** An armour stand's head item in NBT: "equipment" from 1.21.5, "ArmorItems" (feet first) before. */
	private static String head(String item) {
		//#if MC >= 1.21.5
		return "equipment:{head:{id:\"" + item + "\",count:1}}";
		//#endif
		//#if MC >= 1.20.5 && MC < 1.21.5
		//$ return "ArmorItems:[{},{},{},{id:\"" + item + "\",count:1}]";
		//#endif
		//#if MC < 1.20.5
		//$ return "ArmorItems:[{},{},{},{id:\"" + item + "\",Count:1b}]";
		//#endif
	}
}
