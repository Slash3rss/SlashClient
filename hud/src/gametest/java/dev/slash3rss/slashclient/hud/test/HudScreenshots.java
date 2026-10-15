package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.ChatScreen;

/** Plays a little and takes screenshots, so the HUD and the extras can be checked by eye. */
public class HudScreenshots implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			// gear and effects so the armour, item and effect modules have something to show
			for (String cmd : new String[] {
				"item replace entity @p armor.head with diamond_helmet",
				"item replace entity @p armor.chest with iron_chestplate",
				"item replace entity @p armor.legs with golden_leggings",
				"item replace entity @p armor.feet with diamond_boots",
				"item replace entity @p weapon.mainhand with diamond_sword",
				"give @p ender_pearl 16",
				"give @p arrow 48",
				"give @p totem_of_undying 1",
				"effect give @p speed 300 1",
				"effect give @p night_vision 600 0",
				"summon zombie ~ ~ ~3 {NoAI:1b}",
			}) world.getServer().runCommand(cmd);
			context.waitTicks(60);
			context.getInput().holdKey(o -> o.keyUp);
			context.waitTicks(10);
			context.takeScreenshot("hud-in-game");
			context.getInput().releaseKey(o -> o.keyUp);
			context.setScreen(HudEditScreen::new);
			context.waitTicks(5);
			context.takeScreenshot("hud-editor");

			// every module on, to see that nothing overlaps
			context.runOnClient(mc -> HudEditScreen.enableAll());
			context.setScreen(() -> null);
			context.waitTicks(5);
			context.takeScreenshot("hud-all-modules");

			// extras: own crosshair, zoom held, time stamps
			context.runOnClient(mc -> TestHooks.extras());
			context.getInput().holdKey(TestHooks::zoomKey);
			context.waitTicks(20);
			context.takeScreenshot("extras-zoom-crosshair");
			context.getInput().releaseKey(TestHooks::zoomKey);

			// chat tabs: a few lines, then the "@" tab that catches the player's name
			world.getServer().runCommand("tellraw @a \"Hello everyone\"");
			world.getServer().runCommand("tellraw @a \"Player0, are you there?\"");
			world.getServer().runCommand("tellraw @a \"[Party] Steve: gg\"");
			context.waitTicks(5);
			context.setScreen(() -> new ChatScreen("", false));
			context.waitTicks(5);
			context.takeScreenshot("chat-all");
			context.runOnClient(mc -> TestHooks.selectTab(0));
			context.waitTicks(5);
			context.takeScreenshot("chat-mentions-tab");
			context.runOnClient(mc -> TestHooks.selectTab(-1));

			// sharing: a code made here must give the same settings back
			context.runOnClient(mc -> TestHooks.shareRoundTrip());
			context.setScreen(() -> null);
		}
	}
}
