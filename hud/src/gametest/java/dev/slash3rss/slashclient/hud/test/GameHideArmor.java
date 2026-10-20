package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Hiding our own armour: in diamond armour over a hat and a jacket, seen from the front, each piece
 * hidden on its own and then all of them (the clothing under it shows), in the inventory too; a
 * zombie in the same armour beside us keeps all of it. The elytra stays unless asked: hidden, the
 * cape shows in its place.
 */
public class GameHideArmor implements FabricClientGameTest {
	private static final String[] PIECES = {"helmet", "chestplate", "leggings", "boots"};
	private static final String[] SLOTS = {"head", "chest", "legs", "feet"};
	private static final String FULL = "diamond_helmet,diamond_chestplate,diamond_leggings,diamond_boots";

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			// someone else in the same armour, beside us: theirs always shows
			world.getServer().runCommand("execute at @a run summon zombie ~1.2 ~ ~2.5 {NoAI:1b,Silent:1b,PersistenceRequired:1b}");
			for (int i = 0; i < 4; i++) {
				String item = "diamond_" + PIECES[i];
				world.getServer().runCommand("item replace entity @e[type=zombie] armor." + SLOTS[i] + " with " + item);
				world.getServer().runCommand("item replace entity @a armor." + SLOTS[i] + " with " + item);
			}
			context.runOnClient(mc -> {
				TestHooks.lookSouth();
				TestHooks.wear("hat", "tophat");
				TestHooks.wear("top", "jacket");
				TestHooks.cosmeticsSelf(null, true);
				TestHooks.hideOwnArmor(false, true, true, true, true, false);
			});
			context.waitTicks(10);
			check(context, true, FULL, "switched off");
			context.takeScreenshot("hide-armor-off");

			// each piece on its own
			for (int i = 0; i < 4; i++) {
				int piece = i;
				context.runOnClient(mc -> TestHooks.hideOwnArmor(true, piece == 0, piece == 1, piece == 2, piece == 3, false));
				context.waitTicks(3);
				String[] want = FULL.split(",");
				want[piece] = "-";
				check(context, true, String.join(",", want), PIECES[i]);
				check(context, false, FULL, PIECES[i] + " (the zombie)");
				context.takeScreenshot("hide-armor-" + PIECES[i]);
			}
			// all of it, and in the inventory
			context.runOnClient(mc -> TestHooks.hideOwnArmor(true, true, true, true, true, false));
			context.waitTicks(3);
			check(context, true, "-,-,-,-", "all");
			check(context, false, FULL, "all (the zombie)");
			context.takeScreenshot("hide-armor-all");
			context.setScreen(() -> new net.minecraft.client.gui.screens.inventory.InventoryScreen(net.minecraft.client.Minecraft.getInstance().player));
			context.waitTicks(5);
			context.takeScreenshot("hide-armor-inventory");
			context.setScreen(() -> null);

			// an elytra: kept unless asked, then the cape shows instead (seen from behind)
			world.getServer().runCommand("item replace entity @a armor.chest with elytra");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", false));
			context.waitTicks(5);
			check(context, true, "-,elytra,-,-", "elytra kept");
			context.takeScreenshot("hide-armor-elytra-kept");
			context.runOnClient(mc -> TestHooks.hideOwnArmor(true, true, true, true, true, true));
			context.waitTicks(3);
			check(context, true, "-,-,-,-", "elytra hidden");
			context.takeScreenshot("hide-armor-elytra-hidden");

			// switched off, everything is back
			context.runOnClient(mc -> TestHooks.hideOwnArmor(false, true, true, true, true, true));
			context.waitTicks(3);
			check(context, true, "diamond_helmet,elytra,diamond_leggings,diamond_boots", "switched off again");
			context.runOnClient(mc -> {
				TestHooks.wear("hat", null);
				TestHooks.wear("top", null);
				TestHooks.cosmeticsSelf(null, true);
				TestHooks.firstPerson();
			});
			for (String slot : SLOTS) world.getServer().runCommand("item replace entity @a armor." + slot + " with air");
			// leaving the world goes back to the game's own title screen, as the test framework expects
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	private static void check(ClientGameTestContext context, boolean own, String want, String what) {
		String got = context.computeOnClient(mc -> TestHooks.armorState(own));
		if (!got.equals(want)) throw new AssertionError("Armour drawn (" + what + "): " + got + ", not " + want);
	}
}
