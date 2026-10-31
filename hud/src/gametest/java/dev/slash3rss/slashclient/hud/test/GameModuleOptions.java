package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The modules' own options: the clock's date, the day without its number and the night's warning,
 * the biome's id and colour, light's two kinds and warning level, the weather's time left, the FPS
 * graph's length, the compass's target, and when a module shows (where, and with the chat open).
 */
public class GameModuleOptions implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("weather rain 1200");
			context.runOnClient(mc -> {
				var c = SlashHud.config;
				for (String id : new String[] { "clock", "daytime", "biome", "light", "sky", "fpsgraph", "compass" }) c.placement(id).enabled = true;
				c.clockDate = true;
				c.daytimeDay = false;
				c.daytimeWarn = true;
				c.biomeId = true;
				c.biomeColored = true;
				c.lightSplit = true;
				c.lightWarn = 15;
				c.fpsGraphSamples = 180;
				c.fpsGraphMinMax = true;
				c.compassTarget = "nearest";
				TestHooks.addWaypointHere("Dom");
			});
			server.runCommand("tp @a ~40 ~ ~");
			context.waitTicks(20);

			String clock = context.computeOnClient(mc -> TestHooks.moduleText("clock"));
			check(clock.contains(" · ") && clock.matches(".*\\d.*\\d.*[:]\\d\\d.*"), "the clock without its date: " + clock);
			String day = context.computeOnClient(mc -> TestHooks.moduleText("daytime"));
			check(day.matches("\\d\\d:\\d\\d"), "the day still with its number: " + day);
			String biome = context.computeOnClient(mc -> TestHooks.moduleText("biome"));
			check(biome.startsWith("minecraft:"), "the biome not by its id: " + biome);
			check(!context.computeOnClient(mc -> TestHooks.moduleColor("biome")).equals(context.computeOnClient(mc -> TestHooks.moduleColor("clock"))), "the biome not coloured");
			String light = context.computeOnClient(mc -> TestHooks.moduleText("light"));
			check(light.contains("(") && light.contains(","), "light not split: " + light);
			check(context.computeOnClient(mc -> TestHooks.moduleColor("light")).equals("#FF5555"), "light not red at its warning level");
			String sky = context.computeOnClient(mc -> TestHooks.moduleText("sky"));
			check(sky.matches(".*\\d+:\\d\\d.*\\d+:\\d\\d.*"), "no time left of the rain: " + sky);
			check(context.computeOnClient(mc -> TestHooks.moduleWidth("fpsgraph")) > 180, "the FPS graph not as long as set");
			check(context.computeOnClient(mc -> TestHooks.compassTarget()).equals("Dom"), "the compass points to no waypoint");
			context.takeScreenshot("module-options");

			// the night's warning: orange a minute before, red at night
			server.runCommand("time set 12500");
			context.waitTicks(3);
			check(context.computeOnClient(mc -> TestHooks.moduleColor("daytime")).equals("#FFAA33"), "no warning before the night");
			server.runCommand("time set 15000");
			context.waitTicks(3);
			check(context.computeOnClient(mc -> TestHooks.moduleColor("daytime")).equals("#FF5555"), "not red at night");

			// when it shows: only on servers (not here), hidden with the chat open
			context.runOnClient(mc -> SlashHud.config.placement("clock").showWhen = "multi");
			check(!context.computeOnClient(mc -> TestHooks.moduleShown("clock")), "shown in singleplayer though set for servers");
			context.runOnClient(mc -> {
				var p = SlashHud.config.placement("clock");
				p.showWhen = "single";
				p.hideInChat = true;
			});
			check(context.computeOnClient(mc -> TestHooks.moduleShown("clock")), "not shown in singleplayer");
			context.setScreen(dev.slash3rss.slashclient.hud.Compat::chatScreen);
			context.waitTicks(3);
			check(!context.computeOnClient(mc -> TestHooks.moduleShown("clock")), "shown with the chat open");
			context.setScreen(() -> null);

			// the clock's page: its options and the conditions every module has
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.HudEditScreen("clock"));
			context.waitTicks(5);
			context.takeScreenshot("module-options-clock");
			context.setScreen(() -> null);
			context.runOnClient(mc -> {
				var c = SlashHud.config;
				for (String id : new String[] { "clock", "daytime", "biome", "light", "sky", "fpsgraph", "compass" }) {
					c.placement(id).enabled = false;
					c.placement(id).showWhen = null;
					c.placement(id).hideInChat = false;
				}
				c.clockDate = false;
				c.daytimeDay = true;
				c.daytimeWarn = false;
				c.biomeId = false;
				c.biomeColored = false;
				c.lightSplit = false;
				c.lightWarn = 0;
				c.fpsGraphSamples = 90;
				c.fpsGraphMinMax = false;
				c.compassTarget = "none";
				TestHooks.addWaypointHere(null);
			});
		}
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}
}
