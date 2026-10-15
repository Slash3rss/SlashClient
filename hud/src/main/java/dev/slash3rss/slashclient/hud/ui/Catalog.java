package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Everything the settings window lists: HUD modules and extras, each with its own settings. */
public final class Catalog {
	private Catalog() {}

	public static final String[] CATEGORIES = { "all", "hud", "combat", "world", "extras", "chat", "share" };

	/** One row in an entry's settings. */
	public sealed interface Setting permits Toggle, Slider, Choice, Colors {
		String labelKey();
	}

	public record Toggle(String labelKey, Supplier<Boolean> get, Consumer<Boolean> set) implements Setting {}

	/** A number between min and max, shown with `format` ("%.1f×", "%d", …). */
	public record Slider(String labelKey, float min, float max, float step, String format, Supplier<Float> get, Consumer<Float> set) implements Setting {}

	public record Choice(String labelKey, String[] values, String valueKeyPrefix, Supplier<String> get, Consumer<String> set) implements Setting {}

	public record Colors(String labelKey, int[] colors, Supplier<Integer> get, Consumer<Integer> set) implements Setting {}

	/** A card: `get`/`set` are null when the card has no on/off switch (it only opens something). */
	public record Entry(String id, String nameKey, String category, Item icon, Supplier<Boolean> get, Consumer<Boolean> set, List<Setting> settings, Runnable open) {
		public boolean hasSwitch() {
			return get != null;
		}
	}

	private static final Map<String, Item> MODULE_ICONS = Map.ofEntries(
		Map.entry("fps", Items.GLOWSTONE_DUST), Map.entry("ping", Items.ENDER_EYE), Map.entry("cps", Items.STONE_BUTTON),
		Map.entry("coords", Items.COMPASS), Map.entry("speed", Items.FEATHER), Map.entry("clock", Items.CLOCK),
		Map.entry("server", Items.NETHER_STAR), Map.entry("players", Items.PLAYER_HEAD), Map.entry("memory", Items.REDSTONE),
		Map.entry("biome", Items.OAK_SAPLING), Map.entry("daytime", Items.SUNFLOWER), Map.entry("light", Items.TORCH),
		Map.entry("session", Items.BOOK), Map.entry("combo", Items.IRON_SWORD), Map.entry("reach", Items.TRIDENT),
		Map.entry("movement", Items.LEATHER_BOOTS), Map.entry("saturation", Items.COOKED_BEEF), Map.entry("items", Items.ARROW),
		Map.entry("target", Items.TARGET), Map.entry("armor", Items.DIAMOND_CHESTPLATE), Map.entry("effects", Items.POTION),
		Map.entry("keystrokes", Items.LEVER));

	private static final Map<String, String> MODULE_CATEGORIES = Map.ofEntries(
		Map.entry("fps", "hud"), Map.entry("ping", "hud"), Map.entry("cps", "combat"), Map.entry("coords", "hud"),
		Map.entry("speed", "hud"), Map.entry("clock", "hud"), Map.entry("server", "hud"), Map.entry("players", "hud"),
		Map.entry("memory", "hud"), Map.entry("session", "hud"), Map.entry("biome", "world"), Map.entry("daytime", "world"),
		Map.entry("light", "world"), Map.entry("saturation", "world"), Map.entry("movement", "world"), Map.entry("combo", "combat"),
		Map.entry("reach", "combat"), Map.entry("target", "combat"), Map.entry("armor", "combat"), Map.entry("effects", "combat"),
		Map.entry("items", "combat"), Map.entry("keystrokes", "combat"));

	static final int[] COLORS = { 0xFFFFFFFF, 0xFF60A5FA, 0xFF4ADE80, 0xFF55FFFF, 0xFFFACC15, 0xFFF87171, 0xFFA855F7, 0xFFFF55FF };

