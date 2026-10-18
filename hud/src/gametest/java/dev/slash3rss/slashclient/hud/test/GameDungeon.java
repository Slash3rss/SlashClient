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
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			// the window says SlashClient and its version, and servers are told "slashclient"
			String branding = context.computeOnClient(mc -> TestHooks.branding());
			if (!branding.matches("SlashClient \\d[\\w.\\-]*\\|slashclient")) throw new AssertionError("Title and brand: " + branding);
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
			// the start room's floor is green
			server.runCommand(String.format("fill %d %d %d %d %d %d lime_concrete", x0 - 5, y - 1, z0 + 7, x0 + 5, y - 1, z0 + 17));
			// as on SkyUp: the hint while still in the lobby, far away, then the teleport, then the boss bar
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0 - 600, y + 20, z0));
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
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b,equipment:{head:{id:\"minecraft:spawner\",count:1}}}", x0 - 6, y, z0 + 6));
			context.runOnClient(mc -> TestHooks.dungeonRound(true));
			context.waitTicks(30);
			context.takeScreenshot("dungeon-map-round");
			context.runOnClient(mc -> TestHooks.dungeonRound(false));
			// rooms: three containers in three rooms, one broken; a mob killed in the room next door
			server.runCommand(String.format("setblock %d %d %d chest", x0 - 12, y, z0));
			server.runCommand(String.format("setblock %d %d %d barrel", x0 + 12, y, z0));
			server.runCommand(String.format("setblock %d %d %d decorated_pot", x0, y, z0 + 2));
			server.runCommand(String.format("setblock %d %d %d potted_dandelion", x0 - 3, y, z0 + 15));
			// an ore in the start room's wall, mined later
			server.runCommand(String.format("setblock %d %d %d deepslate_diamond_ore", x0 - 6, y + 1, z0 + 15));
			server.runCommand(String.format("summon husk %d %d %d {NoAI:1b,PersistenceRequired:1b}", x0 + 12, y, z0 + 12));
			context.waitTicks(30);
			String rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!rooms.contains("containers 0/4") || !rooms.contains("ores 0/1")) throw new AssertionError("Containers not found: " + rooms);
			server.runCommand(String.format("setblock %d %d %d air", x0, y, z0 + 2));
			server.runCommand(String.format("setblock %d %d %d deepslate_bricks", x0 - 6, y + 1, z0 + 15));
			server.runCommand("kill @e[type=husk]");
			context.waitTicks(30);
			rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!rooms.contains("containers 1/4") || !rooms.contains("ores 1/1") || rooms.contains("cleared 0") || rooms.contains("without spawner 0")) throw new AssertionError("Rooms: " + rooms);
			if (Integer.parseInt(rooms.split(" ")[0]) < 7) throw new AssertionError("Too few rooms: " + rooms);
			context.takeScreenshot("dungeon-rooms");
			// spawner holograms (armour stand names): the respawn time counts as cleared
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b,NoGravity:1b,CustomNameVisible:1b,CustomName:\"Posiłki za: 30s\"}", x0 - 12, y + 1, z0 - 12));
			server.runCommand(String.format("summon armor_stand %d %d %d {Invisible:1b,NoGravity:1b,CustomNameVisible:1b,CustomName:\"Pozostałe moby: 4\"}", x0 + 12, y + 1, z0 - 12));
			// mob classes by their name's colour: an elite (gold) and a mini boss (dark red)
			server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b,CustomName:{text:\"Elita\",color:\"gold\"}}", x0 - 3, y, z0 + 9));
			server.runCommand(String.format("summon zombie %d %d %d {NoAI:1b,PersistenceRequired:1b,CustomName:{text:\"Mini boss\",color:\"dark_red\"}}", x0 + 3, y, z0 + 9));
			context.waitTicks(30);
			rooms = context.computeOnClient(mc -> TestHooks.dungeonRooms());
			if (!rooms.contains("cleared 2")) throw new AssertionError("Hologram not read: " + rooms);
			context.takeScreenshot("dungeon-holograms");
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
}
