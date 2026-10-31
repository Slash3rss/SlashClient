package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Shoes and things on the hands on our own player: every item from the front, the back and the
 * side, crouching, on slim (Alex) and wide arms, the shoes under real boots, the rocket boots'
 * flames, the hands' items in first person (empty hand, a held sword, a map in both hands), and
 * both slots in the cosmetics menu, in a world and from the main menu.
 */
public class GameLimbWear implements FabricClientGameTest {
	private static final String[] SHOES = {"sneakers_red", "sneakers_blue", "hikingboots", "slippers", "bunnyslippers", "rocketboots", "rollerskates", "flippers"};
	private static final String[] HANDS = {"boxinggloves", "wristwatch", "bracelet", "spikedgauntlets", "mittens", "goldring", "smartband"};

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String known = context.computeOnClient(mc -> TestHooks.limbWear());
		if (!known.equals(String.join(",", SHOES) + "|" + String.join(",", HANDS))) throw new AssertionError("Not the shoes and hand items we made: " + known);
		mainMenu(context);
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			// every item, a pair of shoes and a hand item at a time, from the front, the back and the side
			for (int i = 0; i < SHOES.length; i++) {
				String shoes = SHOES[i], hands = HANDS[i % HANDS.length];
				context.runOnClient(mc -> { TestHooks.wear("shoes", shoes); TestHooks.wear("hands", hands); });
				context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
				context.waitTicks(5);
				context.takeScreenshot("limbs-" + shoes + "-" + hands + "-front");
				context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
				context.waitTicks(5);
				context.takeScreenshot("limbs-" + shoes + "-" + hands + "-back");
				side(context, "limbs-" + shoes + "-" + hands + "-side", 90);
			}
			// crouching, from the side
			context.runOnClient(mc -> { TestHooks.wear("shoes", "rollerskates"); TestHooks.wear("hands", "spikedgauntlets"); TestHooks.sneak(true); });
			context.waitTicks(10);
			side(context, "limbs-side-crouching", 90);
			context.runOnClient(mc -> TestHooks.sneak(false));
			// slim and wide arms in the same skin: the gloves and the watch fit both
			for (boolean slim : new boolean[] {true, false}) {
				context.runOnClient(mc -> { TestHooks.alexSkin(slim); TestHooks.wear("hands", "boxinggloves"); TestHooks.cosmeticsSelf(null, true); });
				context.waitTicks(10);
				context.takeScreenshot("limbs-" + (slim ? "slim" : "wide") + "-boxinggloves");
				context.runOnClient(mc -> TestHooks.wear("hands", "wristwatch"));
				side(context, "limbs-" + (slim ? "slim" : "wide") + "-wristwatch-side", 90);
				context.runOnClient(mc -> { TestHooks.wear("hands", "spikedgauntlets"); TestHooks.cosmeticsSelf(null, true); });
				context.waitTicks(5);
				context.takeScreenshot("limbs-" + (slim ? "slim" : "wide") + "-spikedgauntlets");
			}
			context.runOnClient(mc -> TestHooks.noTestSkin());
			// the rocket boots fire little flames under the heels
			context.runOnClient(mc -> { TestHooks.wear("shoes", "rocketboots"); TestHooks.wear("hands", null); TestHooks.cosmeticsSelf(null, true); });
			context.waitTicks(20);
			side(context, "limbs-rocketboots-flames", 120);
			// real boots hide the shoes; the hands' items stay
			context.runOnClient(mc -> { TestHooks.wear("shoes", "sneakers_red"); TestHooks.wear("hands", "mittens"); });
			world.getServer().runCommand("item replace entity @a armor.feet with iron_boots");
			context.waitTicks(10);
			context.takeScreenshot("limbs-under-boots");
			world.getServer().runCommand("item replace entity @a armor.feet with air");
			// first person: the empty main hand shows the glove, a held sword hides the arm (and the glove with it)
			context.runOnClient(mc -> { TestHooks.lookSouth(); TestHooks.firstPerson(); TestHooks.wear("hands", "boxinggloves"); });
			context.waitTicks(10);
			context.takeScreenshot("limbs-firstperson-boxinggloves");
			for (String hands : new String[] {"goldring", "spikedgauntlets", "mittens"}) {
				context.runOnClient(mc -> TestHooks.wear("hands", hands));
				context.waitTicks(5);
				context.takeScreenshot("limbs-firstperson-" + hands);
			}
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:diamond_sword");
			context.waitTicks(10);
			context.takeScreenshot("limbs-firstperson-sword");
			// a map is held in both hands: both arms show, the watch on the left wrist
			// (an empty map used: a real one, drawn in both hands)
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:map");
			context.waitTicks(5);
			context.getInput().pressMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_RIGHT);
			// looking down lifts the map, and the hands holding it, into view
			context.runOnClient(mc -> { TestHooks.wear("hands", "wristwatch"); TestHooks.pitch(60); });
			context.waitTicks(30);
			context.takeScreenshot("limbs-firstperson-map-wristwatch");
			context.runOnClient(mc -> TestHooks.wear("hands", "boxinggloves"));
			context.waitTicks(5);
			context.takeScreenshot("limbs-firstperson-map-boxinggloves");
			world.getServer().runCommand("item replace entity @p weapon.mainhand with air");
			// looking down at our own feet
			context.runOnClient(mc -> { TestHooks.wear("shoes", "bunnyslippers"); TestHooks.pitch(80); });
			context.waitTicks(5);
			context.takeScreenshot("limbs-firstperson-feet");
			context.runOnClient(mc -> TestHooks.pitch(0));
			// the menu's two new slots, in a world
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("shoes"));
			context.waitTicks(10);
			context.takeScreenshot("limbs-menu-shoes");
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("hands"));
			context.waitTicks(10);
			context.takeScreenshot("limbs-menu-hands");
			context.setScreen(() -> null);
			context.runOnClient(mc -> { TestHooks.wear("shoes", null); TestHooks.wear("hands", null); });
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/** A view from the side: freelook held, the camera turned round the player by `degrees` (the player stays as it was). */
	private static void side(ClientGameTestContext context, String name, float degrees) {
		context.runOnClient(mc -> TestHooks.freelookAllowed(true));
		context.getInput().holdKey(o -> dev.slash3rss.slashclient.hud.camera.Freelook.key);
		context.waitTicks(3);
		context.runOnClient(mc -> TestHooks.freelookYaw(degrees));
		context.waitTicks(5);
		context.takeScreenshot(name);
		context.getInput().releaseKey(o -> dev.slash3rss.slashclient.hud.camera.Freelook.key);
		context.waitTicks(3);
		context.runOnClient(mc -> TestHooks.freelookAllowed(false));
	}

	/** From the main menu, without a world: the figure wears them (the rocket boots' flames too), and the menu's two slots. */
	private static void mainMenu(ClientGameTestContext context) {
		context.getInput().setCursorPos(10, 10);
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.runOnClient(mc -> { TestHooks.wearOwn("shoes", "rocketboots"); TestHooks.wearOwn("hands", "boxinggloves"); });
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(20);
		context.takeScreenshot("limbs-mainmenu-figure");
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("shoes"));
		context.waitTicks(10);
		context.takeScreenshot("limbs-mainmenu-menu-shoes");
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("hands"));
		context.waitTicks(10);
		context.takeScreenshot("limbs-mainmenu-menu-hands");
		context.runOnClient(mc -> { TestHooks.wearOwn("shoes", null); TestHooks.wearOwn("hands", null); });
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
