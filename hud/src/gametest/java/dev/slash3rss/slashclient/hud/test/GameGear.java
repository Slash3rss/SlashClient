package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * SlashClient back items and tails on our own player: every one from the back, the side and the
 * front; a tail walking (swinging), crouching, under a cape (hanging lower), a back item with a
 * cape (in its place), over a chestplate and under a real elytra (hidden); and in the cosmetics
 * menu, from the main menu and in a world.
 */
public class GameGear implements FabricClientGameTest {
	private static final String BACKS = "backpack,quiver,katana,guitar,jetpack,angelpack,minichest,backshield";
	private static final String TAILS = "cattail,foxtail,kitsunetail,deviltail,dragontail,wolftail,squirreltail";

	@Override
	public void runTest(ClientGameTestContext context) {
		String known = context.computeOnClient(mc -> TestHooks.gear());
		if (!known.equals(BACKS + "|" + TAILS)) throw new AssertionError("Not the back items and tails we made: " + known);
		context.getInput().setCursorPos(10, 10);
		// the cosmetics menu from the main menu: no world, the figure is all there is
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(5);
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("back"));
		context.waitTicks(15);
		context.takeScreenshot("gear-menu-back");
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("tail"));
		context.waitTicks(15);
		context.takeScreenshot("gear-menu-tail");
		// the cape's tab with a back item worn: the cape shows there, and a line says the back item takes its place
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("cape"));
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("back", "katana"));
		context.waitTicks(15);
		context.takeScreenshot("gear-menu-cape-with-back");
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			for (String id : BACKS.split(",")) views(context, "back", id);
			context.runOnClient(mc -> TestHooks.wear("back", null));
			for (String id : TAILS.split(",")) views(context, "tail", id);

			// a tail walking: it swings with the steps (two moments a few ticks apart), seen from the side
			context.runOnClient(mc -> { TestHooks.wear("tail", "foxtail"); TestHooks.wear("back", "backpack"); });
			context.runOnClient(mc -> TestHooks.cameraTurn(90));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.runOnClient(mc -> TestHooks.walk(true));
			context.waitTicks(8);
			context.takeScreenshot("gear-walking-1");
			context.waitTicks(3);
			context.takeScreenshot("gear-walking-2");
			context.runOnClient(mc -> TestHooks.walk(false));
			context.waitTicks(20);
			// crouching: it leans with the body
			context.runOnClient(mc -> TestHooks.sneak(true));
			context.waitTicks(10);
			context.takeScreenshot("gear-crouching-side");
			context.runOnClient(mc -> TestHooks.sneak(false));
			context.runOnClient(mc -> TestHooks.cameraTurn(0));

			// with a cape: the back item shows in its place; a tail alone hangs lower under it
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", false));
			context.waitTicks(5);
			context.takeScreenshot("gear-back-with-cape");
			context.runOnClient(mc -> TestHooks.wear("back", null));
			context.waitTicks(5);
			context.takeScreenshot("gear-tail-under-cape");
			context.runOnClient(mc -> TestHooks.cameraTurn(90));
			context.waitTicks(5);
			context.takeScreenshot("gear-tail-under-cape-side");
			context.runOnClient(mc -> TestHooks.cameraTurn(0));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));

			// over a chestplate and leggings; a real elytra hides the back item
			context.runOnClient(mc -> { TestHooks.wear("back", "jetpack"); TestHooks.wear("tail", "dragontail"); });
			world.getServer().runCommand("item replace entity @a armor.chest with iron_chestplate");
			world.getServer().runCommand("item replace entity @a armor.legs with iron_leggings");
			context.waitTicks(10);
			context.takeScreenshot("gear-over-armour");
			context.runOnClient(mc -> TestHooks.cameraTurn(90));
			context.waitTicks(5);
			context.takeScreenshot("gear-over-armour-side");
			context.runOnClient(mc -> TestHooks.cameraTurn(0));
			world.getServer().runCommand("item replace entity @a armor.chest with elytra");
			context.waitTicks(10);
			context.takeScreenshot("gear-under-elytra");
			world.getServer().runCommand("item replace entity @a armor.chest with air");
			world.getServer().runCommand("item replace entity @a armor.legs with air");

			// the menu in a world, on both slots
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("back"));
			context.waitTicks(15);
			context.takeScreenshot("gear-world-menu-back");
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("tail"));
			context.waitTicks(15);
			context.takeScreenshot("gear-world-menu-tail");
			context.setScreen(() -> null);
			context.runOnClient(mc -> { TestHooks.wear("back", null); TestHooks.wear("tail", null); });
			context.runOnClient(mc -> TestHooks.firstPerson());
			// leaving the world goes back to the game's own title screen, as the test framework expects
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/** One item on the player from behind, from the side and from the front. */
	private static void views(ClientGameTestContext context, String slot, String id) {
		context.runOnClient(mc -> TestHooks.wear(slot, id));
		context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
		context.waitTicks(4);
		context.takeScreenshot("gear-" + id + "-back");
		context.runOnClient(mc -> TestHooks.cameraTurn(90));
		context.waitTicks(4);
		context.takeScreenshot("gear-" + id + "-side");
		context.runOnClient(mc -> TestHooks.cameraTurn(0));
		context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
		context.waitTicks(4);
		context.takeScreenshot("gear-" + id + "-front");
	}
}