	public static List<Entry> entries(Runnable openChatTabs) {
		HudConfig cfg = SlashHud.config;
		List<Entry> out = new ArrayList<>();
		for (var m : SlashHud.modules()) {
			HudConfig.Placement p = cfg.placement(m.id());
			out.add(new Entry(m.id(), "slashclient-hud.module." + m.id(), MODULE_CATEGORIES.getOrDefault(m.id(), "hud"),
				MODULE_ICONS.getOrDefault(m.id(), Items.PAPER), () -> p.enabled, v -> p.enabled = v,
				List.of(
					new Slider("slashclient-hud.set.scale", 0.5f, 2f, 0.05f, "%.2f×", p::scale, v -> p.scale = v),
					new Toggle("slashclient-hud.background", () -> p.background(cfg), v -> p.background = v)),
				null));
		}
		out.add(new Entry("zoom", "slashclient-hud.zoom", "extras", Items.SPYGLASS, () -> cfg.zoom, v -> cfg.zoom = v, List.of(
			new Slider("slashclient-hud.set.zoomFactor", 2f, 12f, 0.5f, "%.1f×", () -> cfg.zoomFactor, v -> cfg.zoomFactor = v),
			new Toggle("slashclient-hud.zoomSmooth", () -> cfg.zoomSmooth, v -> cfg.zoomSmooth = v)), null));
		out.add(new Entry("fullbright", "slashclient-hud.fullbright", "extras", Items.GLOWSTONE, () -> cfg.fullbright, v -> cfg.fullbright = v, List.of(), null));
		out.add(new Entry("lowFire", "slashclient-hud.lowFire", "extras", Items.BLAZE_POWDER, () -> cfg.lowFire, v -> cfg.lowFire = v, List.of(), null));
		out.add(new Entry("crosshair", "slashclient-hud.crosshair", "extras", Items.CROSSBOW, () -> !"vanilla".equals(cfg.crosshair),
			v -> cfg.crosshair = v ? ("vanilla".equals(cfg.crosshair) ? "plusdot" : cfg.crosshair) : "vanilla", List.of(
			new Choice("slashclient-hud.set.shape", new String[] { "plus", "dot", "plusdot", "x" }, "slashclient-hud.crosshair.", () -> cfg.crosshair, v -> cfg.crosshair = v),
			new Colors("slashclient-hud.crosshairColor", COLORS, () -> cfg.crosshairColor, v -> cfg.crosshairColor = v),
			new Slider("slashclient-hud.set.size", 1f, 10f, 1f, "%.0f", () -> (float) cfg.crosshairSize, v -> cfg.crosshairSize = Math.round(v)),
			new Slider("slashclient-hud.set.gap", 0f, 6f, 1f, "%.0f", () -> (float) cfg.crosshairGap, v -> cfg.crosshairGap = Math.round(v))), null));
		out.add(new Entry("appearance", "slashclient-hud.set.appearance", "extras", Items.PAINTING, null, null, List.of(
			new Colors("slashclient-hud.textColor", COLORS, () -> cfg.textColor, v -> cfg.textColor = v),
			new Toggle("slashclient-hud.shadow", () -> cfg.textShadow, v -> cfg.textShadow = v),
			new Toggle("slashclient-hud.set.backgroundAll", () -> cfg.background, v -> cfg.background = v)), null));
		out.add(new Entry("badges", "slashclient-hud.set.badges", "extras", Items.NAME_TAG, () -> cfg.badges, v -> cfg.badges = v, List.of(), null));
		out.add(new Entry("menu", "slashclient-hud.set.menu", "extras", Items.GRASS_BLOCK, () -> cfg.customMenu, v -> cfg.customMenu = v, List.of(), null));
		out.add(new Entry("chatTimestamps", "slashclient-hud.chatTimestamps", "chat", Items.WRITABLE_BOOK, () -> cfg.chatTimestamps, v -> cfg.chatTimestamps = v, List.of(), null));
		out.add(new Entry("chatTabs", "slashclient-hud.chat.tabs", "chat", Items.BOOKSHELF, null, null, List.of(), openChatTabs));
		return out;
	}
}
