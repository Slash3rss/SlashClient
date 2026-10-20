package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CameraType;

/**
 * "● NA ŻYWO" above a live player's name (our own, shown in F5): Twitch's purple and Kick's green,
 * from the front, from the side, sneaking (the name and the line fade together), the tab list as
 * before (no line there), nothing in first person, nothing with the setting off or when not live.
 */
public class GameLiveNametag implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("scoreboard objectives add live dummy");
			world.getServer().runCommand("scoreboard objectives setdisplay list live");
			context.runOnClient(mc -> TestHooks.live("twitch"));
			if (context.computeOnClient(mc -> TestHooks.liveLabel()) == null) throw new AssertionError("No live line for a live player");

			// from the front: the name and "● NA ŻYWO" above it
			camera(context, CameraType.THIRD_PERSON_FRONT, 0);
			context.takeScreenshot("live-nametag-front");
			// from the side, on Kick
			context.runOnClient(mc -> TestHooks.live("kick"));
			camera(context, CameraType.THIRD_PERSON_FRONT, 60);
			context.takeScreenshot("live-nametag-side-kick");
			// sneaking: both lines discreet, like the name
			context.runOnClient(mc -> TestHooks.live("twitch"));
			camera(context, CameraType.THIRD_PERSON_FRONT, 0);
			context.getInput().holdKey(o -> o.keyShift);
			context.waitTicks(10);
			context.takeScreenshot("live-nametag-sneaking");
			context.getInput().releaseKey(o -> o.keyShift);
			// the tab list stays as it was
			camera(context, CameraType.THIRD_PERSON_BACK, 0);
			context.getInput().holdKey(o -> o.keyPlayerList);
			context.waitTicks(15);
			context.takeScreenshot("live-nametag-tablist");
			context.getInput().releaseKey(o -> o.keyPlayerList);

			// first person: no name, no line; the setting off or not live: no line
			camera(context, CameraType.FIRST_PERSON, 0);
			context.takeScreenshot("live-nametag-first-person");
			context.runOnClient(mc -> SlashHud.config.liveNametags = false);
			if (context.computeOnClient(mc -> TestHooks.liveLabel()) != null) throw new AssertionError("A live line with the setting off");
			context.runOnClient(mc -> SlashHud.config.liveNametags = true);
			context.runOnClient(mc -> TestHooks.live(null));
			if (context.computeOnClient(mc -> TestHooks.liveLabel()) != null) throw new AssertionError("A live line for a player not live");
			context.runOnClient(mc -> SlashHud.config.ownNametag = false);
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static void camera(ClientGameTestContext context, CameraType type, float yaw) {
		context.runOnClient(mc -> {
			mc.options.setCameraType(type);
			mc.player.setYRot(yaw);
			mc.player.setXRot(10);
		});
		context.waitTicks(10);
	}
}
