package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The cosmetics menu's figure, from the main menu and in a world: its back for the cape, the
 * wings and the elytra, turned by dragging, the aura, the trail (running) and the pet around it,
 * the item tiles of every slot; and the headphones on the real player from the front, side and back.
 */
public class GameCosmeticsScreen implements FabricClientGameTest {
	private static final String[] SLOTS = {"cape", "wings", "elytra", "trail", "aura", "pet", "hat", "top", "kill"};

	@Override
	public void runTest(ClientGameTestContext context) {
		context.getInput().setCursorPos(10, 10);
		// from the main menu: no world, the figure is all there is
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(5);
		shots(context, "menu");
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.firstPerson());
			shots(context, "world");
			context.setScreen(() -> null);

			// the headphones on the real player: the band over the head, the cups on the ears
			context.runOnClient(mc -> { TestHooks.wear("hat", "headphones"); TestHooks.wear("top", null); });
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			context.waitTicks(5);
			context.takeScreenshot("cosscreen-headphones-front");
			context.runOnClient(mc -> TestHooks.turn(90));
			context.waitTicks(5);
			context.takeScreenshot("cosscreen-headphones-side");
			context.runOnClient(mc -> TestHooks.turn(-90));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.waitTicks(5);
			context.takeScreenshot("cosscreen-headphones-back");
			context.runOnClient(mc -> TestHooks.wear("hat", null));
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	private static void shots(ClientGameTestContext context, String where) {
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("cape"));
		// the mouse off the tiles: the figure shows what is worn, not what is under the mouse
		context.getInput().setCursorPos(10, 10);
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("elytra", "neon"); TestHooks.cosmeticsWorn("aura", "souls"); TestHooks.cosmeticsWorn("trail", "hearts"); TestHooks.cosmeticsWorn("hat", "headphones"); });
		context.waitTicks(20);
		// every slot: the figure as the slot shows it, the tiles with their pictures
		for (String slot : SLOTS) {
			context.runOnClient(mc -> TestHooks.cosmeticsSlot(slot));
			context.waitTicks(slot.equals("aura") || slot.equals("trail") ? 30 : 15);
			context.takeScreenshot("cosscreen-" + where + "-" + slot);
		}
		// turned by hand: the cape from the side, the headphones from the side and the back
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("cape"));
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(-90));
		context.waitTicks(15);
		context.takeScreenshot("cosscreen-" + where + "-cape-dragged");
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("hat"));
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(90));
		context.waitTicks(15);
		context.takeScreenshot("cosscreen-" + where + "-headphones-side");
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(180));
		context.waitTicks(15);
		context.takeScreenshot("cosscreen-" + where + "-headphones-back");
		// the pet and the trail of others in the list, tried on
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("pet", "duszek_haze"); TestHooks.cosmeticsSlot("pet"); });
		context.waitTicks(10);
		context.takeScreenshot("cosscreen-" + where + "-pet-ours");
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("trail", "notes"); TestHooks.cosmeticsSlot("trail"); });
		context.waitTicks(30);
		context.takeScreenshot("cosscreen-" + where + "-trail-notes");
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("aura", "enchant"); TestHooks.cosmeticsSlot("aura"); });
		context.waitTicks(30);
		context.takeScreenshot("cosscreen-" + where + "-aura-enchant");
	}
}
