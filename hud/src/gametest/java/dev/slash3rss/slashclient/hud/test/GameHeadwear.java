package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The face and ears slots on our own player: every item from the front, the back and the side,
 * with hats (what a hat would go through hides), under a helmet (glasses stay, masks and ears
 * hide), on a skin with a big outer head layer, ears twitching, and in the menus.
 */
public class GameHeadwear implements FabricClientGameTest {
	private static final String[] FACE = {"sunglasses", "aviators", "glasses3d", "monocle", "mustache", "gasmask", "kitsune", "oni", "skigoggles"};
	private static final String[] EARS = {"catears", "foxears", "bunnyears", "elfears", "devilhorns", "ramhorns", "antlers", "unicorn"};

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String known = context.computeOnClient(mc -> TestHooks.headwear());
		if (!known.equals(String.join(",", FACE) + "|" + String.join(",", EARS))) throw new AssertionError("Not the face and ears things we made: " + known);
		// a cat's ear: still most of the time, wiggling for a moment every few seconds; gone under a top hat, on with a cap
		String still = context.computeOnClient(mc -> TestHooks.headwearPose("catears", null, 2f));
		String wiggle = context.computeOnClient(mc -> TestHooks.headwearPose("catears", null, 0.06f));
		if (!still.equals("0.0|true") || wiggle.startsWith("0.0|")) throw new AssertionError("The ear does not twitch: " + still + " / " + wiggle);
		if (!context.computeOnClient(mc -> TestHooks.headwearPose("catears", "tophat", 2f)).endsWith("|false")) throw new AssertionError("The ear goes through the top hat");
		if (!context.computeOnClient(mc -> TestHooks.headwearPose("catears", "cap", 2f)).endsWith("|true")) throw new AssertionError("The ear hides under a cap");
		if (!context.computeOnClient(mc -> TestHooks.headwearPose("sunglasses", "tophat", 2f)).endsWith("|true")) throw new AssertionError("The glasses hide with a top hat");
		// from the main menu, no world: the cosmetics menu, and the main menu's figure
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(5);
		menu(context, "title");
		context.setScreen(() -> null);
		context.runOnClient(mc -> { TestHooks.wearOwn("face", "aviators"); TestHooks.wearOwn("ears", "foxears"); });
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(10);
		context.takeScreenshot("headwear-title-figure");
		context.runOnClient(mc -> { TestHooks.wearOwn("face", null); TestHooks.wearOwn("ears", null); });
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			// every item, a face thing and ears at a time, from the front
			for (int i = 0; i < FACE.length; i++) {
				String face = FACE[i], ears = i < EARS.length ? EARS[i] : null;
				context.runOnClient(mc -> { TestHooks.wear("face", face); TestHooks.wear("ears", ears); });
				context.waitTicks(5);
				context.takeScreenshot("headwear-" + face + (ears != null ? "-" + ears : ""));
			}
			// from behind: masks' straps, horns and ears round the head (the sides: the menu's figure, below)
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			for (String[] o : new String[][] {{"gasmask", "ramhorns"}, {"skigoggles", "elfears"}, {"kitsune", "antlers"}, {"sunglasses", "unicorn"}}) {
				context.runOnClient(mc -> { TestHooks.wear("face", o[0]); TestHooks.wear("ears", o[1]); });
				context.waitTicks(5);
				context.takeScreenshot("headwear-back-" + o[0] + "-" + o[1]);
			}
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			// with hats: ears poke out of a cap and a beanie, hide under a top hat; a mask's horns hide under a wizard's hat
			for (String[] o : new String[][] {{"cap", "catears", "sunglasses"}, {"beanie", "foxears", "skigoggles"}, {"tophat", "bunnyears", "monocle"},
					{"crown", "unicorn", "kitsune"}, {"wizard", "elfears", "oni"}, {"headphones", "antlers", "gasmask"}, {"halo", "devilhorns", "mustache"}}) {
				context.runOnClient(mc -> { TestHooks.wear("hat", o[0]); TestHooks.wear("ears", o[1]); TestHooks.wear("face", o[2]); });
				context.waitTicks(5);
				context.takeScreenshot("headwear-hat-" + o[0] + "-" + o[1] + "-" + o[2]);
			}
			// a helmet: glasses stay on, masks and ears hide
			context.runOnClient(mc -> { TestHooks.wear("hat", null); TestHooks.wear("face", "sunglasses"); TestHooks.wear("ears", "catears"); });
			world.getServer().runCommand("item replace entity @a armor.head with iron_helmet");
			context.waitTicks(10);
			context.takeScreenshot("headwear-helmet-sunglasses");
			context.runOnClient(mc -> TestHooks.wear("face", "gasmask"));
			context.waitTicks(5);
			context.takeScreenshot("headwear-helmet-gasmask");
			world.getServer().runCommand("item replace entity @a armor.head with air");
			// a skin whose outer head layer is a big box all round: everything stands outside it
			context.runOnClient(mc -> TestHooks.testSkin("figure/tvhead"));
			for (String[] o : new String[][] {{"sunglasses", "catears"}, {"kitsune", "elfears"}, {"skigoggles", "ramhorns"}}) {
				context.runOnClient(mc -> { TestHooks.wear("face", o[0]); TestHooks.wear("ears", o[1]); });
				context.waitTicks(5);
				context.takeScreenshot("headwear-tvhead-" + o[0] + "-" + o[1]);
			}
			context.runOnClient(mc -> TestHooks.noTestSkin());
			// the cosmetics menu's two new tabs, in a world
			context.runOnClient(mc -> { TestHooks.wear("face", null); TestHooks.wear("ears", null); });
			menu(context, "world");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/** The face and ears tabs, and the figure wearing a few of them turned round (also on the TV-head skin). */
	private static void menu(ClientGameTestContext context, String where) {
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("face"));
		context.waitTick();
		// the mouse off the tiles: the figure shows what is worn
		context.getInput().setCursorPos(10, 10);
		context.runOnClient(mc -> TestHooks.cleanScreen());
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("hat", null); TestHooks.cosmeticsWorn("top", null); TestHooks.cosmeticsWorn("pet", null);
			TestHooks.cosmeticsWorn("face", "sunglasses"); TestHooks.cosmeticsWorn("ears", "catears"); });
		context.waitTicks(15);
		context.takeScreenshot("headwear-menu-" + where + "-face");
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("ears"));
		context.waitTicks(15);
		context.takeScreenshot("headwear-menu-" + where + "-ears");
		if (!where.equals("world")) return;
		context.runOnClient(mc -> TestHooks.testSkin("figure/tvhead"));
		for (String[] o : new String[][] {{"oni", "devilhorns"}, {"gasmask", "bunnyears"}, {"glasses3d", "unicorn"}, {"aviators", "ramhorns"}}) {
			context.runOnClient(mc -> { TestHooks.cosmeticsWorn("face", o[0]); TestHooks.cosmeticsWorn("ears", o[1]); });
			for (int a : new int[] {0, 45, 90, 180}) {
				context.runOnClient(mc -> TestHooks.cosmeticsDrag(a));
				context.waitTicks(15);
				context.takeScreenshot("headwear-menu-" + o[0] + "-" + o[1] + "-" + a);
			}
		}
		context.runOnClient(mc -> TestHooks.noTestSkin());
	}
}
