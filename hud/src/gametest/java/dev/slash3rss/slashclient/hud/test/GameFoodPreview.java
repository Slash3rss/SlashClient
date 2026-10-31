package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

//#if MC >= 1.21.4
import dev.slash3rss.slashclient.hud.testing.TestHooks;
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

			// the bread's tooltip says what it gives
			String tip = context.computeOnClient(mc -> String.join(" | ", new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.BREAD)
				.getTooltipLines(net.minecraft.world.item.Item.TooltipContext.of(mc.level), mc.player, net.minecraft.world.item.TooltipFlag.Default.NORMAL)
				.stream().map(c -> c.getString()).toList()));
			if (!tip.contains("Hunger +5 · saturation +6.0")) throw new AssertionError("The bread's tooltip: " + tip);

			// hurt, nearly full, a little tired: the exhaustion is known in this world (F3 and the strip on the bar),
			// steak in hand heals some hearts once eaten (flashing on the health bar)
			server.runOnServer(s -> s.getPlayerList().getPlayers().forEach(p -> {
				p.setHealth(9);
				p.getFoodData().setFoodLevel(16);
				p.getFoodData().setSaturation(0f);
				p.getFoodData().addExhaustion(2.5f);
			}));
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:cooked_beef");
			context.waitTicks(10);
			String f3 = context.computeOnClient(mc -> String.join(" ", dev.slash3rss.slashclient.hud.gamehud.FoodPreview.debugLines(mc.player)));
			if (!f3.contains("Food: 16") || !f3.contains("Exhaustion: 2.")) throw new AssertionError("F3's food line: " + f3);
			// steak: 8 food and 12.8 saturation, from 16 and 0 the bar goes full: its saturation alone heals some 8 health
			float healed = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.gamehud.FoodPreview.healed(20, 12.8f, 2.5f, 9, 20));
			if (healed < 6) throw new AssertionError("The steak would heal only " + healed);
			float none = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.gamehud.FoodPreview.healed(16, 0, 2.5f, 9, 20));
			if (none != 0) throw new AssertionError("Without eating, 16 food heals " + none);
			context.takeScreenshot("food-steak-healing");
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_F3);
			context.waitTicks(5);
			context.takeScreenshot("food-f3");
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_F3);
			// switched off: no F3 line, no tooltip line
			context.runOnClient(mc -> { var c = dev.slash3rss.slashclient.hud.SlashHud.config; c.foodDebug = false; c.foodTooltip = false; });
			f3 = context.computeOnClient(mc -> String.join(" ", dev.slash3rss.slashclient.hud.gamehud.FoodPreview.debugLines(mc.player)));
			if (!f3.isEmpty()) throw new AssertionError("F3's food line with it off: " + f3);
			context.runOnClient(mc -> { var c = dev.slash3rss.slashclient.hud.SlashHud.config; c.foodDebug = true; c.foodTooltip = true; });
			// without food in hand: the saturation outlined and the exhaustion strip
			server.runOnServer(s -> s.getPlayerList().getPlayers().forEach(p -> {
				p.getFoodData().setFoodLevel(20);
				p.getFoodData().setSaturation(7f);
			}));
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:stone");
			context.waitTicks(10);
			context.takeScreenshot("food-saturation");

			// compact hearts with 40 health, 25 of it left: the steak's healing flashes on the second (golden) row
			server.runCommand("attribute @p minecraft:max_health base set 40");
			server.runOnServer(s -> s.getPlayerList().getPlayers().forEach(p -> {
				p.setHealth(25);
				p.getFoodData().setFoodLevel(16);
				p.getFoodData().setSaturation(0f);
			}));
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.compactHearts = true);
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:cooked_beef");
			context.waitTicks(10);
			context.takeScreenshot("food-compact-healing");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.compactHearts = false);
			server.runCommand("attribute @p minecraft:max_health base set 20");
			// the compact hearts' page: which colour reaches how many hearts
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.HudEditScreen("compactHearts"));
			context.waitTicks(5);
			context.takeScreenshot("food-hearts-legend");
			context.setScreen(() -> null);
		}
		//#endif
	}
}
