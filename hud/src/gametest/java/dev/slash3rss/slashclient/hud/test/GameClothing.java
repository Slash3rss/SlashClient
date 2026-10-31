package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** SlashClient clothing on our own player: every hat and top, from the front, the back and the side, crouching, under armour, and in the menus. */
public class GameClothing implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String known = context.computeOnClient(mc -> TestHooks.clothing());
		if (!known.equals("tophat,crown,cap,headphones,beanie,wizard,halo|scarf,bowtie,tie,medal,jacket,autumnscarf")) throw new AssertionError("Not the clothing we made: " + known);
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			// every item, a hat and a top at a time, seen from the front
			String[][] outfits = {{"tophat", "bowtie"}, {"crown", "medal"}, {"cap", "jacket"}, {"headphones", "scarf"},
				{"beanie", "scarf"}, {"wizard", "tie"}, {"halo", "jacket"}, {"cap", "autumnscarf"}};
			for (String[] o : outfits) {
				context.runOnClient(mc -> { TestHooks.wear("hat", o[0]); TestHooks.wear("top", o[1]); });
				context.waitTicks(5);
				context.takeScreenshot("clothing-" + o[0] + "-" + o[1]);
			}
			// the autumn scarf alone: its knot and the two ends in front, and from the side
			context.runOnClient(mc -> { TestHooks.wear("hat", null); TestHooks.wear("top", "autumnscarf"); });
			context.waitTicks(5);
			context.takeScreenshot("clothing-autumnscarf-front");
			context.runOnClient(mc -> { TestHooks.cosmeticsSelf(null, false); TestHooks.cameraTurn(90); });
			context.waitTicks(5);
			context.takeScreenshot("clothing-autumnscarf-side");
			context.runOnClient(mc -> { TestHooks.cameraTurn(0); TestHooks.cosmeticsSelf(null, true); });
			// from behind and from the side, then crouching: it moves with the head, body and arms
			context.runOnClient(mc -> { TestHooks.wear("hat", "headphones"); TestHooks.wear("top", "jacket"); });
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.waitTicks(5);
			context.takeScreenshot("clothing-back");
			context.runOnClient(mc -> TestHooks.turn(90));
			context.waitTicks(5);
			context.takeScreenshot("clothing-side");
			context.runOnClient(mc -> TestHooks.sneak(true));
			context.waitTicks(10);
			context.takeScreenshot("clothing-side-crouching");
			context.runOnClient(mc -> TestHooks.sneak(false));
			context.runOnClient(mc -> TestHooks.turn(-90));
			// with a cape: the top stays under it
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", false));
			context.runOnClient(mc -> TestHooks.wear("top", "scarf"));
			context.waitTicks(5);
			context.takeScreenshot("clothing-with-cape");
			// real armour hides it: a helmet the hat, a chestplate the top
			context.runOnClient(mc -> { TestHooks.cosmeticsSelf(null, true); TestHooks.wear("hat", "tophat"); TestHooks.wear("top", "tie"); });
			world.getServer().runCommand("item replace entity @a armor.head with iron_helmet");
			world.getServer().runCommand("item replace entity @a armor.chest with iron_chestplate");
			context.waitTicks(10);
			context.takeScreenshot("clothing-under-armour");
			world.getServer().runCommand("item replace entity @a armor.head with air");
			world.getServer().runCommand("item replace entity @a armor.chest with air");
			// the menu's two new slots
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("hat"));
			context.waitTicks(5);
			context.takeScreenshot("clothing-menu-hats");
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("top"));
			context.waitTicks(5);
			context.takeScreenshot("clothing-menu-tops");
			context.setScreen(() -> null);
			context.runOnClient(mc -> { TestHooks.wear("hat", null); TestHooks.wear("top", null); });
			// the main menu's figure wears them too
			context.runOnClient(mc -> { TestHooks.wearOwn("hat", "crown"); TestHooks.wearOwn("top", "jacket"); });
			context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
			context.waitTicks(10);
			context.takeScreenshot("clothing-menu-figure");
			context.runOnClient(mc -> { TestHooks.wearOwn("hat", "headphones"); TestHooks.wearOwn("top", "scarf"); });
			context.waitTicks(5);
			context.takeScreenshot("clothing-menu-figure-2");
			context.runOnClient(mc -> { TestHooks.wearOwn("hat", null); TestHooks.wearOwn("top", null); });
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.firstPerson());
			// leaving the world goes back to the game's own title screen, as the test framework expects
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}
}
