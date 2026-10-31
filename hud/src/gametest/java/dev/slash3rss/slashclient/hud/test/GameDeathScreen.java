package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.testing.DeathInfoTestHooks;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.testing.WorldAidsTestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.network.chat.Component;

/**
 * The death screen: the place (coordinates and dimension) and the time lived under the cause of
 * death, a click copying the coordinates, "Set waypoint" turning the death point into a lasting
 * waypoint (no second point there), a new point when death points are off, the game's own buttons
 * moved down and still working, and the plain screen with the switch off.
 */
public class GameDeathScreen implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			TestServerContext server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("weather clear");
			server.runCommand("gamemode creative @a");
			context.waitTicks(20);
			full(context, server);
			withoutDeathPoint(context, server);
			switchedOff(context, server);
			context.runOnClient(mc -> {
				DeathInfoTestHooks.reset();
				WorldAidsTestHooks.reset();
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static void die(ClientGameTestContext context, TestServerContext server, int x, int y, int z, int livedTicks) {
		die(context, server, "overworld", x, y, z, livedTicks);
	}

	private static void die(ClientGameTestContext context, TestServerContext server, String dimension, int x, int y, int z, int livedTicks) {
		server.runCommand("execute in minecraft:" + dimension + " run tp @a " + x + " " + y + " " + z + " 0 20");
		// another dimension takes a moment to load
		context.waitTicks(dimension.equals("overworld") ? 2 : 40);
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(livedTicks);
		server.runCommand("kill @a");
		context.waitTicks(20);
	}

	private static void click(ClientGameTestContext context, String what) {
		double[] at = context.computeOnClient(mc -> DeathInfoTestHooks.center(what));
		context.getInput().setCursorPos(at[0], at[1]);
		context.waitTicks(3);
		context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTicks(3);
	}

	private static void full(ClientGameTestContext context, TestServerContext server) {
		die(context, server, 10, 120, 30, 120);
		String shown = context.computeOnClient(mc -> DeathInfoTestHooks.shown());
		System.out.println("SlashClient test: death screen " + shown);
		String[] parts = shown.split("\\|");
		String overworld = context.computeOnClient(mc -> Component.translatable("slashclient-hud.worldMap.dim.overworld").getString());
		// where the player was (a block or so lower: the kill came while they sank a little)
		int[] at = coords(parts[0]);
		check(parts.length == 4 && at[0] == 10 && at[1] >= 110 && at[1] <= 120 && at[2] == 30, "The coordinates: " + shown);
		check(parts[1].equals(parts[0] + "  ·  " + overworld), "The coordinates and dimension: " + shown);
		long lived = context.computeOnClient(mc -> DeathInfoTestHooks.lived());
		// 120 ticks between the teleport and the kill, give or take the server's lag
		check(lived >= 100 && lived < 400, "Time lived: " + lived);
		check(parts[2].matches(".*\\b[5-9] s$|.*\\b1[0-9] s$"), "The time lived as shown: " + shown);
		check(!parts[3].equals("-"), "No button to keep the place: " + shown);
		String layout = context.computeOnClient(mc -> DeathInfoTestHooks.layout());
		System.out.println("SlashClient test: death screen layout " + layout);
		String[] l = layout.split(" ");
		check(Integer.parseInt(l[0]) >= Integer.parseInt(l[2]) + 4, "The game's buttons overlap ours: " + layout);
		check(Integer.parseInt(l[1]) <= Integer.parseInt(l[3]), "The game's buttons below the screen: " + layout);
		// the layout checked like the mod's other screens
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(25);
		context.runOnClient(mc -> TestHooks.audit(true));
		context.waitTicks(3);
		context.takeScreenshot("death-screen");
		context.runOnClient(mc -> TestHooks.reportAudit());
		String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
		context.runOnClient(mc -> TestHooks.audit(false));
		if (!problems.isEmpty()) throw new AssertionError("Layout problems on the death screen:\n" + problems);

		// a click on the coordinates copies them
		click(context, "card");
		String copied = context.computeOnClient(mc -> DeathInfoTestHooks.clipboard());
		check(copied.equals(parts[0]), "Copied: " + copied);
		context.takeScreenshot("death-screen-copied");

		// the death point there becomes a lasting waypoint, not a second one
		String before = context.computeOnClient(mc -> DeathInfoTestHooks.pointsAt(at[0], at[1], at[2]));
		check(before.endsWith(" death") && !before.contains(";"), "The death point before: " + before);
		click(context, "save");
		String after = context.computeOnClient(mc -> DeathInfoTestHooks.pointsAt(at[0], at[1], at[2]));
		System.out.println("SlashClient test: death screen kept " + after);
		check(after.endsWith(" kept") && !after.contains(";") && after.matches(".*\\d\\d:\\d\\d kept"), "The point after: " + after);
		// pressed again: nothing more
		click(context, "save");
		check(context.computeOnClient(mc -> DeathInfoTestHooks.pointsAt(at[0], at[1], at[2])).equals(after), "A second press added a point");
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(3);
		context.takeScreenshot("death-screen-saved");

		// the game's Respawn button, moved down, still works
		check(context.computeOnClient(mc -> DeathInfoTestHooks.ownButtonsActive()), "The game's buttons are off");
		click(context, "button 0");
		context.waitTicks(20);
		check(context.computeOnClient(mc -> DeathInfoTestHooks.shown()).equals("none"), "Respawn did not close the death screen");
		long fresh = context.computeOnClient(mc -> DeathInfoTestHooks.lived());
		check(fresh < 60, "The time lived did not start again: " + fresh);
		// the next death elsewhere leaves the kept point where it is
		die(context, server, -40, 120, 30, 20);
		check(context.computeOnClient(mc -> DeathInfoTestHooks.pointsAt(at[0], at[1], at[2])).equals(after), "The next death took the kept point");
		context.runOnClient(mc -> WorldAidsTestHooks.respawn());
		context.waitTicks(20);
	}

	/** In Polish, in the Nether, with death points off: the button makes a new point. */
	private static void withoutDeathPoint(ClientGameTestContext context, TestServerContext server) {
		language(context, "pl_pl");
		context.runOnClient(mc -> SlashHud.config.deathWaypoint = false);
		die(context, server, "the_nether", 60, 110, -20, 20);
		String shown = context.computeOnClient(mc -> DeathInfoTestHooks.shown());
		System.out.println("SlashClient test: death screen in the Nether " + shown);
		String nether = context.computeOnClient(mc -> Component.translatable("slashclient-hud.worldMap.dim.the_nether").getString());
		check(shown.split("\\|")[1].endsWith("  ·  " + nether), "The Nether as the dimension: " + shown);
		int[] at = coords(shown.split("\\|")[0]);
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(25);
		context.takeScreenshot("death-screen-nether-pl");
		check(context.computeOnClient(mc -> DeathInfoTestHooks.pointsAt(at[0], at[1], at[2])).isEmpty(), "A death point though they are off");
		click(context, "save");
		String kept = context.computeOnClient(mc -> DeathInfoTestHooks.pointsAt(at[0], at[1], at[2]));
		check(kept.endsWith(" kept") && !kept.contains(";"), "No point kept without a death point: " + kept);
		context.runOnClient(mc -> {
			SlashHud.config.deathWaypoint = true;
			WorldAidsTestHooks.respawn();
		});
		context.waitTicks(40);
		server.runCommand("execute in minecraft:overworld run tp @a 0 120 0");
		context.waitTicks(40);
		// its switch among the mod's settings
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.HudEditScreen("deathScreen"));
		context.waitTicks(5);
		context.takeScreenshot("death-screen-settings-pl");
		context.setScreen(() -> null);
		language(context, "en_us");
	}

	private static void language(ClientGameTestContext context, String code) {
		var done = context.computeOnClient(mc -> TestHooks.language(code));
		context.waitFor(mc -> done.isDone(), 1200);
		context.waitTicks(60);
	}

	private static void switchedOff(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> DeathInfoTestHooks.enabled(false));
		die(context, server, 80, 120, 30, 20);
		String shown = context.computeOnClient(mc -> DeathInfoTestHooks.shown());
		check(shown.equals("plain"), "Switched off, still shown: " + shown);
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(25);
		context.takeScreenshot("death-screen-off");
		context.runOnClient(mc -> {
			DeathInfoTestHooks.enabled(true);
			WorldAidsTestHooks.respawn();
		});
		context.waitTicks(20);
	}

	private static int[] coords(String s) {
		String[] p = s.split(" ");
		return new int[] { Integer.parseInt(p[0]), Integer.parseInt(p[1]), Integer.parseInt(p[2]) };
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}
}
