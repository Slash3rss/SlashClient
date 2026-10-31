package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.tooltip.ClientTooltipComponent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodData;
import net.minecraft.world.inventory.tooltip.TooltipComponent;
import net.minecraft.world.item.ItemStack;

import java.util.List;
import java.util.Locale;

/**
 * Food on the food bar (HeartsMixin, after the game's bars). Food held in a hand shows what eating it
 * gives: the drumsticks it adds flash, a golden outline of each drumstick marks the saturation (the
 * part it adds flashing too), and the hearts that health coming back after it would fill flash on the
 * health bar. Without food in hand the saturation stays outlined, and a dotted strip under the
 * drumsticks fills from the right with the exhaustion: when it reaches the left end, the server takes
 * a point of saturation (or hunger). On a server the exhaustion is counted in the game (Exhaustion). The
 * food's values are in its tooltip too, as drumsticks and golden outlines, and the three numbers on F3 (FoodDebugMixin). Not while
 * riding something with its own health (the game shows that instead of the food bar).
 */
public final class FoodPreview {
	private FoodPreview() {}

	private static final Identifier FULL = Identifier.withDefaultNamespace("hud/food_full");
	private static final Identifier HALF = Identifier.withDefaultNamespace("hud/food_half");
	private static final Identifier EMPTY = Identifier.withDefaultNamespace("hud/food_empty");
	private static final Identifier HEART_FULL = Identifier.withDefaultNamespace("hud/heart/full");
	private static final Identifier HEART_HALF = Identifier.withDefaultNamespace("hud/heart/half");
	/** The outline of the game's drumstick (and of its half), drawn for this, white to be tinted. */
	private static final Identifier SATURATION_FULL = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/saturation_full.png");
	private static final Identifier SATURATION_HALF = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/saturation_half.png");
	/** A dotted strip as wide as the food bar, white to be tinted (as AppleSkin draws the exhaustion). */
	private static final int EXHAUSTION_COLOR = 0xB0A8A8A8;
	private static final Identifier EXHAUSTION = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/exhaustion.png");
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
	 * The exhaustion (0 to 4): the game keeps it on the server and never sends it, so a world of the
	 * player's own (singleplayer, opened to LAN) reads its server's copy of the player, and on a server
	 * it is counted in the game (Exhaustion).
	 */
	public static float exhaustion(Player player) {
		var server = Minecraft.getInstance().getSingleplayerServer();
		Player own = server == null ? null : server.getPlayerList().getPlayer(player.getUUID());
		return own == null ? Exhaustion.value() : ((dev.slash3rss.slashclient.hud.mixin.FoodDataAccessor) own.getFoodData()).slashclient$exhaustion();
	}

	/** Whether the exhaustion is counted in the game, not read (shown as "~" on F3). */
	private static boolean counted() {
		return Minecraft.getInstance().getSingleplayerServer() == null;
	}

