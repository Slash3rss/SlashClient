package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The minimap: a made-up patch of ground in the sky (grass, a red square, a pool, steps), two
 * waypoints (one on the map, one far off on its edge), north up and square, then round and
 * turning; a block placed shows up by itself; then the Nether (drawn below its roof) and the End.
 */
public class GameMinimap implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode creative @a");
			// there first: blocks can only be placed where the world is loaded
			server.runCommand("tp @a 0 170 0 180 40");
			context.waitTicks(60);
			int y = 150;
			server.runCommand(String.format("fill -24 %d -24 24 %d 24 grass_block", y, y));
			server.runCommand(String.format("fill 5 %d -12 12 %d -5 red_wool", y, y));
			// a pool two blocks deep in a stone basin
			server.runCommand(String.format("fill -16 %d 4 -4 %d 16 stone", y - 2, y));
			server.runCommand(String.format("fill -15 %d 5 -5 %d 15 water", y - 1, y));
			// steps going up to the east, for the height shading
			for (int i = 0; i < 4; i++) server.runCommand(String.format("fill %d %d 4 20 %d 12 stone_bricks", 13 + i * 2, y + 1 + i, y + 1 + i));
			server.runCommand(String.format("tp @a 0 %d 0 180 40", y + 1));
			context.runOnClient(mc -> {
				TestHooks.minimapWaypoint(null, 0, 0, 0);
				TestHooks.minimapWaypoint("Mini dom", 8, y + 1, 8);
				TestHooks.minimapWaypoint("Mini daleko", 400, 70, -260);
				TestHooks.minimap(true, "square", false, 1.5f, 120);
			});
			context.waitTicks(80);
			String summary = context.computeOnClient(mc -> TestHooks.minimapSummary());
			System.out.println("SlashClient test: minimap " + summary);
			if (Integer.parseInt(summary.split(" ")[0]) < 9) throw new AssertionError("The minimap read too little: " + summary);
			int[] red = context.computeOnClient(mc -> TestHooks.minimapColumn(8, -8));
			if (red[1] != y || !reddish(red[0])) throw new AssertionError("The red square: " + Integer.toHexString(red[0]) + " at " + red[1]);
			int[] water = context.computeOnClient(mc -> TestHooks.minimapColumn(-10, 10));
			if ((water[0] & 0xFF) <= (water[0] >> 16 & 0xFF)) throw new AssertionError("The pool is not blue: " + Integer.toHexString(water[0]));
			context.takeScreenshot("minimap-square");

			// a block placed next to the player shows up without anything else happening
			server.runCommand(String.format("fill -2 %d 2 2 %d 4 gold_block", y, y));
			context.waitTicks(50);
			int[] gold = context.computeOnClient(mc -> TestHooks.minimapColumn(0, 3));
			if (!yellowish(gold[0])) throw new AssertionError("The gold placed is not on the map: " + Integer.toHexString(gold[0]));

			// round, closer, turning with the player (who looks south-west)
			server.runCommand(String.format("tp @a 0 %d 0 45 40", y + 1));
			context.runOnClient(mc -> TestHooks.minimap(true, "circle", true, 2f, 140));
			context.waitTicks(20);
			context.takeScreenshot("minimap-round-rotated");
			context.setScreen(dev.slash3rss.slashclient.hud.ui.HudEditScreen::new);
			context.waitTicks(5);
			context.takeScreenshot("minimap-editor");
			context.setScreen(() -> null);

			// the Nether: a room dug out at y 63-67 with a floor of nylium, the roof far above it
			context.runOnClient(mc -> TestHooks.minimap(true, "square", false, 1f, 120));
			server.runCommand("execute in minecraft:the_nether run tp @a 0 64 0 180 40");
			context.waitTicks(80);
			server.runCommand("execute in minecraft:the_nether run fill -8 63 -8 8 67 8 air");
			server.runCommand("execute in minecraft:the_nether run fill -8 62 -8 8 62 8 crimson_nylium");
			server.runCommand("execute in minecraft:the_nether run fill -2 62 -8 2 62 8 warped_nylium");
			server.runCommand("execute in minecraft:the_nether run tp @a 0 63 0 180 40");
			context.waitTicks(60);
			int[] floor = context.computeOnClient(mc -> TestHooks.minimapColumn(5, 5));
			if (floor[1] != 62) throw new AssertionError("The Nether's map is not below the roof: " + Integer.toHexString(floor[0]) + " at " + floor[1]);
			summary = context.computeOnClient(mc -> TestHooks.minimapSummary());
			System.out.println("SlashClient test: minimap in the Nether " + summary);
			context.takeScreenshot("minimap-nether");

			// the End: the island from above
			server.runCommand("execute in minecraft:the_end run tp @a 0 90 0 180 60");
			context.waitTicks(100);
			summary = context.computeOnClient(mc -> TestHooks.minimapSummary());
			System.out.println("SlashClient test: minimap in the End " + summary);
			if (Integer.parseInt(summary.split(" ")[0]) < 4) throw new AssertionError("The End's map read too little: " + summary);
			context.takeScreenshot("minimap-end");

			server.runCommand("execute in minecraft:overworld run tp @a 0 151 0");
			context.waitTicks(20);
			context.runOnClient(mc -> {
				TestHooks.minimapWaypoint(null, 0, 0, 0);
				TestHooks.minimap(false, "square", false, 1f, 100);
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static boolean reddish(int argb) {
		int r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		return r > g + 40 && r > b + 40;
	}

	private static boolean yellowish(int argb) {
		int r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		return r > b + 60 && g > b + 60;
	}
}
