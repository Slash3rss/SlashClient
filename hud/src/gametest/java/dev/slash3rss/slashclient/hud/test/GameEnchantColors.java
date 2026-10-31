package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

//#if MC >= 1.21.4
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.inventory.InvToolsTestHooks;
//#endif

/**
 * Enchantments' names coloured by their level: grey below half of the highest, aqua from half, gold at
 * the highest, pink above it, curses red; the game's grey with the setting off. And a sword's tooltip.
 */
public class GameEnchantColors implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 1.21.4
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			String colors = context.computeOnClient(mc -> TestHooks.enchantColors());
			if (!colors.equals("aaaaaa 55ffff ffaa00 ff55ff ffaa00 ff5555 | aaaaaa aaaaaa aaaaaa aaaaaa aaaaaa ff5555 |"))
				throw new AssertionError("Enchantment colours (Sharpness I, III, V, VI, Mending, Curse of Vanishing; then off): " + colors);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("clear @a");
			server.runCommand("item replace entity @p hotbar.0 with minecraft:diamond_sword");
			for (String e : new String[] { "sharpness 3", "unbreaking 3", "mending", "looting 1", "vanishing_curse" }) server.runCommand("enchant @p minecraft:" + e);
			context.waitTicks(5);
			context.runOnClient(mc -> InvToolsTestHooks.quiet());
			context.runOnClient(mc -> InvToolsTestHooks.openInventory());
			context.waitTicks(5);
			int[] sword = context.computeOnClient(mc -> InvToolsTestHooks.slotOnWindow(0));
			context.getInput().setCursorPos(sword[0], sword[1]);
			context.waitTicks(5);
			context.takeScreenshot("enchant-colors");
			context.getInput().setCursorPos(4, 4);
			context.setScreen(() -> null);
		}
		//#endif
	}
}
