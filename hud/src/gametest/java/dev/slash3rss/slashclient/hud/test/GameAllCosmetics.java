package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Everything at once: one item of every slot on our own player, without a suit and then under
 * suits (which hide the clothing, the face's and ears' things, the shoes and the hands; give their
 * back to a back item and their own tail to a worn tail), from the front, the back and the side,
 * with a shield and a sword in the hands (the prop gives way); the same in the cosmetics menu's
 * figure; and the menu's slot tabs, which scroll when they do not all fit, at several window sizes.
 */
public class GameAllCosmetics implements FabricClientGameTest {
	/** One item of every slot that is drawn on the player (the cape is set apart: cosmeticsSelf). */
	private static final String[][] OUTFIT = {
		{"hat", "tophat"}, {"top", "scarf"}, {"face", "sunglasses"}, {"ears", "catears"}, {"shoes", "rocketboots"}, {"hands", "boxinggloves"},
		{"back", "backpack"}, {"tail", "foxtail"}, {"ring", "ring_runes"}, {"move", "move_steps"}, {"prop", "wheelbarrow"},
		{"shield", "shield_dragon"}, {"weapon", "sword_katana"}, {"wings", "angel"}, {"pet", "allay"}, {"aura", "enchant"}, {"trail", "hearts"},
		{"kill", "firework"}, {"spray", "spray_heart"},
	};
	/** Window width, height and GUI scale. */
	private static final int[][] SIZES = {{854, 480, 2}, {1920, 1080, 3}, {1920, 1080, 4}};

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.getInput().setCursorPos(5, 470);
		// the menu from the main menu: the slot tabs, the first and the last, at several sizes
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(5);
		context.runOnClient(mc -> TestHooks.defaultSkin(false));
		for (int[] s : SIZES) {
			context.getInput().resizeWindow(s[0], s[1]);
			context.runOnClient(mc -> TestHooks.guiScale(s[2]));
			// the mouse over the figure's side (no tile under it: no tooltip over the tabs)
			context.getInput().setCursorPos(2, 2);
			String size = s[0] + "x" + s[1] + "-" + s[2];
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("cape"));
			context.waitTicks(2);
			context.getInput().setCursorPos(3, 3);
			context.waitTicks(10);
			context.takeScreenshot("all-tabs-" + size + "-cape");
			context.runOnClient(mc -> TestHooks.cosmeticsSlot("prop"));
			context.waitTicks(10);
			context.takeScreenshot("all-tabs-" + size + "-prop");
			context.runOnClient(mc -> TestHooks.cosmeticsSlot("face"));
			context.waitTicks(10);
			context.takeScreenshot("all-tabs-" + size + "-face");
		}
		context.getInput().resizeWindow(854, 480);
		context.runOnClient(mc -> TestHooks.guiScale(2));
		context.getInput().setCursorPos(2, 2);
		// the menu's figure in all of it, then under suits
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("hat"));
		for (String[] o : OUTFIT) context.runOnClient(mc -> TestHooks.cosmeticsWorn(o[0], o[1]));
		context.waitTicks(10);
		context.takeScreenshot("all-menu-figure");
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("tail"));
		context.waitTicks(15);
		context.takeScreenshot("all-menu-figure-tail");
		for (String suit : new String[] {"dinosuit", "astronaut"}) {
			context.runOnClient(mc -> TestHooks.cosmeticsWorn("suit", suit));
			context.runOnClient(mc -> TestHooks.cosmeticsSlot("hat"));
			context.waitTicks(10);
			context.takeScreenshot("all-menu-figure-" + suit);
			context.runOnClient(mc -> TestHooks.cosmeticsSlot("tail"));
			context.waitTicks(15);
			context.takeScreenshot("all-menu-figure-" + suit + "-tail");
		}
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.defaultSkin(false));
			for (String[] o : OUTFIT) context.runOnClient(mc -> TestHooks.wear(o[0], o[1]));
			views(context, "all-nosuit", world);
			// a suit over it: it hides the clothing, the face's and ears' things, the shoes and the hands
			for (String suit : new String[] {"dinosuit", "astronaut", "pandasuit"}) {
				context.runOnClient(mc -> TestHooks.wear("suit", suit));
				views(context, "all-" + suit, world);
			}
			// without a back item and a tail the suit's own back shows again
			context.runOnClient(mc -> { TestHooks.wear("back", null); TestHooks.wear("tail", null); TestHooks.wear("wings", null); });
			context.runOnClient(mc -> TestHooks.wear("suit", "dinosuit"));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.waitTicks(5);
			context.takeScreenshot("all-dinosuit-own-back");
			// a tail alone: the suit's own tail gives way, its spikes stay
			context.runOnClient(mc -> TestHooks.wear("tail", "dragontail"));
			context.waitTicks(5);
			context.takeScreenshot("all-dinosuit-dragontail");
			context.runOnClient(mc -> { for (String[] o : OUTFIT) TestHooks.wear(o[0], null); TestHooks.wear("suit", null); });
			context.runOnClient(mc -> TestHooks.noTestSkin());
			context.runOnClient(mc -> TestHooks.firstPerson());
			// leaving the world goes back to the game's own title screen, as the test framework expects
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/** The player from the front, the back and the side with empty hands (the prop shows), then holding a shield and a sword (it gives way). */
	private static void views(ClientGameTestContext context, String name, TestSingleplayerContext world) {
		world.getServer().runCommand("item replace entity @a weapon.mainhand with air");
		world.getServer().runCommand("item replace entity @a weapon.offhand with air");
		context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", true));
		context.waitTicks(10);
		context.takeScreenshot(name + "-front");
		context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", false));
		context.waitTicks(5);
		context.takeScreenshot(name + "-back");
		context.runOnClient(mc -> TestHooks.freelookHeld(true));
		context.waitTicks(2);
		context.runOnClient(mc -> TestHooks.freelookTurn());
		context.waitTicks(5);
		context.takeScreenshot(name + "-side");
		context.runOnClient(mc -> TestHooks.freelookHeld(false));
		context.waitTicks(2);
		world.getServer().runCommand("item replace entity @a weapon.mainhand with diamond_sword");
		world.getServer().runCommand("item replace entity @a weapon.offhand with shield");
		context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", true));
		context.waitTicks(10);
		context.takeScreenshot(name + "-holding");
		world.getServer().runCommand("item replace entity @a weapon.mainhand with air");
		world.getServer().runCommand("item replace entity @a weapon.offhand with air");
	}
}
