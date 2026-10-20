package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Sprays: the menu's tab from the main menu and in a world (the picture on a wall, the key hint);
 * in a world a spray on the wall in front of us with the key, every spray on a wall (from the front
 * and from the side) and on the floor, ours seen from behind and the front, at most three of ours,
 * the wait between sprays, fading and going after a minute, going with a broken block, and sprays
 * from elsewhere (our own echo, a player not in this game) not shown.
 */
public class GameSprays implements FabricClientGameTest {
	private static final String[] IDS = {"spray_logo", "spray_gg", "spray_heart", "spray_skull", "spray_lol", "spray_crown", "spray_emblem", "spray_pumpkin"};

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.getInput().setCursorPos(10, 10);
		// the menu's tab without a world: the picture worn on a wall, then the one under the mouse
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("spray"));
		context.waitTicks(5);
		context.getInput().setCursorPos(20, 460);
		context.waitTicks(3);
		context.takeScreenshot("spray-menu");
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("spray", "spray_logo"));
		context.waitTicks(3);
		context.takeScreenshot("spray-menu-logo");
		context.setScreen(() -> null);

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			// a wall of stone bricks 3 blocks south of us, and a floor in front of it
			world.getServer().runCommand("execute at @a run fill ~-5 ~ ~3 ~5 ~4 ~3 minecraft:stone_bricks");
			world.getServer().runCommand("execute at @a run fill ~-5 ~-1 ~-1 ~5 ~-1 ~2 minecraft:smooth_stone");
			world.getServer().runCommand("execute at @a run fill ~-5 ~ ~-1 ~5 ~3 ~2 minecraft:air");
			context.waitTicks(10);
			context.runOnClient(mc -> { TestHooks.firstPerson(); TestHooks.spraysClear(); TestHooks.look(0, 0); });

			// nothing worn: nothing sprays
			context.runOnClient(mc -> TestHooks.wear("spray", null));
			if (!context.computeOnClient(mc -> TestHooks.spray(false)).isEmpty()) throw new AssertionError("Sprayed without a spray");
			// the key: the heart on the wall block in front of the eyes, on its north face
			context.runOnClient(mc -> TestHooks.wear("spray", "spray_heart"));
			String one = context.computeOnClient(mc -> TestHooks.spray(false));
			if (!one.matches("spray_heart@-?\\d+,-?\\d+,-?\\d+/north")) throw new AssertionError("Not sprayed on the wall: " + one);
			context.waitTicks(3);
			context.takeScreenshot("spray-wall");
			// right away again: it has to wait, and the bar under the crosshair says how long
			String again = context.computeOnClient(mc -> { TestHooks.look(20, 0); return TestHooks.spray(true); });
			if (!again.equals(one)) throw new AssertionError("Sprayed again without waiting: " + again);
			context.waitTicks(2);
			context.takeScreenshot("spray-cooldown");

			// at most three of ours: the fourth takes the first one's place
			for (float yaw : new float[] {-20, 20, 35}) {
				String s = context.computeOnClient(mc -> { TestHooks.look(yaw, 0); return TestHooks.spray(false); });
				if (s.isEmpty()) throw new AssertionError("Nothing sprayed at yaw " + yaw);
			}
			String three = context.computeOnClient(mc -> TestHooks.sprays());
			if (three.split(";").length != 3 || three.startsWith(one)) throw new AssertionError("Not the newest three: " + three);

			// every spray (from other players) on the wall, from the front and from the side
			context.runOnClient(mc -> {
				TestHooks.spraysClear();
				for (int i = 0; i < IDS.length; i++) TestHooks.sprayAt(i + 1, IDS[i], -3 + (i % 4) * 2, 1 + (1 - i / 4) * 2 - 1, 3, "north", 0, 0);
				TestHooks.look(0, -8);
			});
			context.waitTicks(3);
			if (context.computeOnClient(mc -> TestHooks.sprays()).split(";").length != IDS.length) throw new AssertionError("Not every spray is there");
			context.takeScreenshot("spray-all-front");
			context.runOnClient(mc -> TestHooks.look(-50, -5));
			context.waitTicks(3);
			context.takeScreenshot("spray-all-side");

			// on the floor, upright for the sprayer looking south (and on the wall's top-side lights)
			context.runOnClient(mc -> {
				TestHooks.spraysClear();
				TestHooks.sprayAt(1, "spray_crown", -1, -1, 1, "up", 2, 0);
				TestHooks.sprayAt(2, "spray_skull", 1, -1, 1, "up", 2, 0);
				TestHooks.sprayAt(3, "spray_logo", 0, -1, 2, "up", 2, 0);
				TestHooks.look(0, 60);
			});
			context.waitTicks(3);
			context.takeScreenshot("spray-floor");
			// sprayed with the key looking down: the same way round
			context.runOnClient(mc -> { TestHooks.wear("spray", "spray_gg"); TestHooks.look(0, 80); });
			String floor = context.computeOnClient(mc -> TestHooks.spray(false));
			if (!floor.endsWith("/up")) throw new AssertionError("Not sprayed on the floor: " + floor);
			context.waitTicks(3);
			context.takeScreenshot("spray-floor-key");

			// ours on the wall seen in third person, behind us and from the front
			context.runOnClient(mc -> { TestHooks.spraysClear(); TestHooks.wear("spray", "spray_lol"); TestHooks.look(0, 0); });
			context.computeOnClient(mc -> TestHooks.spray(false));
			context.runOnClient(mc -> TestHooks.sprayAt(5, "spray_pumpkin", 1, 1, 3, "north", 0, 0));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.waitTicks(5);
			context.takeScreenshot("spray-third-person");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			context.waitTicks(5);
			context.takeScreenshot("spray-front-view");
			context.runOnClient(mc -> TestHooks.firstPerson());

			// after most of a minute it fades, after a minute it is gone
			context.runOnClient(mc -> {
				TestHooks.spraysClear();
				TestHooks.sprayAt(1, "spray_emblem", -1, 1, 3, "north", 0, 0);
				TestHooks.sprayAt(2, "spray_emblem", 1, 1, 3, "north", 0, 57_500);
				TestHooks.sprayAt(3, "spray_emblem", 0, 2, 3, "north", 0, 61_000);
				TestHooks.look(0, -8);
			});
			context.waitTicks(3);
			context.takeScreenshot("spray-fading");
			if (context.computeOnClient(mc -> TestHooks.sprays()).split(";").length != 2) throw new AssertionError("An old spray stayed: " + context.computeOnClient(mc -> TestHooks.sprays()));

			// a broken block takes its spray with it
			context.runOnClient(mc -> { TestHooks.spraysClear(); TestHooks.sprayAt(1, "spray_gg", 0, 1, 3, "north", 0, 0); });
			world.getServer().runCommand("execute at @a run setblock ~ ~1 ~3 minecraft:air");
			context.waitTicks(5);
			String broken = context.computeOnClient(mc -> TestHooks.sprays());
			if (!broken.isEmpty()) throw new AssertionError("The spray stayed on a broken block: " + broken);
			world.getServer().runCommand("execute at @a run setblock ~ ~1 ~3 minecraft:stone_bricks");

			// from the server: our own spray coming back, and one from a player not in this game, are not shown
			context.runOnClient(mc -> { TestHooks.sprayReceived(true, 3); TestHooks.sprayReceived(false, 3); });
			context.waitTicks(3);
			if (!context.computeOnClient(mc -> TestHooks.sprays()).isEmpty()) throw new AssertionError("A spray from elsewhere is shown");

			// the menu's tab in the world
			context.runOnClient(mc -> TestHooks.audit(true));
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("spray"));
			context.waitTicks(5);
			context.takeScreenshot("spray-menu-world");
			context.runOnClient(mc -> TestHooks.reportAudit());
			context.runOnClient(mc -> TestHooks.audit(false));
			context.setScreen(() -> null);
			context.runOnClient(mc -> { TestHooks.spraysClear(); TestHooks.wear("spray", null); TestHooks.firstPerson(); });
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
