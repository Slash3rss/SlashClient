package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.PropTestHooks;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The wheelbarrows (the prop slot) on our own player: every one from the front, the side and the
 * back, walking (the wheel rolls between two shots, and stops when the player stops), crouching,
 * hidden with a sword in hand (shown again with empty hands), and in the cosmetics menu, from the
 * main menu and in a world.
 */
public class GameProps implements FabricClientGameTest {
	private static final String[] PROPS = {"wheelbarrow", "wheelbarrow_gold", "wheelbarrow_flowers"};

	@Override
	public void runTest(ClientGameTestContext context) {
		String known = context.computeOnClient(mc -> PropTestHooks.props());
		if (!known.equals(String.join(",", PROPS))) throw new AssertionError("Not the props we made: " + known);
		context.getInput().setCursorPos(10, 10);
		// the cosmetics menu from the main menu: the figure pushes the wheelbarrow, from the side
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(5);
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("prop"));
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("prop", "wheelbarrow"));
		context.waitTicks(20);
		context.takeScreenshot("props-menu");
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("prop", "wheelbarrow_flowers"));
		context.waitTicks(7);
		context.takeScreenshot("props-menu-flowers");
		// on another tab it is still worn, the figure standing (and turned to show that tab)
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("hat"));
		context.waitTicks(20);
		context.takeScreenshot("props-menu-hat-tab");
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.wear("prop", "wheelbarrow"));
			context.waitTicks(5);
			String shown = context.computeOnClient(mc -> PropTestHooks.shown());
			if (!shown.equals("wheelbarrow")) throw new AssertionError("The wheelbarrow does not show: '" + shown + "'");
			// every one, from the front-left, the side and the back
			for (String id : PROPS) {
				context.runOnClient(mc -> TestHooks.wear("prop", id));
				view(context, 35);
				context.waitTicks(3);
				context.takeScreenshot("props-" + id + "-front");
				view(context, 90);
				context.waitTicks(3);
				context.takeScreenshot("props-" + id + "-side");
				view(context, 160);
				context.waitTicks(3);
				context.takeScreenshot("props-" + id + "-back");
			}
			// the game's own third person views (F5): from behind and from the front
			context.runOnClient(mc -> TestHooks.wear("prop", "wheelbarrow"));
			view(context, Float.NaN);
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.waitTicks(3);
			context.takeScreenshot("props-f5-back");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			context.waitTicks(3);
			context.takeScreenshot("props-f5-front");
			// in first person nothing of it shows
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.waitTicks(3);
			context.takeScreenshot("props-first-person");

			// walking: the wheel rolls on (two shots apart), and stops when the player does
			context.runOnClient(mc -> PropTestHooks.walk(true));
			context.waitTicks(10);
			view(context, 90);
			float a = context.computeOnClient(mc -> PropTestHooks.walked());
			context.takeScreenshot("props-walk-1");
			context.waitTicks(1);
			view(context, 90);
			float b = context.computeOnClient(mc -> PropTestHooks.walked());
			context.takeScreenshot("props-walk-2");
			if (!(b > a + 0.3f)) throw new AssertionError("The wheel did not roll while walking: " + a + " -> " + b);
			context.runOnClient(mc -> PropTestHooks.walk(false));
			context.waitTicks(30);
			float c = context.computeOnClient(mc -> PropTestHooks.walked());
			context.waitTicks(10);
			float d = context.computeOnClient(mc -> PropTestHooks.walked());
			if (Math.abs(d - c) > 0.01f) throw new AssertionError("The wheel rolls while standing: " + c + " -> " + d);

			// crouching: lower, the arms reaching down
			context.runOnClient(mc -> TestHooks.sneak(true));
			context.waitTicks(10);
			view(context, 90);
			context.waitTicks(2);
			context.takeScreenshot("props-crouching");
			context.runOnClient(mc -> TestHooks.sneak(false));
			context.waitTicks(5);

			// a sword in hand: the wheelbarrow is put away and the arms are the game's; empty hands bring it back
			world.getServer().runCommand("item replace entity @a weapon.mainhand with iron_sword");
			context.waitTicks(5);
			shown = context.computeOnClient(mc -> PropTestHooks.shown());
			if (!shown.isEmpty()) throw new AssertionError("The wheelbarrow shows with a sword in hand");
			view(context, 35);
			context.waitTicks(2);
			context.takeScreenshot("props-sword");
			world.getServer().runCommand("item replace entity @a weapon.mainhand with air");
			context.waitTicks(5);
			shown = context.computeOnClient(mc -> PropTestHooks.shown());
			if (!shown.equals("wheelbarrow")) throw new AssertionError("The wheelbarrow did not come back with empty hands");
			view(context, Float.NaN);

			// the cosmetics menu in a world (the mouse away from the tiles: nothing tried on)
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("prop"));
			context.runOnClient(mc -> TestHooks.cosmeticsWorn("prop", "wheelbarrow_gold"));
			context.waitTicks(2);
			context.getInput().setCursorPos(10, 10);
			context.waitTicks(18);
			context.takeScreenshot("props-world-menu");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.wear("prop", null));
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/** The camera turned round the player with freelook to `angle` from their front (NaN: back to normal), and settled. */
	private static void view(ClientGameTestContext context, float angle) {
		for (int i = 0; i < 5 && !context.computeOnClient(mc -> PropTestHooks.viewFrom(angle)); i++) context.waitTick();
		context.waitTick();
		context.computeOnClient(mc -> PropTestHooks.viewFrom(angle));
	}
}
