package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.camera.LookLock;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.Minecraft;

/**
 * The look lock: back from another window with the left button held, the mouse turns nothing until holding is let
 * go; with nothing held coming back locks nothing; "always" locks anyway, and the key locks and unlocks. Off, none of it.
 */
public class GameLookLock implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode creative @a");
			server.runCommand("tp @a 0 120 0 0 0");
			context.runOnClient(mc -> {
				var c = dev.slash3rss.slashclient.hud.SlashHud.config;
				c.lookLock = true;
				c.lookLockOnReturn = "holding";
			});
			context.waitTicks(5);

			// held: back from another window, the view stays
			context.runOnClient(mc -> TestHooks.hold(true, true, true));
			alttab(context);
			check(context.computeOnClient(mc -> LookLock.locked()), "the view not locked back from another window");
			check(context.computeOnClient(GameLookLock::turned) == 0, "the mouse turned the player with the view locked");
			context.takeScreenshot("looklock-locked");
			// holding let go: free again
			context.runOnClient(mc -> TestHooks.hold(true, false, true));
			context.waitTicks(3);
			check(!context.computeOnClient(mc -> LookLock.locked()), "the view still locked with holding let go");
			check(context.computeOnClient(GameLookLock::turned) != 0, "the mouse did not turn the player with the view free");

			// nothing held: nothing locked; "always": locked, and the key unlocks
			alttab(context);
			check(!context.computeOnClient(mc -> LookLock.locked()), "the view locked with nothing held");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.lookLockOnReturn = "always");
			alttab(context);
			check(context.computeOnClient(mc -> LookLock.locked()), "\"always\" did not lock the view");
			context.runOnClient(LookLock::pressed);
			check(context.computeOnClient(GameLookLock::turned) != 0, "the key did not unlock the view");
			context.runOnClient(LookLock::pressed);
			check(context.computeOnClient(GameLookLock::turned) == 0, "the key did not lock the view");

			// switched off: unlocked, and the key does nothing
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.lookLock = false);
			context.waitTicks(3);
			check(context.computeOnClient(GameLookLock::turned) != 0, "the view stayed locked with the module off");
			context.runOnClient(LookLock::pressed);
			check(!context.computeOnClient(mc -> LookLock.locked()), "the key locked the view with the module off");
			context.runOnClient(mc -> {
				LookLock.windowForTest = null;
				dev.slash3rss.slashclient.hud.SlashHud.config.lookLockOnReturn = "holding";
			});
		}
	}

	/** The window loses the focus and gets it back, as with Alt+Tab. */
	private static void alttab(ClientGameTestContext context) {
		context.runOnClient(mc -> LookLock.windowForTest = false);
		context.waitTicks(3);
		context.runOnClient(mc -> LookLock.windowForTest = true);
		context.waitTicks(3);
	}

	/** How far a mouse movement turns the player (degrees), the turn put back after. */
	private static float turned(Minecraft mc) {
		float before = mc.player.getYRot();
		mc.player.turn(100, 0);
		float after = mc.player.getYRot();
		mc.player.setYRot(before);
		return after - before;
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError("Look lock: " + what);
	}
}
