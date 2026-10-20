package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Shield and weapon skins: every shield and weapon on our own player (third person from the front,
 * the back and the side, first person, a bow drawn, a shield raised), the hotbar keeping the game's
 * icons; other players' skins only when switched on; an item with a resource pack's model keeping
 * it; and the cosmetics menu's two new tabs, from the main menu and in a world.
 */
public class GameHeldSkins implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String known = context.computeOnClient(mc -> TestHooks.heldSkins());
		if (!known.equals("shield_dragon,shield_demon,shield_cardboard,shield_golden,shield_ice,shield_slash,shield_heart|sword_beam,sword_katana,sword_flame,sword_ice,bow_dragon,bow_crystal"))
			throw new AssertionError("Not the held skins we made: " + known);
		context.getInput().setCursorPos(10, 10);
		// the menu's tabs from the main menu: the figure holds them
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(5);
		menu(context, "menu");
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:diamond_sword");
			world.getServer().runCommand("item replace entity @p weapon.offhand with minecraft:shield");
			context.runOnClient(mc -> { TestHooks.handView(false, false); TestHooks.heldOthers(false); });
			// switched off, nobody's skin: the game's sword and shield
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			context.waitTicks(5);
			context.takeScreenshot("held-vanilla-front");
			// every shield (with the katana) and every sword, from the front
			for (String shield : new String[] {"shield_dragon", "shield_demon", "shield_cardboard", "shield_golden", "shield_ice", "shield_slash", "shield_heart"}) {
				context.runOnClient(mc -> { TestHooks.wear("shield", shield); TestHooks.wear("weapon", "sword_katana"); });
				context.waitTicks(3);
				context.takeScreenshot("held-" + shield + "-front");
			}
			for (String sword : new String[] {"sword_beam", "sword_flame", "sword_ice"}) {
				context.runOnClient(mc -> TestHooks.wear("weapon", sword));
				context.waitTicks(3);
				context.takeScreenshot("held-" + sword + "-front");
			}
			// ours always show; another player's only when switched on
			String own = context.computeOnClient(mc -> TestHooks.heldPick(true));
			if (!own.equals("sword_ice,shield_heart")) throw new AssertionError("Our own skins: " + own);
			String other = context.computeOnClient(mc -> TestHooks.heldPick(false));
			if (!other.equals("-,-")) throw new AssertionError("Other players' skins while switched off: " + other);
			context.runOnClient(mc -> TestHooks.heldOthers(true));
			other = context.computeOnClient(mc -> TestHooks.heldPick(false));
			if (!other.equals("sword_ice,shield_heart")) throw new AssertionError("Other players' skins while switched on: " + other);
			context.runOnClient(mc -> TestHooks.heldOthers(false));
			int swapped = context.computeOnClient(mc -> TestHooks.heldSwapped());
			if (swapped < 10) throw new AssertionError("The held skins were hardly drawn: " + swapped);

			// from behind and from the side
			context.runOnClient(mc -> { TestHooks.wear("shield", "shield_slash"); TestHooks.wear("weapon", "sword_flame"); });
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.waitTicks(5);
			context.takeScreenshot("held-back");
			context.runOnClient(mc -> TestHooks.turn(90));
			context.waitTicks(5);
			context.takeScreenshot("held-side");
			context.runOnClient(mc -> TestHooks.turn(-90));
			// first person: the skins in the hands, the hotbar keeps the game's icons
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.waitTicks(5);
			context.takeScreenshot("held-firstperson");
			// the shield raised
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:stick");
			context.runOnClient(mc -> TestHooks.useKey(true));
			context.waitTicks(10);
			context.takeScreenshot("held-firstperson-blocking");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			context.waitTicks(5);
			context.takeScreenshot("held-blocking-front");
			context.runOnClient(mc -> TestHooks.useKey(false));
			// bows, at rest and drawn
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:bow");
			world.getServer().runCommand("item replace entity @p weapon.offhand with minecraft:arrow 64");
			for (String bow : new String[] {"bow_dragon", "bow_crystal"}) {
				context.runOnClient(mc -> { TestHooks.wear("weapon", bow); TestHooks.cosmeticsSelf(null, true); });
				context.waitTicks(3);
				context.takeScreenshot("held-" + bow + "-front");
				context.runOnClient(mc -> TestHooks.firstPerson());
				context.runOnClient(mc -> TestHooks.useKey(true));
				context.waitTicks(25);
				context.takeScreenshot("held-" + bow + "-drawn");
				context.runOnClient(mc -> TestHooks.useKey(false));
				context.waitTicks(5);
			}
			// a sword the resource pack of a server gave a model of its own keeps it
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:diamond_sword[custom_model_data={floats:[1.0f]}]");
			context.runOnClient(mc -> TestHooks.wear("weapon", "sword_beam"));
			context.waitTicks(3);
			String custom = context.computeOnClient(mc -> TestHooks.heldPick(true));
			if (!custom.startsWith("-,")) throw new AssertionError("A resource pack's sword got our skin: " + custom);
			// a weapon skin of the other kind does nothing: a sword skin on the bow
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:bow");
			custom = context.computeOnClient(mc -> TestHooks.heldPick(true));
			if (!custom.startsWith("-,")) throw new AssertionError("A sword skin on a bow: " + custom);

			// the menu's tabs in a world
			context.runOnClient(mc -> { TestHooks.wear("shield", null); TestHooks.wear("weapon", null); });
			menu(context, "world");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/** The cosmetics menu on the shield's and the weapon's tabs, trying on a bow too. */
	private static void menu(ClientGameTestContext context, String where) {
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("shield"));
		context.waitTicks(15);
		context.takeScreenshot("held-" + where + "-shield-tab");
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("weapon"));
		context.waitTicks(15);
		context.takeScreenshot("held-" + where + "-weapon-tab");
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("weapon", "bow_dragon"));
		context.waitTicks(5);
		context.takeScreenshot("held-" + where + "-weapon-tab-bow");
		context.runOnClient(mc -> TestHooks.cosmeticsWorn("weapon", "sword_beam"));
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(180));
		context.waitTicks(15);
		context.takeScreenshot("held-" + where + "-weapon-tab-turned");
	}
}
