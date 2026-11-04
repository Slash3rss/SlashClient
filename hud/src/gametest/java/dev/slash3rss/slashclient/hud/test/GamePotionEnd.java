package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * A potion running out: an effect given by a command says nothing when it ends; a potion really drunk does (a toast
 * in the corner); with a warning five seconds early it says so once, on the banner at the top, and not again at the end.
 */
public class GamePotionEnd implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("gamemode survival @a");
			context.runOnClient(mc -> { TestHooks.firstPerson(); TestHooks.lookSouth(); TestHooks.potionEnd("toast", 0); });

			// not from a potion: nothing
			int before = context.computeOnClient(mc -> TestHooks.potionNotifications());
			world.getServer().runCommand("effect give @a minecraft:jump_boost 2");
			context.waitTicks(60);
			int afterCommand = context.computeOnClient(mc -> TestHooks.potionNotifications());
			if (afterCommand != before) throw new AssertionError("A notification for an effect given by a command");

			// a potion of 3 s drunk: told when it ends
			drink(context, world, 60);
			int toast = waitFor(context, before + 1, 100);
			if (toast != before + 1) throw new AssertionError("No notification when the drunk potion ran out: " + toast);
			context.waitTicks(10);
			context.takeScreenshot("potion-end-toast");

			// 10 s with a warning 5 s early, on the banner: once, not again at the end
			context.runOnClient(mc -> TestHooks.potionEnd("banner", 5));
			drink(context, world, 200);
			int warned = waitFor(context, toast + 1, 160);
			if (warned != toast + 1) throw new AssertionError("No warning before the potion ran out: " + warned);
			context.waitTicks(10);
			if (!context.computeOnClient(mc -> TestHooks.potionBanner())) throw new AssertionError("No banner for the warning");
			context.takeScreenshot("potion-end-banner");
			context.waitTicks(140);
			int end = context.computeOnClient(mc -> TestHooks.potionNotifications());
			if (end != warned) throw new AssertionError("Told again at the end after the warning: " + end);
		}
	}

	/** The player drinks a potion of speed II lasting `ticks`, holding the use key as a player would. */
	private static void drink(ClientGameTestContext context, TestSingleplayerContext world, int ticks) {
		world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:potion[potion_contents={custom_effects:[{id:\"minecraft:speed\",duration:" + ticks + ",amplifier:1}]}]");
		context.waitTicks(5);
		context.getInput().holdKey(o -> o.keyUse);
		context.waitTicks(40);
		context.getInput().releaseKey(o -> o.keyUse);
	}

	/** Waits up to `ticks` for `want` notifications: how many there are then. */
	private static int waitFor(ClientGameTestContext context, int want, int ticks) {
		int n = 0;
		for (int i = 0; i < ticks; i++) {
			context.waitTicks(1);
			n = context.computeOnClient(mc -> TestHooks.potionNotifications());
			if (n >= want) return n;
		}
		return n;
	}
}
