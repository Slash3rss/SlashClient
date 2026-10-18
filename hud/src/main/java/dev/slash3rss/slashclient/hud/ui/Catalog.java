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
		Map.entry("memory", "hud"), Map.entry("cpu", "hud"), Map.entry("gpu", "hud"), Map.entry("tps", "hud"), Map.entry("network", "hud"),
		Map.entry("fpsgraph", "hud"), Map.entry("friends", "hud"), Map.entry("compass", "world"), Map.entry("sky", "world"), Map.entry("elytra", "world"),
		Map.entry("block", "world"), Map.entry("durability", "combat"), Map.entry("ammo", "combat"), Map.entry("kd", "combat"), Map.entry("hits", "combat"), Map.entry("session", "hud"), Map.entry("biome", "world"), Map.entry("daytime", "world"),
		Map.entry("light", "world"), Map.entry("saturation", "world"), Map.entry("movement", "world"), Map.entry("combo", "combat"),
		Map.entry("reach", "combat"), Map.entry("target", "combat"), Map.entry("armor", "combat"), Map.entry("effects", "combat"),
		Map.entry("items", "combat"), Map.entry("keystrokes", "combat"), Map.entry("dungeonmap", "world"));

	static final int[] COLORS = { 0xFFFFFFFF, 0xFF60A5FA, 0xFF4ADE80, 0xFF55FFFF, 0xFFFACC15, 0xFFF87171, 0xFFA855F7, 0xFFFF55FF };

	/** Switching on asks first (once); switching off is at once. */
	private static void risky(boolean on, Runnable apply) {
		if (on) dev.slash3rss.slashclient.hud.Assist.enableRisky(apply);
		else apply.run();
	}

	public static List<Entry> entries(Runnable openChatTabs) {
		HudConfig cfg = SlashHud.config;
		List<Entry> out = new ArrayList<>();
		for (var m : SlashHud.modules()) {
			// the game's parts have their own cards (below)
			if (m instanceof dev.slash3rss.slashclient.hud.GameParts.Part) continue;
			HudConfig.Placement p = cfg.placement(m.id());
			List<Setting> settings = new ArrayList<>(List.of(
				new Slider("slashclient-hud.set.scale", 0.5f, 2f, 0.05f, "%.2f×", p::scale, v -> p.scale = v),
				new Toggle("slashclient-hud.background", () -> p.background(cfg), v -> p.background = v),
				new Slider("slashclient-hud.set.opacity", 0f, 100f, 5f, "%.0f%%", () -> (float) p.opacity(), v -> p.opacity = Math.round(v)),
				new Toggle("slashclient-hud.set.outline", () -> p.outline, v -> p.outline = v),
				new Toggle("slashclient-hud.set.ownColor", () -> p.color != null, v -> p.color = v ? cfg.textColor : null),
				new Colors("slashclient-hud.textColor", COLORS, () -> p.textColor(cfg), v -> p.color = v),
				new Toggle("slashclient-hud.shadow", () -> p.shadow(cfg), v -> p.shadow = v)));
			// options of single modules
			switch (m.id()) {
				case "clock" -> {
					settings.add(new Toggle("slashclient-hud.set.clockSeconds", () -> cfg.clockSeconds, v -> cfg.clockSeconds = v));
					settings.add(new Toggle("slashclient-hud.set.clock12h", () -> cfg.clock12h, v -> cfg.clock12h = v));
				}
				case "coords" -> {
					settings.add(new Slider("slashclient-hud.set.coordsDecimals", 0f, 2f, 1f, "%.0f", () -> (float) cfg.coordsDecimals, v -> cfg.coordsDecimals = Math.round(v)));
					settings.add(new Toggle("slashclient-hud.set.coordsFacing", () -> cfg.coordsFacing, v -> cfg.coordsFacing = v));
				}
				case "fps" -> settings.add(new Toggle("slashclient-hud.set.fpsColored", () -> cfg.fpsColored, v -> cfg.fpsColored = v));
				default -> {}
			}
			if (m.id().equals("effects")) settings.add(new Toggle("slashclient-hud.effectIcons", () -> cfg.effectIcons, v -> cfg.effectIcons = v));
			out.add(new Entry(m.id(), "slashclient-hud.module." + m.id(), MODULE_CATEGORIES.getOrDefault(m.id(), "hud"),
				"m-" + m.id().toLowerCase(java.util.Locale.ROOT), () -> p.enabled, v -> p.enabled = v, settings, null));
		}
		out.add(new Entry("zoom", "slashclient-hud.zoom", "extras", "m-zoom", () -> cfg.zoom, v -> cfg.zoom = v, List.of(
			new Slider("slashclient-hud.set.zoomFactor", 2f, 12f, 0.5f, "%.1f×", () -> cfg.zoomFactor, v -> cfg.zoomFactor = v),
			new Toggle("slashclient-hud.zoomSmooth", () -> cfg.zoomSmooth, v -> cfg.zoomSmooth = v),
			new Toggle("slashclient-hud.zoomToggle", () -> cfg.zoomToggle, v -> cfg.zoomToggle = v),
			new Toggle("slashclient-hud.zoomCinematic", () -> cfg.zoomCinematic, v -> cfg.zoomCinematic = v),
			new Toggle("slashclient-hud.zoomRemember", () -> cfg.zoomRemember, v -> cfg.zoomRemember = v)), null));
		out.add(new Entry("dropGuard", "slashclient-hud.dropGuard", "combat", "m-dropguard", () -> cfg.dropGuard, v -> cfg.dropGuard = v, List.of(), null));
		out.add(new Entry("damageNumbers", "slashclient-hud.damageNumbers", "combat", "m-damage", () -> cfg.damageNumbers, v -> cfg.damageNumbers = v, List.of(), null));
		out.add(new Entry("tntTimer", "slashclient-hud.tntTimer", "world", "m-tnt", () -> cfg.tntTimer, v -> cfg.tntTimer = v, List.of(), null));
		out.add(new Entry("nickHider", "slashclient-hud.nickHider", "extras", "m-nickhider", () -> cfg.nickHider, v -> cfg.nickHider = v, List.of(
			new Choice("slashclient-hud.nickHider.as", new String[] { "you", "player", "hidden", "stars" }, "slashclient-hud.nickHider.alias.",
				() -> cfg.nickAlias, v -> cfg.nickAlias = v)), null));
		out.add(new Entry("keybinds", "slashclient-hud.keybinds", "extras", "m-keybinds", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.KeybindsScreen(dev.slash3rss.slashclient.hud.Compat.screen(mc)));
		}));
		out.add(new Entry("reconnect", "slashclient-hud.reconnectButton", "extras", "m-reconnect", () -> cfg.reconnect, v -> cfg.reconnect = v, List.of(), null));
		out.add(new Entry("fullbright", "slashclient-hud.fullbright", "extras", "m-fullbright", () -> cfg.fullbright, v -> cfg.fullbright = v, List.of(), null));
		out.add(new Entry("lowFire", "slashclient-hud.lowFire", "extras", "m-lowfire", () -> cfg.lowFire, v -> cfg.lowFire = v, List.of(), null));
		out.add(new Entry("crosshair", "slashclient-hud.crosshair", "extras", "m-crosshair", () -> !"vanilla".equals(cfg.crosshair),
			v -> {
				// switched back on, it is the crosshair it was before
				if (!v && !"vanilla".equals(cfg.crosshair)) cfg.crosshairLast = cfg.crosshair;
				cfg.crosshair = v ? ("vanilla".equals(cfg.crosshair) ? cfg.crosshairLast : cfg.crosshair) : "vanilla";
			}, List.of(
			new Choice("slashclient-hud.set.shape", dev.slash3rss.slashclient.hud.Crosshair.PRESETS, "slashclient-hud.crosshair.", () -> cfg.crosshair, v -> cfg.crosshair = v),
			new Colors("slashclient-hud.crosshairColor", COLORS, () -> cfg.crosshairColor, v -> cfg.crosshairColor = v),
			new Slider("slashclient-hud.set.size", 1f, 8f, 1f, "%.0f", () -> (float) cfg.crosshairSize, v -> cfg.crosshairSize = Math.round(v)),
			new Slider("slashclient-hud.set.gap", 0f, 5f, 1f, "%.0f", () -> (float) cfg.crosshairGap, v -> cfg.crosshairGap = Math.round(v)),
			new Toggle("slashclient-hud.crosshair.outline", () -> cfg.crosshairOutline, v -> cfg.crosshairOutline = v)), null));
		out.add(new Entry("appearance", "slashclient-hud.set.appearance", "extras", "m-appearance", null, null, List.of(
			new Colors("slashclient-hud.textColor", COLORS, () -> cfg.textColor, v -> cfg.textColor = v),
			new Toggle("slashclient-hud.shadow", () -> cfg.textShadow, v -> cfg.textShadow = v),
			new Toggle("slashclient-hud.set.backgroundAll", () -> cfg.background, v -> cfg.background = v)), null));
		out.add(new Entry("badges", "slashclient-hud.set.badges", "extras", "m-badges", () -> cfg.badges, v -> cfg.badges = v, List.of(), null));
		out.add(new Entry("menu", "slashclient-hud.set.menu", "extras", "m-menu", () -> cfg.customMenu, v -> cfg.customMenu = v, List.of(), null));
		out.add(new Entry("pause", "slashclient-hud.set.pause", "extras", "m-pause", () -> cfg.customPause, v -> cfg.customPause = v, List.of(), null));
		var options = net.minecraft.client.Minecraft.getInstance().options;
		out.add(new Entry("toggleSprint", "slashclient-hud.extra.toggleSprint", "extras", "m-togglesprint", () -> options.toggleSprint().get(), v -> {
			options.toggleSprint().set(v);
			options.save();
		}, List.of(new Toggle("slashclient-hud.extra.toggleSneak", () -> options.toggleCrouch().get(), v -> {
			options.toggleCrouch().set(v);
			options.save();
		})), null));
		out.add(new Entry("time", "slashclient-hud.extra.time", "world", "m-time", () -> cfg.timeChanger, v -> cfg.timeChanger = v, List.of(
			new Choice("slashclient-hud.extra.timeOfDay", new String[] { "1000", "6000", "12500", "18000" }, "slashclient-hud.extra.time.",
				() -> String.valueOf(cfg.fixedTime), v -> cfg.fixedTime = Integer.parseInt(v))), null));
		out.add(new Entry("freelook", "slashclient-hud.extra.freelook", "extras", "m-freelook", () -> cfg.freelook, v -> cfg.freelook = v, List.of(), null));
		out.add(new Entry("waypoints", "slashclient-hud.extra.waypoints", "world", "m-waypoints", () -> cfg.waypoints, v -> cfg.waypoints = v, List.of(), null));
		out.add(new Entry("screenshot", "slashclient-hud.extra.screenshot", "extras", "m-screenshot", () -> cfg.screenshotClipboard, v -> cfg.screenshotClipboard = v, List.of(), null));
		out.add(new Entry("chatStack", "slashclient-hud.chat.stack", "chat", "m-chatstack", () -> cfg.chatStack, v -> cfg.chatStack = v, List.of(), null));
		out.add(new Entry("chatCopy", "slashclient-hud.chat.copy", "chat", "m-chatcopy", () -> cfg.chatCopy, v -> cfg.chatCopy = v, List.of(), null));
		out.add(new Entry("chatSearch", "slashclient-hud.chat.searchBox", "chat", "m-chatsearch", () -> cfg.chatSearch, v -> cfg.chatSearch = v, List.of(), null));
		// the game's own HUD parts
		// the game's own parts: moved in the editor (drag their boxes), shown, scaled
		HudConfig.Placement scoreboard = cfg.placement("scoreboard"), bossbar = cfg.placement("bossbar"), tablist = cfg.placement("tablist"), actionbar = cfg.placement("actionbar");
		out.add(new Entry("scoreboard", "slashclient-hud.game.scoreboard", "game", "m-scoreboard", () -> cfg.scoreboard && scoreboard.enabled, v -> cfg.scoreboard = scoreboard.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.scoreboardScale, v -> cfg.scoreboardScale = v),
			new Toggle("slashclient-hud.game.numbers", () -> cfg.scoreboardNumbers, v -> cfg.scoreboardNumbers = v)), null));
		out.add(new Entry("bossbar", "slashclient-hud.game.bossbar", "game", "m-bossbar", () -> cfg.bossBar && bossbar.enabled, v -> cfg.bossBar = bossbar.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.bossBarScale, v -> cfg.bossBarScale = v)), null));
		out.add(new Entry("tablist", "slashclient-hud.game.tablist", "game", "m-tablist", () -> tablist.enabled, v -> tablist.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.tabScale, v -> cfg.tabScale = v),
			new Toggle("slashclient-hud.game.numericPing", () -> cfg.tabNumericPing, v -> cfg.tabNumericPing = v)), null));
		//#if MC >= 1.20.2
		out.add(new Entry("actionbar", "slashclient-hud.game.actionbar", "game", "m-actionbar", () -> cfg.actionBar && actionbar.enabled, v -> cfg.actionBar = actionbar.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.actionBarScale, v -> cfg.actionBarScale = v)), null));
		//#endif
		out.add(new Entry("titles", "slashclient-hud.game.titles", "game", "m-titles", () -> cfg.titles, v -> cfg.titles = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.titleScale, v -> cfg.titleScale = v)), null));
		out.add(new Entry("nametag", "slashclient-hud.game.nametag", "game", "m-nametag", () -> cfg.ownNametag, v -> cfg.ownNametag = v, List.of(), null));
		out.add(new Entry("chatMentions", "slashclient-hud.chat.mentions", "chat", "m-mentions", () -> cfg.chatMentions, v -> cfg.chatMentions = v, List.of(), null));
		out.add(new Entry("chatTimestamps", "slashclient-hud.chatTimestamps", "chat", "m-chattimestamps", () -> cfg.chatTimestamps, v -> cfg.chatTimestamps = v, List.of(), null));
		// in a world it starts a run, in the menu it shows the last one
		out.add(new Entry("benchmark", "slashclient-hud.benchmark", "extras", "m-benchmark", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			if (mc.player != null) dev.slash3rss.slashclient.hud.Benchmark.start(mc);
			else mc.setScreenAndShow(dev.slash3rss.slashclient.hud.BenchmarkScreen.latest());
		}));
		// the emote wheel (key N): in a world it opens at once
		out.add(new Entry("emotes", "slashclient-hud.emote", "extras", "m-emotes", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			if (mc.player != null) mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.EmoteScreen(dev.slash3rss.slashclient.hud.Cosmetics.emoteKey()));
		}));
		// clips: the last seconds of the game, saved with F8
		out.add(new Entry("clips", "slashclient-hud.clips", "extras", "m-clips", () -> cfg.clips, v -> cfg.clips = v, List.of(
			new Slider("slashclient-hud.clips.length", 10f, 60f, 5f, "%.0f s", () -> (float) cfg.clipSeconds, v -> cfg.clipSeconds = Math.round(v))), null));
		// helpers; the automatic ones say first that servers may ban for them
		out.add(new Entry("autoClicker", "slashclient-hud.assist.autoClicker", "combat", "m-autoclicker", () -> cfg.autoClicker,
			v -> risky(v, () -> cfg.autoClicker = v), List.of(
			new Toggle("slashclient-hud.assist.left", () -> cfg.autoClickLeft, v -> cfg.autoClickLeft = v),
			new Toggle("slashclient-hud.assist.right", () -> cfg.autoClickRight, v -> cfg.autoClickRight = v),
			new Slider("slashclient-hud.assist.cpsMin", 1f, 20f, 1f, "%.0f CPS", () -> (float) cfg.cpsMin, v -> cfg.cpsMin = Math.round(v)),
			new Slider("slashclient-hud.assist.cpsMax", 1f, 20f, 1f, "%.0f CPS", () -> (float) cfg.cpsMax, v -> cfg.cpsMax = Math.round(v)),
			new Toggle("slashclient-hud.assist.cooldown", () -> cfg.autoClickCooldown, v -> cfg.autoClickCooldown = v),
			new Toggle("slashclient-hud.assist.mobs", () -> cfg.autoClickMobs, v -> cfg.autoClickMobs = v),
			new Toggle("slashclient-hud.assist.players", () -> cfg.autoClickPlayers, v -> cfg.autoClickPlayers = v)), null));
		out.add(new Entry("autoTool", "slashclient-hud.assist.autoTool", "world", "m-autotool", () -> cfg.autoTool,
			v -> risky(v, () -> cfg.autoTool = v), List.of(
			new Toggle("slashclient-hud.assist.restore", () -> cfg.autoToolRestore, v -> cfg.autoToolRestore = v)), null));
		out.add(new Entry("autoRefill", "slashclient-hud.assist.autoRefill", "world", "m-autorefill", () -> cfg.autoRefill,
			v -> risky(v, () -> cfg.autoRefill = v), List.of(), null));
		// holding a button is set up with keys of its own, in the game's controls
		out.add(new Entry("holdKeys", "slashclient-hud.assist.holdKeys", "extras", "m-holdkeys", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.setScreenAndShow(new net.minecraft.client.gui.screens.options.controls.KeyBindsScreen(dev.slash3rss.slashclient.hud.Compat.screen(mc), mc.options));
		}));
		out.add(new Entry("toolWarning", "slashclient-hud.assist.toolWarning", "combat", "m-toolwarning", () -> cfg.toolWarning, v -> cfg.toolWarning = v, List.of(
			new Slider("slashclient-hud.assist.toolWarningAt", 1f, 30f, 1f, "%.0f%%", () -> (float) cfg.toolWarningPercent, v -> cfg.toolWarningPercent = Math.round(v))), null));
		out.add(new Entry("mouseTweaks", "slashclient-hud.extra.mouseTweaks", "extras", "m-mousetweaks", () -> cfg.mouseTweaks, v -> cfg.mouseTweaks = v, List.of(), null));
		out.add(new Entry("compactHearts", "slashclient-hud.game.compactHearts", "game", "m-hearts", () -> cfg.compactHearts, v -> cfg.compactHearts = v, List.of(), null));
		out.add(new Entry("chatTabs", "slashclient-hud.chat.tabs", "chat", "m-chattabs", null, null, List.of(), openChatTabs));
		return out;
	}
}
