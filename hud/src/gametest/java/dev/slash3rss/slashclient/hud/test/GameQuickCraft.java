package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

//#if MC >= 1.21.4
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
//#endif

/**
 * One-click crafting: a recipe clicked in the inventory's recipe book is crafted at once (one craft;
 * with Shift all the logs), and off it only lays out the ingredients as the game does. A variant picked
 * in a stonecutter is cut once into the inventory.
 */
public class GameQuickCraft implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 1.21.4
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode survival @a");
			server.runCommand("clear @a");
			server.runCommand("recipe give @a *");
			server.runCommand("give @a oak_log 8");
			context.runOnClient(mc -> TestHooks.quickCraft(true));
			context.setScreen(() -> new InventoryScreen(Minecraft.getInstance().player));
			context.waitTicks(10);
			TestHooks.quickCrafted();

			// one click: one craft, 4 planks in the inventory and the grid empty
			check(context.computeOnClient(mc -> TestHooks.placeRecipe("oak_planks", false)), "no recipe for oak planks in the book");
			waitFor(context, () -> context.computeOnClient(mc -> TestHooks.carried("minecraft:oak_planks")) == 4, "one click did not craft 4 planks");
			context.waitTicks(5);
			check(context.computeOnClient(mc -> TestHooks.carried("minecraft:oak_log")) == 7, "one click used more than one log");
			context.takeScreenshot("quickcraft-one");

			// with Shift: the rest of the logs at once
			check(context.computeOnClient(mc -> TestHooks.placeRecipe("oak_planks", true)), "no recipe for oak planks in the book");
			waitFor(context, () -> context.computeOnClient(mc -> TestHooks.carried("minecraft:oak_log")) == 0, "a stack's worth was not crafted");
			context.waitTicks(5);
			check(context.computeOnClient(mc -> TestHooks.carried("minecraft:oak_planks")) == 32, "all the logs did not become 32 planks");

			// off: the book only lays out the ingredients, nothing is taken
			context.runOnClient(mc -> TestHooks.quickCraft(false));
			int planks = context.computeOnClient(mc -> TestHooks.carried("minecraft:oak_planks"));
			check(context.computeOnClient(mc -> TestHooks.placeRecipe("crafting_table", false)), "no recipe for a crafting table in the book");
			context.waitTicks(20);
			check(context.computeOnClient(mc -> TestHooks.carried("minecraft:crafting_table")) == 0, "a crafting table was crafted with the module off");
			check(context.computeOnClient(mc -> TestHooks.carried("minecraft:oak_planks")) == planks - 4, "the ingredients were not laid out with the module off");
			context.takeScreenshot("quickcraft-off");
			context.setScreen(() -> null);
			context.waitTicks(5);

			// the stonecutter: a variant picked is cut once into the inventory
			context.runOnClient(mc -> TestHooks.quickCraft(true));
			server.runCommand("clear @a");
			server.runCommand("item replace entity @a hotbar.0 with stone 4");
			server.runCommand("setblock 0 -60 2 stonecutter");
			server.runCommand("tp @a 0.5 -60 0.5 0 30");
			context.waitTicks(10);
			context.runOnClient(mc -> mc.gameMode.useItemOn(mc.player, net.minecraft.world.InteractionHand.MAIN_HAND,
				new net.minecraft.world.phys.BlockHitResult(new net.minecraft.world.phys.Vec3(0.5, -59.5, 2), net.minecraft.core.Direction.NORTH,
					new net.minecraft.core.BlockPos(0, -60, 2), false)));
			waitFor(context, () -> context.computeOnClient(mc -> mc.player.containerMenu instanceof net.minecraft.world.inventory.StonecutterMenu), "the stonecutter did not open");
			// the stone into the cutter's input (the hotbar's first slot is the window's 29th)
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.containerClick(mc, mc.player, mc.player.containerMenu.containerId, 29, 0, dev.slash3rss.slashclient.hud.Compat.Click.QUICK_MOVE));
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.stonecutterPick(0));
			waitFor(context, () -> context.computeOnClient(mc -> TestHooks.quickCrafted()) > 0, "picking a variant cut nothing");
			context.waitTicks(5);
			int input = context.computeOnClient(mc -> mc.player.containerMenu.getSlot(0).getItem().getCount());
			check(input == 3, "the stonecutter cut " + (4 - input) + " stone, not one");
			context.takeScreenshot("quickcraft-stonecutter");
			context.setScreen(() -> null);

			// the module's page, with its two keys
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.HudEditScreen("quickCraft"));
			context.waitTicks(5);
			context.takeScreenshot("quickcraft-settings");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.quickCraft(false));
		}
		//#endif
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}

	private static void waitFor(ClientGameTestContext context, java.util.function.BooleanSupplier done, String what) {
		for (int i = 0; i < 60; i++) {
			if (done.getAsBoolean()) return;
			context.waitTicks(2);
		}
		throw new AssertionError(what);
	}
}
