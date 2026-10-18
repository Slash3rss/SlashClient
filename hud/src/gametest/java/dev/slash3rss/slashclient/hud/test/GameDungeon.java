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
			server.runCommand(String.format("tp @a %d %d %d 180 30", x0, y, z0 + 12));
			context.waitTicks(60);
			server.runCommand("bossbar add dungeon \"Dungeon poz. 3\"");
			server.runCommand("bossbar set dungeon players @a");
			server.runCommand("tellraw @a \"Dungeon » Czy wiesz że... test\"");
			context.waitTicks(30);
			String map = context.computeOnClient(mc -> TestHooks.dungeonMap());
			String[] parts = map.split(",");
			if (Integer.parseInt(parts[0]) < 500 || !parts[1].equals("true") || !parts[2].equals("true")) throw new AssertionError("The dungeon map saw nothing: " + map);
			context.takeScreenshot("dungeon-map");
		}
	}
}
