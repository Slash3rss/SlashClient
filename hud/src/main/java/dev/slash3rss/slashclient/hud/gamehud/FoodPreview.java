package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodData;
import net.minecraft.world.item.ItemStack;

import java.util.List;
import java.util.Locale;

/**
 * Food on the food bar (HeartsMixin, after the game's bars). Food held in a hand shows what eating it
 * gives: the drumsticks it adds flash, a golden outline of each drumstick marks the saturation (the
 * part it adds flashing too), and the hearts that health coming back after it would fill flash on the
 * health bar. Without food in hand the saturation stays outlined, and a pale strip over the
 * drumsticks shows the exhaustion, how near the next point of saturation or hunger is to going. The
 * food's values are in its tooltip too, and the three numbers on F3 (FoodDebugMixin). Not while
 * riding something with its own health (the game shows that instead of the food bar).
 */
public final class FoodPreview {
	private FoodPreview() {}

	private static final Identifier FULL = Identifier.withDefaultNamespace("hud/food_full");
	private static final Identifier HALF = Identifier.withDefaultNamespace("hud/food_half");
	private static final Identifier HEART_FULL = Identifier.withDefaultNamespace("hud/heart/full");
	private static final Identifier HEART_HALF = Identifier.withDefaultNamespace("hud/heart/half");
	/** The outline of the game's drumstick (and of its half), drawn for this, white to be tinted. */
	private static final Identifier SATURATION_FULL = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/saturation_full.png");
	private static final Identifier SATURATION_HALF = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/saturation_half.png");
	private static final int GOLD = 0xFFD84A;
	/** The game takes a point of saturation (or hunger) for every 4 of exhaustion. */
	private static final float EXHAUSTION_STEP = 4f;

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

	private static boolean on() {
		return SlashHud.config != null && SlashHud.config.foodPreview;
	}

	/**
	 * The exhaustion (0 to 4), or -1 when it is not known: the game keeps it on the server and never
	 * sends it, so only a world of the player's own (singleplayer, opened to LAN) has it, from its
	 * server's copy of the player.
	 */
	public static float exhaustion(Player player) {
		var server = Minecraft.getInstance().getSingleplayerServer();
		if (server == null) return -1;
		Player own = server.getPlayerList().getPlayer(player.getUUID());
		return own == null ? -1 : ((dev.slash3rss.slashclient.hud.mixin.FoodDataAccessor) own.getFoodData()).slashclient$exhaustion();
	}

	/**
	 * The health the game's natural regeneration gives back from this food bar before it runs too low
	 * (as FoodData.tick: with full food and saturation left, saturation turns into health every half
	 * second; at 18 food or more, one point per 4 seconds at 6 exhaustion), up to the most health.
	 */
	public static float healed(int food, float saturation, float exhaustion, float health, float max) {
		float start = health;
		for (int i = 0; i < 2000 && health < max; i++) {
			if (exhaustion > EXHAUSTION_STEP) {
				exhaustion -= EXHAUSTION_STEP;
				if (saturation > 0) saturation = Math.max(saturation - 1, 0);
				else food = Math.max(food - 1, 0);
			}
			if (food >= 20 && saturation > 0) {
				float spent = Math.min(saturation, 6);
				health += spent / 6;
				exhaustion += spent;
			} else if (food >= 18) {
				health += 1;
				exhaustion += 6;
			} else break;
		}
		return Math.min(health, max) - start;
	}

