package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.CameraDistance;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.WorldAidsTestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The world helpers: a death point put where the player died (and moved by the next death), the
 * Nether coordinates module in both dimensions, the light level overlay on a made-up floor in the
 * sky (a closed room in red, the open floor in yellow, nothing by a torch, on water, slabs or
 * glass), the rain switched off for us only, and the F5 camera's distance from the wheel.
 */
public class GameWorldAids implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			TestServerContext server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("weather clear");
			server.runCommand("gamemode creative @a");
			deathPoint(context, server);
			netherCoords(context, server);
			lightOverlay(context, server);
			weather(context, server);
			camera(context, server);
			context.runOnClient(mc -> WorldAidsTestHooks.reset());
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static void deathPoint(ClientGameTestContext context, TestServerContext server) {
		server.runCommand("tp @a 10 120 30 0 0");
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(20);
		server.runCommand("kill @a");
		context.waitTicks(20);
		String point = context.computeOnClient(mc -> WorldAidsTestHooks.deathPoint());
		System.out.println("SlashClient test: death point " + point);
		if (!point.startsWith("10 ") || !point.contains(" 30 minecraft:overworld")) throw new AssertionError("No death point where the player died: " + point);
		context.takeScreenshot("worldaids-death-screen");
		context.runOnClient(mc -> WorldAidsTestHooks.respawn());
		context.waitTicks(40);
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		// a death elsewhere in the same dimension moves it
		server.runCommand("tp @a -20 120 30 0 0");
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(20);
		server.runCommand("kill @a");
		context.waitTicks(20);
		point = context.computeOnClient(mc -> WorldAidsTestHooks.deathPoint());
		int count = context.computeOnClient(mc -> WorldAidsTestHooks.deathPoints());
		if (!point.startsWith("-20 ") || count != 1) throw new AssertionError("The next death did not replace the point: " + point + " (" + count + ")");
		context.runOnClient(mc -> WorldAidsTestHooks.respawn());
		context.waitTicks(40);
		// seen from 20 blocks north of it, with its name and distance
		server.runCommand("tp @a -20 122 10 0 5");
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(30);
		context.takeScreenshot("worldaids-death-waypoint");
	}

	private static void netherCoords(ClientGameTestContext context, TestServerContext server) {
		server.runCommand("tp @a 800 100 -1600 0 0");
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(40);
		String shown = context.computeOnClient(mc -> WorldAidsTestHooks.netherCoords(true));
		System.out.println("SlashClient test: nether coords " + shown);
		if (!shown.endsWith("100 100 -200") || !shown.startsWith("Nether")) throw new AssertionError("Overworld → Nether: " + shown);
		context.waitTicks(5);
		context.takeScreenshot("worldaids-nether-coords");
		server.runCommand("execute in minecraft:the_nether run tp @a 12 70 -5 0 0");
		context.waitTicks(10);
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(50);
		shown = context.computeOnClient(mc -> WorldAidsTestHooks.netherCoords(true));
		System.out.println("SlashClient test: nether coords in the Nether " + shown);
		// x and z times 8 (12.5 and -4.5: the middle of the blocks tp put the player in), the height as it is
		if (!shown.startsWith("Overworld: 100 ") || !shown.endsWith(" -36")) throw new AssertionError("Nether → Overworld: " + shown);
		context.takeScreenshot("worldaids-nether-coords-nether");
		server.runCommand("execute in minecraft:the_end run tp @a 0 90 0 0 0");
		context.waitTicks(60);
		shown = context.computeOnClient(mc -> WorldAidsTestHooks.netherCoords(true));
		if (!shown.equals("hidden")) throw new AssertionError("Shown in the End: " + shown);
		context.runOnClient(mc -> WorldAidsTestHooks.netherCoords(false));
		server.runCommand("execute in minecraft:overworld run tp @a 0 160 0");
		context.waitTicks(60);
	}

	private static void lightOverlay(ClientGameTestContext context, TestServerContext server) {
		int y = 149;
		server.runCommand("tp @a 0 160 16 180 45");
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(40);
		server.runCommand(String.format("fill -12 %d -12 12 %d 12 stone", y, y));
		server.runCommand(String.format("fill -12 %d -12 12 %d 12 air", y + 1, y + 8));
		// a closed room of tinted glass (no light gets in, the floor still shows through)
		// (glass is no ground to spawn on: the room's floor is stone again)
		server.runCommand(String.format("fill -11 %d -11 -1 %d -1 tinted_glass hollow", y, y + 4));
		server.runCommand(String.format("fill -10 %d -10 -2 %d -2 stone", y, y));
		// a torch on the open floor, a pool, a row of bottom slabs and one of glass
		server.runCommand(String.format("setblock 6 %d 6 torch", y + 1));
		server.runCommand(String.format("fill 4 %d -10 10 %d -4 water", y, y));
		server.runCommand(String.format("fill -10 %d 9 10 %d 9 smooth_stone_slab", y, y));
		server.runCommand(String.format("fill -10 %d 11 10 %d 11 glass", y, y));
		server.runCommand("tp @a 0 157 6 180 55");
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(60);
		String counts = context.computeOnClient(mc -> WorldAidsTestHooks.lightOverlay(true, 20));
		System.out.println("SlashClient test: light overlay " + counts);
		String[] c = counts.split(" ");
		if (Integer.parseInt(c[1]) < 20 || Integer.parseInt(c[2]) < 50) throw new AssertionError("Too few spots: " + counts);
		expect(context, -5, y + 1, -5, "red", "inside the closed room");
		expect(context, -8, y + 1, 5, "yellow", "on the open floor");
		expect(context, 6, y + 1, 7, "-", "by the torch");
		expect(context, 7, y + 1, -7, "-", "on the water");
		expect(context, 0, y + 1, 9, "-", "on a bottom slab");
		expect(context, 0, y + 1, 11, "-", "on glass");
		expect(context, -5, y + 1, -1, "-", "in the glass wall");
		context.waitTicks(10);
		context.takeScreenshot("worldaids-light-overlay");
		// at night the open floor is no different (the overlay shows what can spawn by night too)
		server.runCommand("time set 18000");
		context.waitTicks(10);
		context.takeScreenshot("worldaids-light-overlay-night");
		server.runCommand("time set 6000");
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.HudEditScreen("lightOverlay"));
		context.waitTicks(5);
		context.takeScreenshot("worldaids-light-overlay-settings");
		context.setScreen(() -> null);
		context.waitTicks(2);
		// its key switches it off
		context.getInput().pressKey(o -> dev.slash3rss.slashclient.hud.LightOverlay.key);
		context.waitTicks(5);
		boolean off = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.LightOverlay.spots().isEmpty());
		if (!off) throw new AssertionError("The overlay's key did not switch it off");
	}

	private static void expect(ClientGameTestContext context, int x, int y, int z, String want, String where) {
		String got = context.computeOnClient(mc -> WorldAidsTestHooks.spotAt(x, y, z));
		if (!got.equals(want)) throw new AssertionError("Light overlay " + where + " (" + x + " " + y + " " + z + "): " + got + ", not " + want);
	}

	private static void weather(ClientGameTestContext context, TestServerContext server) {
		server.runCommand("tp @a 300 100 300 0 30");
		context.runOnClient(mc -> WorldAidsTestHooks.fly());
		context.waitTicks(40);
		// plains around, so it rains (not snows, not dry)
		server.runCommand("fillbiome 270 60 270 330 160 330 minecraft:plains");
		server.runCommand("weather rain");
		context.waitTicks(140);
		float raining = context.computeOnClient(mc -> WorldAidsTestHooks.rainLevel());
		if (raining < 0.5f) throw new AssertionError("It does not rain: " + raining);
		context.takeScreenshot("worldaids-weather-rain");
		context.runOnClient(mc -> WorldAidsTestHooks.weatherOff(true));
		context.waitTicks(20);
		float off = context.computeOnClient(mc -> WorldAidsTestHooks.rainLevel());
		if (off != 0f) throw new AssertionError("Weather off still rains: " + off);
		context.takeScreenshot("worldaids-weather-off");
		// left on for the camera's pictures; reset() switches it off
		server.runCommand("weather clear");
	}

	private static void camera(ClientGameTestContext context, TestServerContext server) {
		server.runCommand("tp @a 0 151 -16 0 20");
		context.runOnClient(mc -> {
			WorldAidsTestHooks.fly();
			TestHooks.thirdPerson(true);
			WorldAidsTestHooks.cameraDistance(true, true, Float.NaN);
		});
		context.waitTicks(30);
		double near = context.computeOnClient(mc -> WorldAidsTestHooks.cameraFromEyes());
		context.takeScreenshot("worldaids-camera-default");
		// without its key the wheel still changes the hotbar slot
		int slot = context.computeOnClient(mc -> WorldAidsTestHooks.hotbarSlot());
		context.getInput().scroll(-1);
		context.waitTicks(2);
		if (context.computeOnClient(mc -> WorldAidsTestHooks.cameraTarget()) != 4f) throw new AssertionError("The wheel moved the camera without its key");
		if (context.computeOnClient(mc -> WorldAidsTestHooks.hotbarSlot()) == slot) throw new AssertionError("The wheel no longer changes the hotbar slot");
		// with it held: further out, the slot as it was
		slot = context.computeOnClient(mc -> WorldAidsTestHooks.hotbarSlot());
		context.getInput().holdKey(o -> CameraDistance.key);
		for (int i = 0; i < 6; i++) context.getInput().scroll(-1);
		context.getInput().releaseKey(o -> CameraDistance.key);
		float target = context.computeOnClient(mc -> WorldAidsTestHooks.cameraTarget());
		System.out.println("SlashClient test: camera distance after the wheel " + target);
		if (target < 9f) throw new AssertionError("The wheel did not move the camera out: " + target);
		if (context.computeOnClient(mc -> WorldAidsTestHooks.hotbarSlot()) != slot) throw new AssertionError("The wheel changed the slot while moving the camera");
		context.waitTicks(30);
		double far = context.computeOnClient(mc -> WorldAidsTestHooks.cameraFromEyes());
		System.out.println("SlashClient test: camera from the eyes " + near + " → " + far);
		if (far < near + 4) throw new AssertionError("The camera did not move out: " + near + " → " + far);
		context.takeScreenshot("worldaids-camera-far");
		// close up, and the limits
		context.runOnClient(mc -> WorldAidsTestHooks.cameraDistance(true, true, 1.5f));
		context.waitTicks(10);
		context.takeScreenshot("worldaids-camera-near");
		// its settings card
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.HudEditScreen("cameraDistance"));
		context.waitTicks(5);
		context.takeScreenshot("worldaids-camera-settings");
		context.setScreen(() -> null);
		context.runOnClient(mc -> WorldAidsTestHooks.cameraDistance(true, false, 100f));
		if (context.computeOnClient(mc -> WorldAidsTestHooks.cameraTarget()) != CameraDistance.MAX) throw new AssertionError("Past the far limit");
		context.runOnClient(mc -> {
			WorldAidsTestHooks.cameraDistance(false, true, Float.NaN);
			TestHooks.thirdPerson(false);
		});
	}
}
