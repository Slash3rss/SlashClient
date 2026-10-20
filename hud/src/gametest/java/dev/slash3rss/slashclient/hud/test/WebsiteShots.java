package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Screenshots for the website, in a real (not flat) world at 1920×1080. Only with -Pshots: the
 * player then has that nick, and wears textures/skin/slash3rss.png from the test resources.
 */
public class WebsiteShots implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		// without -Pshots there is nothing to do; every test has to end on the vanilla title screen
		if (!Boolean.getBoolean("slashclient.test.shots")) {
			context.runOnClient(mc -> TestHooks.vanillaMenu());
			return;
		}
		context.getInput().resizeWindow(1920, 1080);
		context.runOnClient(mc -> TestHooks.guiScale(3));
		context.runOnClient(mc -> TestHooks.testSkin("slash3rss"));
		context.runOnClient(mc -> TestHooks.slashMenu());

		// the menu, the figure looking towards the buttons
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.getInput().setCursorPos(760, 520);
		context.waitTicks(60);
		context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-menu");

		try (TestSingleplayerContext world = context.worldBuilder().setUseConsistentSettings(false).adjustSettings(s -> s.setSeed("slashclient")).create()) {
			context.waitTicks(100);
			for (String cmd : new String[] {
				"time set 1000", "weather clear", "gamerule doDaylightCycle false", "gamerule advance_time false",
				"item replace entity @a armor.head with diamond_helmet", "item replace entity @a armor.chest with diamond_chestplate",
				"item replace entity @a armor.legs with diamond_leggings", "item replace entity @a armor.feet with diamond_boots",
				"item replace entity @a weapon.mainhand with diamond_sword", "item replace entity @a weapon.offhand with golden_apple",
				"effect give @a speed 600 0 true", "effect give @a night_vision 600 0 true",
				"gamerule show_advancement_messages false", "gamerule announceAdvancements false",
				// on a pillar above the trees, looking out over the land
				"spreadplayers 0 0 0 40 false @a",
				"execute at @a run fill ~ ~ ~ ~ ~9 ~ stone_bricks",
				"execute at @a run tp @a ~ ~10 ~ 135 12",
			}) world.getServer().runCommand(cmd);
			context.runOnClient(mc -> TestHooks.defaults());
			context.runOnClient(mc -> TestHooks.renderDistance(16));
			context.waitTicks(200);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-hud");

			context.setScreen(dev.slash3rss.slashclient.hud.HudEditScreen::new);
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-hud-editor");
			context.setScreen(dev.slash3rss.slashclient.hud.HudEditScreen::settingsWindow);
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-hud-settings");
			context.setScreen(() -> null);

			// the cape from behind, an emote by the name, the emote wheel
			world.getServer().runCommand("item replace entity @a armor.chest with air");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", false));
			context.waitTicks(20);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-cape");
			world.getServer().runCommand("item replace entity @a armor.chest with elytra");
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-elytra");
			world.getServer().runCommand("item replace entity @a armor.chest with diamond_chestplate");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", true));
			context.runOnClient(mc -> TestHooks.emoteSelf("heart"));
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-emote");
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.emoteWheel());
			context.getInput().setCursorPos(1060, 380);
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-wheel");
			context.setScreen(() -> null);

			// friends with invites
			String friend = context.computeOnClient(mc -> TestHooks.sampleInvites());
			context.setScreen(() -> {
				dev.slash3rss.slashclient.hud.social.Social.viewing = friend;
				return new dev.slash3rss.slashclient.hud.social.FriendsScreen(null);
			});
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-friends");
			context.setScreen(() -> null);

			// a real benchmark run and its result
			context.runOnClient(mc -> TestHooks.startBenchmark());
			long started = System.currentTimeMillis();
			while (context.computeOnClient(mc -> TestHooks.benchmarkRunning()) && System.currentTimeMillis() - started < 120_000) context.waitTick();
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("web-bench");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
		}
		context.getInput().resizeWindow(854, 480);
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