	public static void draw(GuiGraphicsExtractor g, Player player) {
		if (!on()) return;
		HudConfig c = SlashHud.config;
		if (player.getVehicle() instanceof LivingEntity vehicle && vehicle.showVehicleHealth()) return;
		float[] gives = of(player.getMainHandItem());
		if (gives == null) gives = of(player.getOffhandItem());
		FoodData data = player.getFoodData();
		int food = data.getFoodLevel();
		float saturation = data.getSaturationLevel();
		int right = g.guiWidth() / 2 + 91, y = g.guiHeight() - 39;
		float tired = c.foodExhaustion ? exhaustion(player) : -1;
		// the exhaustion: a pale strip from the right end, as long as the way to the next point lost
		if (tired > 0) {
			int w = Math.round(Math.min(tired, EXHAUSTION_STEP) / EXHAUSTION_STEP * 81);
			if (w > 0) {
				g.fill(right - w, y, right, y + 9, 0x30FFFFFF);
				// and a bright line under the drumsticks, plain to see over any ground
				g.fill(right - w, y + 9, right, y + 10, 0xD0FFFFFF);
			}
		}
		if (gives == null && !c.foodSaturation) return;
		float[] then = gives == null ? new float[] { food, saturation } : after(food, saturation, gives);
		// a slow flash, never quite gone
		float pulse = 0.5f + 0.35f * (float) Math.sin(System.currentTimeMillis() / 160.0);
		int flash = Math.round(pulse * 255) << 24;
		for (int i = 0; i < 10; i++) {
			int x = right - i * 8 - 9;
			// the drumsticks it adds (the game's row fills from the right)
			int nowHere = food - i * 2, thenHere = (int) then[0] - i * 2;
			if (gives != null && thenHere > nowHere && nowHere < 2 && thenHere > 0) {
				g.blitSprite(RenderPipelines.GUI_TEXTURED, thenHere >= 2 ? FULL : HALF, x, y, 9, 9, flash | 0xFFFFFF);
			}
			// saturation: a golden outline of the drumstick (of half of it for one point); the part eating adds flashing
			float satNow = saturation - i * 2, satThen = then[1] - i * 2;
			int now = satNow >= 2 ? 2 : satNow >= 1 ? 1 : 0, later = satThen >= 2 ? 2 : satThen >= 1 ? 1 : 0;
			if (later == 0) continue;
			int color = later > now ? flash | GOLD : 0xE0000000 | GOLD;
			g.blit(RenderPipelines.GUI_TEXTURED, later == 2 ? SATURATION_FULL : SATURATION_HALF, x, y, 0, 0, 9, 9, 9, 9, 9, 9, color);
		}
		if (gives != null && c.foodHealth) drawHealth(g, player, food, saturation, Math.max(tired, 0), then, flash);
	}

	/**
	 * The hearts the health coming back after eating fills, flashing on the health bar: on its one row,
	 * or on the compact hearts' row (Hearts.preview); not over the game's several rows.
	 */
	private static void drawHealth(GuiGraphicsExtractor g, Player player, int food, float saturation, float tired, float[] then, int flash) {
		float max = player.getMaxHealth(), health = player.getHealth();
		boolean rows = max + player.getAbsorptionAmount() > 20;
		if (rows && !SlashHud.config.compactHearts || health >= max) return;
		float back = healed((int) then[0], then[1], tired, health, max);
		int from = (int) Math.ceil(health), to = (int) Math.min(max, Math.floor(health + back));
		if (to <= from) return;
		int left = g.guiWidth() / 2 - 91, y = g.guiHeight() - 39;
		if (rows) {
			Hearts.preview(g, left, y, from, to, flash);
			return;
		}
		for (int i = from / 2; i * 2 < to; i++) {
			// a heart already half full shows its new half as a whole one
			g.blitSprite(RenderPipelines.GUI_TEXTURED, to - i * 2 >= 2 ? HEART_FULL : HEART_HALF, left + i * 8, y, 9, 9, flash | 0xFFFFFF);
		}
	}

	/** "Głód +4 · nasycenie +2.4" under a food's name. */
	private static void tooltip(ItemStack stack, List<Component> lines) {
		if (!on() || !SlashHud.config.foodTooltip || lines.isEmpty()) return;
		float[] gives = of(stack);
		if (gives == null) return;
		Component line = Component.translatable("slashclient-hud.food.tooltip", Math.round(gives[0]), String.format(Locale.ROOT, "%.1f", gives[1]))
			.withStyle(Style.EMPTY.withColor(0xA8A29E));
		lines.add(1, line);
	}

	/** F3's lines, or none when switched off: the exhaustion only where it is known. */
	public static List<String> debugLines(Player player) {
		if (!on() || !SlashHud.config.foodDebug || player == null) return List.of();
		FoodData data = player.getFoodData();
		float tired = exhaustion(player);
		return List.of(String.format(Locale.ROOT, "Food: %d  Saturation: %.1f  Exhaustion: %s", data.getFoodLevel(), data.getSaturationLevel(),
			tired < 0 ? "?" : String.format(Locale.ROOT, "%.2f", tired)));
	}

	public static void register() {
		//#if MC >= 1.20.5
		net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback.EVENT.register((stack, context, flag, lines) -> tooltip(stack, lines));
		//#else
		//$ net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback.EVENT.register((stack, flag, lines) -> tooltip(stack, lines));
		//#endif
	}
}
