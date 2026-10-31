package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The item counter counts what its settings pick: the usual groups (arrows of every kind together),
 * a group switched off left out, the player's own items, and the item in hand (blocks while building).
 */
public class GameItemCounter implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("clear @a");
			server.runCommand("item replace entity @a hotbar.0 with cobblestone 64");
			server.runCommand("item replace entity @a hotbar.1 with arrow 20");
			server.runCommand("item replace entity @a hotbar.2 with spectral_arrow 12");
			server.runCommand("item replace entity @a hotbar.3 with ender_pearl 4");
			server.runCommand("item replace entity @a inventory.0 with cobblestone 30");
			server.runCommand("item replace entity @a inventory.1 with tnt 5");
			server.runCommand("item replace entity @a inventory.2 with totem_of_undying");
			context.runOnClient(mc -> {
				var c = SlashHud.config;
				c.placement("items").enabled = true;
				c.itemsTotems = false;
				c.itemsHeld = true;
				c.itemsCustom = "tnt, minecraft:nonexistent";
				TestHooks.selectSlot(0);
			});
			context.waitTicks(10);
			String shown = context.computeOnClient(mc -> TestHooks.itemCounts());
			if (!shown.equals("arrow 32, ender_pearl 4, tnt 5, cobblestone 94")) throw new AssertionError("The item counter shows: " + shown);
			context.takeScreenshot("item-counter");

			// the defaults again: the totem counted, nothing of the player's own, not the hand
			context.runOnClient(mc -> {
				var c = SlashHud.config;
				c.itemsTotems = true;
				c.itemsHeld = false;
				c.itemsCustom = "";
			});
			shown = context.computeOnClient(mc -> TestHooks.itemCounts());
			if (!shown.equals("arrow 32, ender_pearl 4, totem_of_undying 1")) throw new AssertionError("The item counter as it was: " + shown);

			// its page with the groups and the own items' field
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.HudEditScreen("items"));
			context.waitTicks(5);
			context.takeScreenshot("item-counter-settings");
			context.setScreen(() -> null);
			context.runOnClient(mc -> SlashHud.config.placement("items").enabled = false);
		}
	}
}
