package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.testing.MapSortTestHooks;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The maps' extras: underground (in a room closed in stone) the minimap switches to the caves and back on the surface;
 * the trail walked; the biomes and the chunk grid on the full map; the map written to disk and read back; Ctrl + click
 * on the full map teleports there (where the player may use /spreadplayers).
 */
public class GameMapExtras implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().adjustSettings(s -> s.setAllowCommands(true)).create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode creative @a");
			server.runCommand("tp @a 0 170 0 180 40");
			context.waitTicks(60);
			int y = 150;
			server.runCommand(String.format("fill -24 %d -24 24 %d 24 grass_block", y, y));
			server.runCommand(String.format("fill 5 %d -12 12 %d -5 red_wool", y, y));
			// a room closed in stone under the grass, with a tunnel going east
			server.runCommand("fill -8 120 -8 8 148 8 stone");
			server.runCommand("fill -3 141 -3 3 143 3 air");
			server.runCommand("fill 4 141 -1 14 142 1 air");
			server.runCommand("fill 0 140 0 0 140 0 glowstone");
			server.runCommand(String.format("tp @a 0 %d 0 180 40", y + 1));
			context.runOnClient(mc -> {
				TestHooks.minimap(true, "square", false, 2f, 120);
				MapSortTestHooks.worldMap(true, 2f);
				MapSortTestHooks.mapOptions("auto", true, true, false, false, true);
			});
			context.waitTicks(80);
			if (context.computeOnClient(mc -> MapSortTestHooks.caves())) throw new AssertionError("Caves on the surface");

			// down into the room: the caves after a moment
			server.runCommand("tp @a 0 141 0 180 60");
			boolean caves = false;
			for (int i = 0; i < 80 && !caves; i++) {
				context.waitTicks(1);
				caves = context.computeOnClient(mc -> MapSortTestHooks.caves());
			}
			if (!caves) throw new AssertionError("The minimap did not switch to the caves underground");
			context.waitTicks(40);
			int[] floor = context.computeOnClient(mc -> TestHooks.minimapColumn(0, 0));
			int[] rock = context.computeOnClient(mc -> TestHooks.minimapColumn(-6, -6));
			System.out.println("SlashClient test: caves: floor " + Integer.toHexString(floor[0]) + " at " + floor[1] + ", rock " + Integer.toHexString(rock[0]));
			if (floor[1] < 138 || floor[1] > 142) throw new AssertionError("The cave's floor is not read at the player's height: " + floor[1]);
			if ((rock[0] >> 16 & 0xFF) > 0x40 || (rock[0] >> 8 & 0xFF) > 0x40 || (rock[0] & 0xFF) > 0x40) throw new AssertionError("Solid rock is not dark in the caves: " + Integer.toHexString(rock[0]));
			context.takeScreenshot("map-caves-minimap");

			// back up: the surface again
			server.runCommand(String.format("tp @a 0 %d 0 180 40", y + 1));
			for (int i = 0; i < 80 && caves; i++) {
				context.waitTicks(1);
				caves = context.computeOnClient(mc -> MapSortTestHooks.caves());
			}
			if (caves) throw new AssertionError("The minimap stayed on the caves on the surface");

			// a walk: the trail
			for (int i = 1; i <= 10; i++) {
				server.runCommand(String.format("tp @a %d %d %d 180 40", -i * 2, y + 1, i * 2));
				context.waitTicks(3);
			}
			int trail = context.computeOnClient(mc -> MapSortTestHooks.trail());
			if (trail < 6) throw new AssertionError("The trail has " + trail + " points after a walk");
			context.waitTicks(40);
			context.takeScreenshot("map-trail-minimap");
			// it fades away: still there after 2 of its 5 minutes, gone after 6
			context.runOnClient(mc -> MapSortTestHooks.trailPass(5, 120));
			int lately = context.computeOnClient(mc -> MapSortTestHooks.trail());
			if (lately != trail) throw new AssertionError("The trail lost points within its length: " + lately + " of " + trail);
			context.runOnClient(mc -> MapSortTestHooks.trailPass(5, 240));
			int old = context.computeOnClient(mc -> MapSortTestHooks.trail());
			if (old != 0) throw new AssertionError("The trail is still there after its length: " + old + " points");
			// walked again: a new trail
			for (int i = 1; i <= 10; i++) {
				server.runCommand(String.format("tp @a %d %d %d 180 40", -i * 2, y + 1, i * 2));
				context.waitTicks(3);
			}
			trail = context.computeOnClient(mc -> MapSortTestHooks.trail());
			if (trail < 6) throw new AssertionError("No new trail after the old one faded: " + trail);

			// the biome under the player is known
			String biome = context.computeOnClient(mc -> MapSortTestHooks.exploredBiome(0, 0));
			if (biome.equals("null")) throw new AssertionError("No biome on the full map");

			// the full map with the grid and the biomes
			context.runOnClient(mc -> MapSortTestHooks.mapOptions("auto", true, true, true, true, true));
			context.getInput().pressKey(InputConstants.KEY_M);
			context.waitTicks(10);
			context.runOnClient(mc -> MapSortTestHooks.mapCenter(0, 0, 2f));
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(5);
			context.takeScreenshot("map-grid-biomes");
			context.runOnClient(mc -> MapSortTestHooks.mapOptions("auto", true, true, true, false, true));
			context.waitTicks(3);
			context.takeScreenshot("map-grid");

			// Ctrl + click: a teleport, where the player may
			String can = context.computeOnClient(mc -> MapSortTestHooks.mapTeleport());
			System.out.println("SlashClient test: teleport " + can);
			if (!can.startsWith("true")) throw new AssertionError("No teleport with cheats on: " + can);
			{
				int[] at = context.computeOnClient(mc -> MapSortTestHooks.mapToWindow(-18.5, 18.5));
				context.getInput().setCursorPos(at[0], at[1]);
				context.getInput().holdKey(InputConstants.KEY_LCONTROL);
				context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_LEFT);
				context.getInput().releaseKey(InputConstants.KEY_LCONTROL);
				context.waitTicks(20);
				String sent = context.computeOnClient(mc -> MapSortTestHooks.mapTeleport());
				if (!sent.contains("spreadplayers -19.5 18.5")) throw new AssertionError("Ctrl + click did not teleport: " + sent);
				double[] pos = context.computeOnClient(mc -> new double[] { mc.player.getX(), mc.player.getZ() });
				if (Math.abs(pos[0] + 18.5) > 2 || Math.abs(pos[1] - 18.5) > 2) throw new AssertionError("Not teleported: " + pos[0] + ", " + pos[1]);
			}
			context.getInput().pressKey(InputConstants.KEY_ESCAPE);
			context.waitTicks(5);

			// written to disk, forgotten and read back: the same map
			int before = context.computeOnClient(mc -> MapSortTestHooks.explored());
			int red = context.computeOnClient(mc -> MapSortTestHooks.exploredColor(8, -8));
			String folder = context.computeOnClient(mc -> MapSortTestHooks.mapReload());
			int after = context.computeOnClient(mc -> MapSortTestHooks.explored());
			int redAfter = context.computeOnClient(mc -> MapSortTestHooks.exploredColor(8, -8));
			int trailAfter = context.computeOnClient(mc -> MapSortTestHooks.trail());
			System.out.println("SlashClient test: map saved in " + folder + ": " + before + " chunks before, " + after + " after, trail " + trailAfter);
			if (after < before || redAfter != red || trailAfter < trail) throw new AssertionError("The map read back from disk differs: " + before + "/" + after + ", " + Integer.toHexString(red) + "/" + Integer.toHexString(redAfter) + ", trail " + trailAfter);
		}
	}
}
