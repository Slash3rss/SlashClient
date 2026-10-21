package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.InvToolsTestHooks;
import dev.slash3rss.slashclient.hud.MapSortTestHooks;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Friends on the minimap and the map over the whole screen. Made-up friends sharing their
 * position (as if they came from the launcher): one close (its face and nick), one far (an arrow
 * on the edge), one in the Nether (not shown). Then M: the ground seen, also where the player
 * walked away from, waypoints (own, a friend's shared one), zoomed in and out with the wheel,
 * dragged, a new waypoint with a right click, opened with a click, hidden; the same key closes it.
 */
public class GameWorldMap implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode creative @a");
			server.runCommand("tp @a 0 170 0 180 40");
			context.waitTicks(60);
			int y = 150;
			server.runCommand(String.format("fill -24 %d -24 24 %d 24 grass_block", y, y));
			server.runCommand(String.format("fill 5 %d -12 12 %d -5 red_wool", y, y));
			server.runCommand(String.format("fill -16 %d 4 -4 %d 16 stone", y - 2, y));
			server.runCommand(String.format("fill -15 %d 5 -5 %d 15 water", y - 1, y));
			server.runCommand(String.format("tp @a 0 %d 0 180 40", y + 1));
			context.runOnClient(mc -> {
				InvToolsTestHooks.quiet();
				MapSortTestHooks.clearWaypoints();
				TestHooks.minimapWaypoint(null, 0, 0, 0);
				TestHooks.minimapWaypoint("Mapa dom", 8, y + 1, 8);
				TestHooks.minimapWaypoint("Mapa kopalnia", -60, 64, 90);
				MapSortTestHooks.sharedWaypoint("Mapa baza Oli", 30, 70, -40, "Ola");
				TestHooks.minimap(true, "square", false, 1.5f, 120);
				MapSortTestHooks.worldMap(true, 2f);
				MapSortTestHooks.friendsOnMap(true);
				MapSortTestHooks.friendsClear();
			});
			context.waitTicks(80);

			// friends sharing their position: close by, far away, and one in the Nether
			context.runOnClient(mc -> {
				MapSortTestHooks.friend("kumpel", "Kumpel", "minecraft:overworld", 14, y + 1, -18);
				MapSortTestHooks.friend("ola", "Ola", "minecraft:overworld", 420, 70, 260);
				MapSortTestHooks.friend("bartek", "Bartek", "minecraft:the_nether", 3, 64, 3);
			});
			context.waitTicks(5);
			String shown = context.computeOnClient(mc -> MapSortTestHooks.friendsShown());
			if (!shown.equals("Kumpel,Ola,")) throw new AssertionError("Friends shown on the minimap: " + shown);
			context.takeScreenshot("friends-minimap");
			// one stops sharing: gone at once
			context.runOnClient(mc -> MapSortTestHooks.friendGone("ola"));
			shown = context.computeOnClient(mc -> MapSortTestHooks.friendsShown());
			if (!shown.equals("Kumpel,")) throw new AssertionError("A friend who stopped sharing is still shown: " + shown);
			context.runOnClient(mc -> MapSortTestHooks.friend("ola", "Ola", "minecraft:overworld", 420, 70, 260));

			// walking away and back: the map still knows where the player was
			server.runCommand("tp @a 260 120 0 180 60");
			context.waitTicks(100);
			server.runCommand(String.format("tp @a 0 %d 0 180 40", y + 1));
			context.waitTicks(60);
			int known = context.computeOnClient(mc -> MapSortTestHooks.explored());
			int red = context.computeOnClient(mc -> MapSortTestHooks.exploredColor(8, -8));
			int far = context.computeOnClient(mc -> MapSortTestHooks.exploredColor(300, 0));
			System.out.println("SlashClient test: world map knows " + known + " chunks, red square " + Integer.toHexString(red) + ", far away " + Integer.toHexString(far));
			if (known < 40 || red == 0 || far == 0) throw new AssertionError("The map forgot what was seen: " + known + " chunks, " + Integer.toHexString(red) + ", " + Integer.toHexString(far));
			if ((red >> 16 & 0xFF) < (red & 0xFF) + 40) throw new AssertionError("The red square is not red on the map: " + Integer.toHexString(red));

			// meanwhile the friends' positions went stale (nothing new for 8 s: they are no longer shown); fresh ones come
			for (int i = 0; i < 40 && !context.computeOnClient(mc -> MapSortTestHooks.friendsShown()).isEmpty(); i++) context.waitTicks(5);
			if (!context.computeOnClient(mc -> MapSortTestHooks.friendsShown()).isEmpty()) throw new AssertionError("Stale friends' positions are still shown");
			context.runOnClient(mc -> {
				MapSortTestHooks.friend("kumpel", "Kumpel", "minecraft:overworld", 14, y + 1, -18);
				MapSortTestHooks.friend("ola", "Ola", "minecraft:overworld", 420, 70, 260);
			});
			// M opens the map
			context.getInput().pressKey(InputConstants.KEY_M);
			context.waitTicks(10);
			if (!context.computeOnClient(mc -> MapSortTestHooks.mapOpen())) throw new AssertionError("M did not open the map");
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(5);
			context.takeScreenshot("worldmap");

			// the wheel: in, then out
			int[] middle = context.computeOnClient(mc -> MapSortTestHooks.mapMiddle());
			context.getInput().setCursorPos(middle[0], middle[1]);
			for (int i = 0; i < 4; i++) {
				context.getInput().scroll(1);
				context.waitTicks(1);
			}
			context.waitTicks(5);
			String in = context.computeOnClient(mc -> MapSortTestHooks.mapState());
			if (Float.parseFloat(in.split(",")[0]) < 4.5f) throw new AssertionError("The wheel did not zoom in: " + in);
			context.takeScreenshot("worldmap-zoomed-in");
			for (int i = 0; i < 9; i++) {
				context.getInput().scroll(-1);
				context.waitTicks(1);
			}
			context.waitTicks(10);
			String out = context.computeOnClient(mc -> MapSortTestHooks.mapState());
			if (Float.parseFloat(out.split(",")[0]) > 1.2f) throw new AssertionError("The wheel did not zoom out: " + out);
			context.takeScreenshot("worldmap-zoomed-out");

			// dragged to the left: the map moves east
			context.runOnClient(mc -> MapSortTestHooks.mapCenter(0, 0, 2f));
			context.waitTicks(2);
			middle = context.computeOnClient(mc -> MapSortTestHooks.mapMiddle());
			context.getInput().setCursorPos(middle[0], middle[1]);
			context.getInput().holdMouse(InputConstants.MOUSE_BUTTON_LEFT);
			for (int i = 1; i <= 10; i++) {
				context.getInput().setCursorPos(middle[0] - i * 20, middle[1] - i * 6);
				context.waitTicks(1);
			}
			context.getInput().releaseMouse(InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(5);
			String panned = context.computeOnClient(mc -> MapSortTestHooks.mapState());
			System.out.println("SlashClient test: map dragged " + panned);
			if (Integer.parseInt(panned.split(",")[1]) < 20) throw new AssertionError("Dragging did not move the map: " + panned);
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(3);
			context.takeScreenshot("worldmap-panned");

			// back to the player, a right click puts a new waypoint by the pool, opened at once
			context.runOnClient(mc -> MapSortTestHooks.mapCenter(0, 0, 3f));
			context.waitTicks(2);
			int[] at = context.computeOnClient(mc -> MapSortTestHooks.mapToWindow(-10.5, 10.5));
			context.getInput().setCursorPos(at[0], at[1]);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_RIGHT);
			context.waitTicks(5);
			String added = context.computeOnClient(mc -> MapSortTestHooks.mapState());
			String opened = added.substring(added.lastIndexOf(',') + 1);
			if (opened.equals("-")) throw new AssertionError("A right click did not add a waypoint: " + added);
			String where = context.computeOnClient(mc -> MapSortTestHooks.waypoint(opened));
			if (!where.startsWith("-11,") || !where.endsWith(",10,true")) throw new AssertionError("The new waypoint is not where it was clicked: " + where);
			context.runOnClient(mc -> MapSortTestHooks.mapRename("Mapa staw"));
			context.waitTicks(3);
			context.takeScreenshot("worldmap-new-waypoint");

			// a click on another waypoint opens it; its eye hides it
			at = context.computeOnClient(mc -> MapSortTestHooks.mapToWindow(8.5, 8.5));
			context.getInput().setCursorPos(at[0], at[1] - 8);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(5);
			String chosen = context.computeOnClient(mc -> MapSortTestHooks.mapState());
			if (!chosen.endsWith(",Mapa dom")) throw new AssertionError("A click on a waypoint did not open it: " + chosen);
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(3);
			context.takeScreenshot("worldmap-waypoint-open");

			// M closes it again; the zoom stays for the next time
			context.getInput().pressKey(InputConstants.KEY_M);
			context.waitTicks(5);
			if (context.computeOnClient(mc -> MapSortTestHooks.mapOpen())) throw new AssertionError("M did not close the map");

			context.runOnClient(mc -> {
				MapSortTestHooks.clearWaypoints();
				MapSortTestHooks.friendsClear();
				TestHooks.minimapWaypoint(null, 0, 0, 0);
				TestHooks.minimap(false, "square", false, 1f, 100);
				MapSortTestHooks.worldMap(true, 2f);
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
