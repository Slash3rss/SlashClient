package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.CraftFitTestHooks;
import dev.slash3rss.slashclient.hud.MapSortTestHooks;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Shift-clicking a crafting table's result with a nearly full inventory: only as many planks as
 * fit with a slot kept for the logs left on the grid, so closing the table drops nothing.
 */
public class GameCraftFit implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("gamemode survival @a");
			server.runCommand("clear @a");
			server.runCommand("fill -3 99 -3 3 99 5 stone");
			server.runCommand("setblock 0 100 2 minecraft:crafting_table");
			server.runCommand("tp @a 0 100 0 0 30");
			// everything full of cobblestone but two slots: the logs in one, the other empty
			for (int i = 0; i < 34; i++) server.runCommand("item replace entity @a container." + i + " with minecraft:cobblestone 64");
			server.runCommand("item replace entity @a container.34 with minecraft:oak_log 64");
			context.runOnClient(mc -> CraftFitTestHooks.enabled(true));
			context.waitTicks(20);
			context.runOnClient(mc -> MapSortTestHooks.use(0, 100, 2));
			waitFor(context, () -> context.computeOnClient(mc -> mc.player.containerMenu.slots.size() == 46), "the crafting table did not open");
			context.waitTicks(5);
			// the logs (inventory 34 is the table's slot 35) onto the grid: the inventory has two free slots now
			context.runOnClient(mc -> CraftFitTestHooks.pickup(35));
			context.runOnClient(mc -> CraftFitTestHooks.pickup(1));
			context.waitTicks(5);
			double[] at = context.computeOnClient(mc -> CraftFitTestHooks.slotPoint(0));
			context.getInput().setCursorPos(at[0], at[1]);
			context.waitTicks(3);
			context.getInput().holdKey(InputConstants.KEY_LSHIFT);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_LEFT);
			context.getInput().releaseKey(InputConstants.KEY_LSHIFT);
			context.waitTicks(10);
			int crafts = context.computeOnClient(mc -> CraftFitTestHooks.lastCrafts());
			check(crafts == 16, "crafts (a slot of planks, a slot kept for the 48 logs left): " + crafts);
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(3);
			context.takeScreenshot("craftfit-table");
			// closed as Esc closes it: the server gives the grid's logs back
			context.runOnClient(mc -> mc.player.closeContainer());
			context.waitTicks(20);
			String state = context.computeOnClient(mc -> CraftFitTestHooks.state());
			check(state.equals("{cobblestone=2176, oak_log=48, oak_planks=64} dropped 0"), "the inventory after closing the table: " + state);
		}
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError("Shift-crafting what fits, " + what);
	}

	private static void waitFor(ClientGameTestContext context, java.util.function.BooleanSupplier done, String what) {
		for (int i = 0; i < 200; i++) {
			if (done.getAsBoolean()) return;
			context.waitTicks(2);
		}
		throw new AssertionError(what);
	}
}
