package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

//#if MC >= 1.21.4
import dev.slash3rss.slashclient.hud.TestHooks;
//#endif

/**
 * Bread in the hand of a hungry player: the food bar shows the drumsticks it adds and the saturation
 * it gives; with something else in the hand, nothing.
 */
public class GameFoodPreview implements FabricClientGameTest {
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
			server.runOnServer(s -> s.getPlayerList().getPlayers().forEach(p -> {
				p.getFoodData().setFoodLevel(8);
				p.getFoodData().setSaturation(1f);
			}));
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:bread");
			context.waitTicks(10);
			// bread: 5 food points and 6 saturation; from 8 and 1, the bar goes to 13 and 7
			String food = context.computeOnClient(mc -> TestHooks.foodPreview());
			if (!food.equals("5 6.0 -> 13 7.0")) throw new AssertionError("What the bread gives: " + food);
			context.takeScreenshot("food-preview");
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:stone");
			context.waitTicks(5);
			food = context.computeOnClient(mc -> TestHooks.foodPreview());
			if (!food.equals("none")) throw new AssertionError("Stone is no food: " + food);
		}
		//#endif
	}
}
