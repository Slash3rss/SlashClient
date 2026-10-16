package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Everything the settings window lists: HUD modules and extras, each with its own settings. */
public final class Catalog {
	private Catalog() {}

	public static final String[] CATEGORIES = { "all", "hud", "combat", "world", "game", "extras", "chat", "share" };

	/** One row in an entry's settings. */
	public sealed interface Setting permits Toggle, Slider, Choice, Colors {
		String labelKey();
	}

	public record Toggle(String labelKey, Supplier<Boolean> get, Consumer<Boolean> set) implements Setting {}

	/** A number between min and max, shown with `format` ("%.1f×", "%d", …). */
	public record Slider(String labelKey, float min, float max, float step, String format, Supplier<Float> get, Consumer<Float> set) implements Setting {}

	public record Choice(String labelKey, String[] values, String valueKeyPrefix, Supplier<String> get, Consumer<String> set) implements Setting {}

	public record Colors(String labelKey, int[] colors, Supplier<Integer> get, Consumer<Integer> set) implements Setting {}

	/**
	 * A card: `get`/`set` are null when the card has no on/off switch (it only opens something).
	 * `icon` is one of the launcher's Font Awesome icons in textures/icon (m-<id in lower case>.png: resource names allow no capitals).
	 */
	public record Entry(String id, String nameKey, String category, String icon, Supplier<Boolean> get, Consumer<Boolean> set, List<Setting> settings, Runnable open) {
		public boolean hasSwitch() {
			return get != null;
		}
	}

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
				"m-" + m.id().toLowerCase(java.util.Locale.ROOT), () -> p.enabled, v -> p.enabled = v,
				List.of(
					new Slider("slashclient-hud.set.scale", 0.5f, 2f, 0.05f, "%.2f×", p::scale, v -> p.scale = v),
					new Toggle("slashclient-hud.background", () -> p.background(cfg), v -> p.background = v)),
				null));
		}
		out.add(new Entry("zoom", "slashclient-hud.zoom", "extras", "m-zoom", () -> cfg.zoom, v -> cfg.zoom = v, List.of(
			new Slider("slashclient-hud.set.zoomFactor", 2f, 12f, 0.5f, "%.1f×", () -> cfg.zoomFactor, v -> cfg.zoomFactor = v),
			new Toggle("slashclient-hud.zoomSmooth", () -> cfg.zoomSmooth, v -> cfg.zoomSmooth = v)), null));
		out.add(new Entry("fullbright", "slashclient-hud.fullbright", "extras", "m-fullbright", () -> cfg.fullbright, v -> cfg.fullbright = v, List.of(), null));
		out.add(new Entry("lowFire", "slashclient-hud.lowFire", "extras", "m-lowfire", () -> cfg.lowFire, v -> cfg.lowFire = v, List.of(), null));
		out.add(new Entry("crosshair", "slashclient-hud.crosshair", "extras", "m-crosshair", () -> !"vanilla".equals(cfg.crosshair),
			v -> cfg.crosshair = v ? ("vanilla".equals(cfg.crosshair) ? "plusdot" : cfg.crosshair) : "vanilla", List.of(
			new Choice("slashclient-hud.set.shape", new String[] { "plus", "dot", "plusdot", "x" }, "slashclient-hud.crosshair.", () -> cfg.crosshair, v -> cfg.crosshair = v),
			new Colors("slashclient-hud.crosshairColor", COLORS, () -> cfg.crosshairColor, v -> cfg.crosshairColor = v),
			new Slider("slashclient-hud.set.size", 1f, 10f, 1f, "%.0f", () -> (float) cfg.crosshairSize, v -> cfg.crosshairSize = Math.round(v)),
			new Slider("slashclient-hud.set.gap", 0f, 6f, 1f, "%.0f", () -> (float) cfg.crosshairGap, v -> cfg.crosshairGap = Math.round(v))), null));
		out.add(new Entry("appearance", "slashclient-hud.set.appearance", "extras", "m-appearance", null, null, List.of(
			new Colors("slashclient-hud.textColor", COLORS, () -> cfg.textColor, v -> cfg.textColor = v),
			new Toggle("slashclient-hud.shadow", () -> cfg.textShadow, v -> cfg.textShadow = v),
			new Toggle("slashclient-hud.set.backgroundAll", () -> cfg.background, v -> cfg.background = v)), null));
		out.add(new Entry("badges", "slashclient-hud.set.badges", "extras", "m-badges", () -> cfg.badges, v -> cfg.badges = v, List.of(), null));
		out.add(new Entry("menu", "slashclient-hud.set.menu", "extras", "m-menu", () -> cfg.customMenu, v -> cfg.customMenu = v, List.of(), null));
		// the game's own HUD parts
		out.add(new Entry("scoreboard", "slashclient-hud.game.scoreboard", "game", "m-scoreboard", () -> cfg.scoreboard, v -> cfg.scoreboard = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.scoreboardScale, v -> cfg.scoreboardScale = v),
			new Slider("slashclient-hud.set.offset", -120f, 120f, 2f, "%.0f", () -> (float) cfg.scoreboardOffset, v -> cfg.scoreboardOffset = Math.round(v)),
			new Toggle("slashclient-hud.game.numbers", () -> cfg.scoreboardNumbers, v -> cfg.scoreboardNumbers = v)), null));
		out.add(new Entry("bossbar", "slashclient-hud.game.bossbar", "game", "m-bossbar", () -> cfg.bossBar, v -> cfg.bossBar = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.bossBarScale, v -> cfg.bossBarScale = v),
			new Slider("slashclient-hud.set.offset", 0f, 120f, 2f, "%.0f", () -> (float) cfg.bossBarOffset, v -> cfg.bossBarOffset = Math.round(v))), null));
		out.add(new Entry("tablist", "slashclient-hud.game.tablist", "game", "m-tablist", null, null, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.tabScale, v -> cfg.tabScale = v),
			new Toggle("slashclient-hud.game.numericPing", () -> cfg.tabNumericPing, v -> cfg.tabNumericPing = v)), null));
		out.add(new Entry("titles", "slashclient-hud.game.titles", "game", "m-titles", () -> cfg.titles, v -> cfg.titles = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.titleScale, v -> cfg.titleScale = v)), null));
		out.add(new Entry("nametag", "slashclient-hud.game.nametag", "game", "m-nametag", () -> cfg.ownNametag, v -> cfg.ownNametag = v, List.of(), null));
		out.add(new Entry("chatTimestamps", "slashclient-hud.chatTimestamps", "chat", "m-chattimestamps", () -> cfg.chatTimestamps, v -> cfg.chatTimestamps = v, List.of(), null));
		out.add(new Entry("chatTabs", "slashclient-hud.chat.tabs", "chat", "m-chattabs", null, null, List.of(), openChatTabs));
		return out;
	}
}
