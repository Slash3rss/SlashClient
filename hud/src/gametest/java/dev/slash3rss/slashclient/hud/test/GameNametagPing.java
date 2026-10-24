package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.GameHud;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CameraType;

/**
 * Players' ping after their name above the head (our own name in F5 standing in for another player's on
 * a server): the milliseconds from the tab list in its colours, next to the logo, the clan tag and
 * "● NA ŻYWO" without covering them; nothing for no ping (0), with the setting off, or in singleplayer.
 */
public class GameNametagPing implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> {
				mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
				mc.player.setYRot(0);
				mc.player.setXRot(10);
			});
			String name = context.computeOnClient(mc -> mc.player.getName().getString());

			// the setting is off by default
			if (context.computeOnClient(mc -> new dev.slash3rss.slashclient.hud.HudConfig().nametagPing)) throw new AssertionError("Nametag ping on by default");
			context.runOnClient(mc -> SlashHud.config.nametagPing = true);
			// singleplayer: everyone's ping is ours, nothing shows
			check(context, false, 45, name);

			// on a server: the tab list's colours
			for (int ms : new int[] {45, 120, 220, 450}) {
				String expected = name + " " + ms + "ms" + String.format("#%06X", GameHud.pingColor(ms) & 0xFFFFFF);
				check(context, true, ms, expected);
				if (ms == 45 || ms == 450) {
					context.waitTicks(5);
					context.takeScreenshot("nametag-ping-" + ms);
				}
			}
			// with the logo in a rank's colour, a clan tag and "● NA ŻYWO" above
			context.runOnClient(mc -> TestHooks.nametagExtras(true));
			check(context, true, 120, name + " 120ms" + String.format("#%06X", GameHud.pingColor(120) & 0xFFFFFF));
			context.waitTicks(5);
			context.takeScreenshot("nametag-ping-extras");
			// from the side, sneaking: the ping fades with the name
			context.runOnClient(mc -> mc.player.setYRot(60));
			context.getInput().holdKey(o -> o.keyShift);
			context.waitTicks(10);
			context.takeScreenshot("nametag-ping-sneaking");
			context.getInput().releaseKey(o -> o.keyShift);
			context.runOnClient(mc -> mc.player.setYRot(0));

			// no ping from the server (0): nothing
			check(context, true, 0, name);
			context.waitTicks(5);
			context.takeScreenshot("nametag-ping-none");
			// the setting off: nothing
			context.runOnClient(mc -> SlashHud.config.nametagPing = false);
			check(context, true, 80, name);

			context.runOnClient(mc -> {
				TestHooks.nametagExtras(false);
				TestHooks.nametagPing(false, 0);
				SlashHud.config.ownNametag = false;
				mc.options.setCameraType(CameraType.FIRST_PERSON);
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static void check(ClientGameTestContext context, boolean anyWorld, int ms, String expected) {
		String shown = context.computeOnClient(mc -> TestHooks.nametagPing(anyWorld, ms));
		if (!shown.equals(expected)) throw new AssertionError("Nametag ping for " + ms + " ms (server: " + anyWorld + "): \"" + shown + "\", expected \"" + expected + "\"");
	}
}
