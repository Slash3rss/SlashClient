package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * SlashClient suits on our own player: every suit from the front, the back and the side, on wide
 * and slim arms, crouching and running, over a hat and a top (which it hides), under each piece of
 * armour (which hides its part), with a cape (which takes its back); and in the menus: the suit tab
 * from the main menu and in a world, and the main menu's figure.
 */
public class GameSuits implements FabricClientGameTest {
	private static final String[] SUITS = {"astronaut", "samurai", "pandasuit", "dinosuit", "knight", "ghostsheet", "mech", "pirate"};

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String known = context.computeOnClient(mc -> TestHooks.suits());
		if (!known.equals(String.join(",", SUITS))) throw new AssertionError("Not the suits we made: " + known);
		context.getInput().setCursorPos(10, 10);
		// the suit tab from the main menu: the figure turns round by itself
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(5);
		context.runOnClient(mc -> TestHooks.defaultSkin(false));
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("suit"));
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("suit", "astronaut"));
		context.waitTicks(10);
		context.takeScreenshot("suit-menu-astronaut");
		context.waitTicks(60);
		context.takeScreenshot("suit-menu-astronaut-turned");
		for (String s : new String[] {"knight", "pirate", "dinosuit"}) {
			context.runOnClient(mc -> TestHooks.cosmeticsWorn("suit", s));
			context.waitTicks(25);
			context.takeScreenshot("suit-menu-" + s);
		}
		context.runOnClient(mc -> TestHooks.defaultSkin(true));
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("suit", "mech"));
		context.waitTicks(25);
		context.takeScreenshot("suit-menu-mech-slim");
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("suit", null));
		context.setScreen(() -> null);
		// the main menu's figure wears it (and not the hat and top under it)
		context.runOnClient(mc -> { TestHooks.wearOwn("hat", "tophat"); TestHooks.wearOwn("top", "scarf"); TestHooks.wearOwn("suit", "samurai"); });
		context.runOnClient(mc -> TestHooks.defaultSkin(false));
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(10);
		context.takeScreenshot("suit-title-figure");
		context.runOnClient(mc -> { TestHooks.wearOwn("hat", null); TestHooks.wearOwn("top", null); TestHooks.wearOwn("suit", null); });
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.defaultSkin(false));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			// every suit from the front, the back and the side
			for (String s : SUITS) {
				context.runOnClient(mc -> TestHooks.wear("suit", s));
				context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
				context.waitTicks(5);
				context.takeScreenshot("suit-" + s + "-front");
				context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
				context.waitTicks(5);
				context.takeScreenshot("suit-" + s + "-back");
				side(context, "suit-" + s + "-side");
			}
			// slim arms: the sleeves a pixel narrower, painted to fit
			context.runOnClient(mc -> TestHooks.defaultSkin(true));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			for (String s : new String[] {"knight", "mech", "pirate", "samurai"}) {
				context.runOnClient(mc -> TestHooks.wear("suit", s));
				context.waitTicks(5);
				context.takeScreenshot("suit-" + s + "-slim-front");
			}
			side(context, "suit-samurai-slim-side");
			context.runOnClient(mc -> TestHooks.defaultSkin(false));
			// crouching: it moves with the body and legs
			context.runOnClient(mc -> TestHooks.wear("suit", "dinosuit"));
			context.runOnClient(mc -> TestHooks.sneak(true));
			side(context, "suit-dinosuit-crouching");
			context.runOnClient(mc -> TestHooks.sneak(false));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			// a hat and a top under it: hidden
			context.runOnClient(mc -> { TestHooks.wear("hat", "tophat"); TestHooks.wear("top", "jacket"); TestHooks.wear("suit", "knight"); });
			context.waitTicks(5);
			context.takeScreenshot("suit-over-clothing");
			context.runOnClient(mc -> { TestHooks.wear("hat", null); TestHooks.wear("top", null); });
			// a cape takes the back: the astronaut's pack gives way
			context.runOnClient(mc -> TestHooks.wear("suit", "astronaut"));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", false));
			context.waitTicks(5);
			context.takeScreenshot("suit-astronaut-with-cape");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			// real armour hides the part it covers: the helmet the head, the chestplate the body and arms, leggings and boots the legs
			world.getServer().runCommand("item replace entity @a armor.head with iron_helmet");
			context.waitTicks(10);
			context.takeScreenshot("suit-armour-helmet");
			world.getServer().runCommand("item replace entity @a armor.head with air");
			world.getServer().runCommand("item replace entity @a armor.chest with diamond_chestplate");
			context.waitTicks(10);
			context.takeScreenshot("suit-armour-chestplate");
			world.getServer().runCommand("item replace entity @a armor.chest with air");
			world.getServer().runCommand("item replace entity @a armor.legs with golden_leggings");
			world.getServer().runCommand("item replace entity @a armor.feet with iron_boots");
			context.waitTicks(10);
			context.takeScreenshot("suit-armour-legs-feet");
			world.getServer().runCommand("item replace entity @a armor.legs with air");
			world.getServer().runCommand("item replace entity @a armor.feet with air");
			// the suit tab in a world (the mouse off the tiles, or the figure tries on the one under it)
			context.getInput().setCursorPos(5, 470);
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("suit"));
			context.runOnClient(mc -> TestHooks.cosmeticsWorn("suit", "pandasuit"));
			context.waitTicks(10);
			context.takeScreenshot("suit-menu-world");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.wear("suit", null));
			context.runOnClient(mc -> TestHooks.noTestSkin());
			context.runOnClient(mc -> TestHooks.firstPerson());
			// leaving the world goes back to the game's own title screen, as the test framework expects
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/** The player seen from its side: the camera turned a quarter round it with freelook (the camera follows the player when it turns itself). */
	private static void side(ClientGameTestContext context, String name) {
		context.runOnClient(mc -> TestHooks.freelookHeld(true));
		context.waitTicks(2);
		context.runOnClient(mc -> TestHooks.freelookTurn());
		context.waitTicks(5);
		context.takeScreenshot(name);
		context.runOnClient(mc -> TestHooks.freelookHeld(false));
		context.waitTicks(2);
	}
}