	/** The exhaustion: a grey dotted strip under the drumsticks from the right end, full when the next point goes. */
	public static void drawExhaustion(GuiGraphicsExtractor g, Player player, int right, int y) {
		if (!on() || !SlashHud.config.foodExhaustion) return;
		if (player.getVehicle() instanceof LivingEntity vehicle && vehicle.showVehicleHealth()) return;
		float tired = exhaustion(player);
		int w = Math.round(Math.min(Math.max(tired, 0), EXHAUSTION_STEP) / EXHAUSTION_STEP * 81);
		if (w > 0) g.blit(RenderPipelines.GUI_TEXTURED, EXHAUSTION, right - w, y, 81 - w, 0, w, 9, w, 9, 81, 9, EXHAUSTION_COLOR);
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
		//#if MC < 1.20.5
		//$ // no call of its own for the food bar to go under: over it
		//$ drawExhaustion(g, player, right, y);
		//#endif
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

	/** What a food's tooltip carries to its picture (FoodTooltipMixin): food points and saturation it gives. */
	public record Gives(int food, float saturation) implements TooltipComponent {}

	/** The picture for a food's tooltip, or null for anything else (or with it switched off). */
	public static Gives image(ItemStack stack) {
		if (!on() || !SlashHud.config.foodTooltip) return null;
		float[] gives = of(stack);
		return gives == null ? null : new Gives(Math.round(gives[0]), gives[1]);
	}

	/**
	 * Under a food's name, as on the food bar: the drumsticks it fills, and under them the saturation as golden outlines
	 * (a half of either for one point). More than ten of a kind show one with "×12".
	 */
	static final class Icons implements ClientTooltipComponent {
		private static final int MOST = 10, ROW = 10;
		private final int food, saturation;

		Icons(Gives gives) {
			food = Math.max(gives.food(), 0);
			saturation = Math.max(Math.round(gives.saturation()), 0);
		}

		//#if MC >= 1.21.2
		@Override
		public int getHeight(Font font) {
			return rows() * ROW + 1;
		}
		//#else
		//$ @Override
		//$ public int getHeight() {
		//$ 	return rows() * ROW + 1;
		//$ }
		//#endif

		@Override
		public int getWidth(Font font) {
			return Math.max(width(font, food), width(font, saturation));
		}

		private int rows() {
			return (food > 0 ? 1 : 0) + (saturation > 0 ? 1 : 0);
		}

		/** A row of icons for these points: one for every two, or one with the count when they are many. */
		private static int width(Font font, int points) {
			if (points <= 0) return 0;
			int icons = (points + 1) / 2;
			return icons > MOST ? 10 + font.width(count(points)) : icons * 8 + 1;
		}

		private static String count(int points) {
			return "×" + (points % 2 == 0 ? String.valueOf(points / 2) : String.format(Locale.ROOT, "%.1f", points / 2f));
		}

		//#if MC >= 26.1
		@Override
		public void extractImage(Font font, int x, int y, int w, int h, GuiGraphicsExtractor g) {
			draw(font, x, y, g);
		}
		//#elif MC >= 1.21.2
		//$ @Override
		//$ public void renderImage(Font font, int x, int y, int w, int h, GuiGraphicsExtractor g) {
		//$ 	draw(font, x, y, g);
		//$ }
		//#else
		//$ @Override
		//$ public void renderImage(Font font, int x, int y, GuiGraphicsExtractor g) {
		//$ 	draw(font, x, y, g);
		//$ }
		//#endif

		private void draw(Font font, int x, int y, GuiGraphicsExtractor g) {
			row(font, g, x, y, food, false);
			row(font, g, x, food > 0 ? y + ROW : y, saturation, true);
		}

		/** One row, on the empty drumsticks of the food bar. */
		private static void row(Font font, GuiGraphicsExtractor g, int x, int y, int points, boolean gold) {
			if (points <= 0) return;
			int icons = (points + 1) / 2;
			boolean many = icons > MOST;
			for (int i = 0; i < (many ? 1 : icons); i++) {
				boolean half = !many && points - i * 2 == 1;
				g.blitSprite(RenderPipelines.GUI_TEXTURED, EMPTY, x + i * 8, y, 9, 9);
				if (gold) g.blit(RenderPipelines.GUI_TEXTURED, half ? SATURATION_HALF : SATURATION_FULL, x + i * 8, y, 0, 0, 9, 9, 9, 9, 9, 9, 0xFF000000 | GOLD);
				else g.blitSprite(RenderPipelines.GUI_TEXTURED, half ? HALF : FULL, x + i * 8, y, 9, 9);
			}
			if (!many) return;
			String count = count(points);
			g.text(font, count, x + 10, y + 1, gold ? 0xFF000000 | GOLD : 0xFFA8A29E, true);
		}
	}

	/** F3's lines, or none when switched off: the exhaustion with "~" where it is counted in the game. */
	public static List<String> debugLines(Player player) {
		if (!on() || !SlashHud.config.foodDebug || player == null) return List.of();
		FoodData data = player.getFoodData();
		float tired = exhaustion(player);
		return List.of(String.format(Locale.ROOT, "Food: %d  Saturation: %.1f  Exhaustion: %s%.2f", data.getFoodLevel(), data.getSaturationLevel(),
			counted() ? "~" : "", tired));
	}

	public static void register() {
		//#if MC >= 26.1
		net.fabricmc.fabric.api.client.rendering.v1.ClientTooltipComponentCallback.EVENT.register(data -> data instanceof Gives gives ? new Icons(gives) : null);
		//#else
		//$ net.fabricmc.fabric.api.client.rendering.v1.TooltipComponentCallback.EVENT.register(data -> data instanceof Gives gives ? new Icons(gives) : null);
		//#endif
	}
}
