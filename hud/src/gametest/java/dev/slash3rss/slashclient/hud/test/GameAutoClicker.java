package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The autoclicker clicks on its own, no button held: switched on with no key bound it is armed at
 * once, the left button hits a husk in front of us (also only with it under the crosshair), the
 * right one clicks too; switched off, nothing. The key holding a button lets go of it over a window too.
 */
public class GameAutoClicker implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("execute at @a run summon husk ~ ~ ~2 {NoAI:1b,Silent:1b,PersistenceRequired:1b,Health:200f,attributes:[{id:\"minecraft:max_health\",base:200}]}");
			context.runOnClient(mc -> { TestHooks.firstPerson(); TestHooks.lookSouth(); });
			context.waitTicks(10);
			float start = context.computeOnClient(mc -> TestHooks.nearestHealth());
			if (start < 100) throw new AssertionError("No husk in front of us: " + start);

			// both buttons, no button held: the husk is hit and the right button clicks
			context.runOnClient(mc -> TestHooks.autoClicker(true, true, true, false, false, 10));
			context.waitTicks(40);
			String clicks = context.computeOnClient(mc -> TestHooks.autoClicks());
			float hit = context.computeOnClient(mc -> TestHooks.nearestHealth());
			String[] lr = clicks.split("/");
			if (Integer.parseInt(lr[0]) < 10 || Integer.parseInt(lr[1]) < 10) throw new AssertionError("Too few clicks in 2 s: " + clicks);
			if (hit >= start) throw new AssertionError("The husk was not hit: " + start + " -> " + hit);

			// left only with a mob under the crosshair: looking away, no clicks
			context.runOnClient(mc -> { TestHooks.autoClicker(true, true, false, true, false, 10); mc.player.setYRot(180f); mc.player.setYHeadRot(180f); });
			context.waitTicks(20);
			String away = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (!away.equals("0/0")) throw new AssertionError("Clicked with no mob under the crosshair: " + away);
			context.runOnClient(mc -> TestHooks.lookSouth());
			context.waitTicks(20);
			String onMob = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (onMob.startsWith("0/")) throw new AssertionError("Did not click the mob under the crosshair: " + onMob);

			// switched off: nothing
			context.runOnClient(mc -> TestHooks.autoClicker(false, true, true, false, false, 10));
			context.waitTicks(20);
			String off = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (!off.equals("0/0")) throw new AssertionError("Clicked while switched off: " + off);

			// holding the right button by its key, let go with the same key over a window (the inventory)
			context.runOnClient(mc -> TestHooks.bindHoldUse("key.keyboard.h"));
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_H);
			context.waitTicks(3);
			if (!context.computeOnClient(mc -> TestHooks.holdingUse())) throw new AssertionError("The key did not start holding");
			context.setScreen(() -> new net.minecraft.client.gui.screens.inventory.InventoryScreen(net.minecraft.client.Minecraft.getInstance().player));
			context.waitTicks(3);
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_H);
			context.waitTicks(3);
			if (context.computeOnClient(mc -> TestHooks.holdingUse())) throw new AssertionError("The key did not let go over the inventory");
			if (context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc) == null)) throw new AssertionError("The key reached the window (closed it)");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.bindHoldUse(null));
		}
	}
}
