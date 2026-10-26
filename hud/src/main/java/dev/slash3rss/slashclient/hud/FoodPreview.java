package dev.slash3rss.slashclient.hud;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

/**
 * Food held in a hand shows on the food bar what eating it gives (HeartsMixin, after the game's
 * bars): the drumsticks it adds flash, and a golden outline of each drumstick marks the
 * saturation, the part it adds flashing too. Not while riding something with its own health
 * (the game shows that instead of the food bar).
 */
public final class FoodPreview {
	private FoodPreview() {}

	private static final Identifier FULL = Identifier.withDefaultNamespace("hud/food_full");
	private static final Identifier HALF = Identifier.withDefaultNamespace("hud/food_half");
	/** The outline of the game's drumstick (and of its half), drawn for this, white to be tinted. */
	private static final Identifier SATURATION_FULL = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/saturation_full.png");
	private static final Identifier SATURATION_HALF = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/saturation_half.png");
	private static final int GOLD = 0xFFD84A;

	/** The food points and saturation an item gives when eaten, or null when it is no food. */
	public static float[] of(ItemStack stack) {
		if (stack.isEmpty()) return null;
		//#if MC >= 1.20.5
		var food = stack.get(net.minecraft.core.component.DataComponents.FOOD);
		return food == null ? null : new float[] { food.nutrition(), food.saturation() };
		//#else
		//$ var food = stack.getItem().getFoodProperties();
		//$ return food == null ? null : new float[] { food.getNutrition(), food.getNutrition() * food.getSaturationModifier() * 2f };
		//#endif
	}

	/** What the food bar would be after eating (food points, saturation), from now and the food. */
	public static float[] after(int food, float saturation, float[] gives) {
		int then = Math.min(20, food + Math.round(gives[0]));
		return new float[] { then, Math.min(then, saturation + gives[1]) };
	}

	public static void draw(GuiGraphicsExtractor g, Player player) {
		if (SlashHud.config == null || !SlashHud.config.foodPreview) return;
		if (player.getVehicle() instanceof LivingEntity vehicle && vehicle.showVehicleHealth()) return;
		float[] gives = of(player.getMainHandItem());
		if (gives == null) gives = of(player.getOffhandItem());
		if (gives == null) return;
		var data = player.getFoodData();
		int food = data.getFoodLevel();
		float saturation = data.getSaturationLevel();
		float[] then = after(food, saturation, gives);
		int right = g.guiWidth() / 2 + 91, y = g.guiHeight() - 39;
		// a slow flash, never quite gone
		float pulse = 0.5f + 0.35f * (float) Math.sin(System.currentTimeMillis() / 160.0);
		int flash = Math.round(pulse * 255) << 24;
		for (int i = 0; i < 10; i++) {
			int x = right - i * 8 - 9;
			// the drumsticks it adds (the game's row fills from the right)
			int nowHere = food - i * 2, thenHere = (int) then[0] - i * 2;
			if (thenHere > nowHere && nowHere < 2 && thenHere > 0) {
				g.blitSprite(RenderPipelines.GUI_TEXTURED, thenHere >= 2 ? FULL : HALF, x, y, 9, 9, flash | 0xFFFFFF);
			}
			// saturation: a golden outline of the drumstick (of half of it for one point); the part eating adds flashing
			float satNow = saturation - i * 2, satThen = then[1] - i * 2;
			int now = satNow >= 2 ? 2 : satNow >= 1 ? 1 : 0, later = satThen >= 2 ? 2 : satThen >= 1 ? 1 : 0;
			if (later == 0) continue;
			int color = later > now ? flash | GOLD : 0xE0000000 | GOLD;
			g.blit(RenderPipelines.GUI_TEXTURED, later == 2 ? SATURATION_FULL : SATURATION_HALF, x, y, 0, 0, 9, 9, 9, 9, 9, 9, color);
		}
	}
}
