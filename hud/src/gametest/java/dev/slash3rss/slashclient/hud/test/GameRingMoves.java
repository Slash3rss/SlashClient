package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Rings under the feet and movement effects on our own player: every ring from the front, one from
 * behind, crouching and in a jump; every movement effect set off as the player would (walking,
 * jumping, falling, sprinting, throwing a snowball, going into water), none when switched off; and both
 * tabs of the cosmetics menu, out of a world and in one, and the main menu's figure.
 */
public class GameRingMoves implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String known = context.computeOnClient(mc -> TestHooks.ringsAndMoves());
		if (!known.equals("ring_runes,ring_flame,ring_frost,ring_rainbow,ring_mushroom,ring_galaxy,ring_halo,ring_toxic,ring_sparks,ring_ocean,ring_leaves_gold,ring_leaves_autumn|move_steps,move_jump,move_landing,move_arrows,move_sprint,move_bubbles,move_petals"))
			throw new AssertionError("Not the rings and movement effects we made: " + known);
		// the menu out of a world: the figure with the ring, then the movement effect's show (the mouse off the tiles: nothing tried on)
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("ring"));
		context.waitTicks(10);
		context.takeScreenshot("ring-menu-noworld");
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("move"));
		// (a screen puts the mouse in the middle when it opens)
		context.getInput().setCursorPos(4, 4);
		context.waitTicks(37);
		context.takeScreenshot("move-menu-noworld-landing");
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("move", "move_steps"));
		context.waitTicks(30);
		context.takeScreenshot("move-menu-noworld-steps");
		context.setScreen(() -> null);
		context.getInput().setCursorPos(427, 240);
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> { TestHooks.ringMoveEffects(true, true, true); TestHooks.lookSouth(); TestHooks.cosmeticsSelf(null, true); });
			// every ring, from the front
			for (String ring : new String[] {"ring_runes", "ring_flame", "ring_frost", "ring_rainbow", "ring_mushroom", "ring_galaxy", "ring_halo", "ring_toxic", "ring_sparks", "ring_ocean", "ring_leaves_gold", "ring_leaves_autumn"}) {
				context.runOnClient(mc -> TestHooks.wear("ring", ring));
				context.waitTicks(4);
				context.takeScreenshot("ring-" + ring);
			}
			// from behind, crouching (dimmed) and in the air (on the ground below, fading)
			context.runOnClient(mc -> { TestHooks.wear("ring", "ring_galaxy"); TestHooks.cosmeticsSelf(null, false); });
			context.waitTicks(4);
			context.takeScreenshot("ring-back");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			context.runOnClient(mc -> TestHooks.sneak(true));
			context.waitTicks(8);
			context.takeScreenshot("ring-crouching");
			context.runOnClient(mc -> TestHooks.sneak(false));
			context.waitTicks(4);
			// from behind and above, so the ground under the jump is in view
			context.runOnClient(mc -> { TestHooks.cosmeticsSelf(null, false); mc.player.setXRot(40); TestHooks.jump(); });
			context.waitTicks(4);
			context.takeScreenshot("ring-jumping");
			context.waitTicks(20);
			context.runOnClient(mc -> { mc.player.setXRot(0); TestHooks.wear("ring", null); TestHooks.cosmeticsSelf(null, true); });

			// movement effects, each set off as the player would (walking ones seen from behind: what is left lies between us and the player)
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.runOnClient(mc -> mc.player.setXRot(35));
			check(context, "move_steps", () -> context.runOnClient(mc -> TestHooks.walk(true, false)), 40, "move-steps");
			check(context, "move_petals", () -> context.runOnClient(mc -> TestHooks.walk(true, false)), 40, "move-petals");
			check(context, "move_sprint", () -> context.runOnClient(mc -> TestHooks.walk(true, true)), 40, "move-sprint");
			context.runOnClient(mc -> { TestHooks.cosmeticsSelf(null, true); mc.player.setXRot(0); });
			check(context, "move_jump", () -> context.runOnClient(mc -> TestHooks.jump()), 20, "move-jump");
			check(context, "move_landing", () -> world.getServer().runCommand("execute as @a at @s run tp @s ~ ~2.8 ~"), 60, "move-landing");
			// a snowball thrown by us leaves a streak
			world.getServer().runCommand("item replace entity @a weapon.mainhand with snowball 16");
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			check(context, "move_arrows", () -> context.runOnClient(mc -> { mc.player.setXRot(-10); TestHooks.useItem(); }), 20, "move-arrows");
			world.getServer().runCommand("item replace entity @a weapon.mainhand with air");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			// into water: a burst of bubbles
			check(context, "move_bubbles", () -> world.getServer().runCommand("execute at @a run fill ~-1 ~ ~-1 ~1 ~1 ~1 water replace air"), 20, "move-bubbles");
			world.getServer().runCommand("execute at @a run fill ~-1 ~ ~-1 ~1 ~1 ~1 air replace water");
			context.waitTicks(10);
			// switched off: walking plays nothing
			context.runOnClient(mc -> { TestHooks.ringMoveEffects(true, false, true); TestHooks.wear("move", "move_steps"); TestHooks.moveEffectForget(); });
			context.runOnClient(mc -> TestHooks.walk(true, false));
			context.waitTicks(30);
			context.runOnClient(mc -> TestHooks.walk(false, false));
			String off = context.computeOnClient(mc -> TestHooks.moveEffectState());
			if (!off.startsWith("|")) throw new AssertionError("A movement effect played while switched off: " + off);
			context.runOnClient(mc -> { TestHooks.ringMoveEffects(true, true, true); TestHooks.wear("move", null); });

			// the menu in a world: both tabs, their icons and the figure
			context.runOnClient(mc -> TestHooks.audit(true));
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("ring"));
			context.waitTicks(5);
			context.takeScreenshot("ring-menu-world");
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("move"));
			context.waitTicks(37);
			context.takeScreenshot("move-menu-world");
			context.runOnClient(mc -> TestHooks.reportAudit());
			context.runOnClient(mc -> TestHooks.audit(false));
			context.setScreen(() -> null);
			// the main menu's figure wears the ring too
			context.runOnClient(mc -> TestHooks.wearOwn("ring", "ring_flame"));
			context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
			context.waitTicks(10);
			context.takeScreenshot("ring-menu-figure");
			context.runOnClient(mc -> TestHooks.wearOwn("ring", null));
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/** Wears `kind`, does `action` and waits until the effect plays (then a screenshot a moment later). */
	private static void check(ClientGameTestContext context, String kind, Runnable action, int ticks, String shot) {
		context.runOnClient(mc -> { TestHooks.wear("move", kind); TestHooks.moveEffectForget(); float pitch = mc.player.getXRot(); TestHooks.lookSouth(); mc.player.setXRot(pitch); });
		action.run();
		String state = "";
		for (int i = 0; i < ticks; i++) {
			context.waitTicks(1);
			state = context.computeOnClient(mc -> TestHooks.moveEffectState());
			if (state.startsWith(kind + ":")) break;
		}
		if (!state.startsWith(kind + ":")) throw new AssertionError(kind + " did not play: " + state);
		// the streak seen from the side: the camera turns away from where the snowball flies
		if (kind.equals("move_arrows")) context.runOnClient(mc -> TestHooks.turn(75));
		context.waitTicks(kind.equals("move_steps") || kind.equals("move_petals") || kind.equals("move_sprint") ? 12 : kind.equals("move_arrows") ? 5 : 3);
		context.takeScreenshot(shot);
		context.runOnClient(mc -> TestHooks.walk(false, false));
		context.waitTicks(25);
	}
}
