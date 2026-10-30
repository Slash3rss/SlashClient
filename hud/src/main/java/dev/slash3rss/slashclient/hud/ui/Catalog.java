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

	public static final String[] CATEGORIES = { "all", "hud", "combat", "world", "game", "extras", "skyup", "chat", "share" };

	/** One row in an entry's settings. */
	public sealed interface Setting permits Toggle, Slider, Choice, Colors, Text, Info, Note, Key {
		String labelKey();
	}

	public record Toggle(String labelKey, Supplier<Boolean> get, Consumer<Boolean> set) implements Setting {}

	/** A number between min and max, shown with `format` ("%.1f×", "%d", …). */
	public record Slider(String labelKey, float min, float max, float step, String format, Supplier<Float> get, Consumer<Float> set) implements Setting {}

	public record Choice(String labelKey, String[] values, String valueKeyPrefix, Supplier<String> get, Consumer<String> set) implements Setting {}

	public record Colors(String labelKey, int[] colors, Supplier<Integer> get, Consumer<Integer> set) implements Setting {}

	/** A line of text typed in (a channel's name, …); `hintKey` is shown while it is empty. */
	public record Text(String labelKey, String hintKey, int maxLength, Supplier<String> get, Consumer<String> set) implements Setting {}

	/** A note in the settings (how to link an account, …): `text` gives its translation key, asked each time it is drawn. */
	public record Info(String labelKey, Supplier<String> text) implements Setting {}
	/** A line (or a few) of explanation without controls; `args` fill the %s in its text. */
	public record Note(String labelKey, Supplier<Object[]> args) implements Setting {}
	/**
	 * A key of the game's controls, by its name ("key.slashclient-hud.zoom"): set right on the module's page.
	 * It is the game's own key, so the Controls screen and SlashClient's keys window show the same one.
	 */
	public record Key(String labelKey) implements Setting {}

	/** The keys each card works with, shown first on its page (only those this version of the game has). */
	private static final Map<String, String[]> ENTRY_KEYS = Map.ofEntries(
		Map.entry("zoom", new String[] { "key.slashclient-hud.zoom" }),
		Map.entry("fullbright", new String[] { "key.slashclient-hud.fullbright" }),
		Map.entry("friends", new String[] { "key.slashclient-hud.friends" }),
		Map.entry("freelook", new String[] { "key.slashclient-hud.freelook" }),
		Map.entry("waypoints", new String[] { "key.slashclient-hud.waypoints" }),
		Map.entry("worldMap", new String[] { "key.slashclient-hud.dungeonMap" }),
		Map.entry("dungeonmap", new String[] { "key.slashclient-hud.dungeonMap", "key.slashclient-hud.dungeonZoomIn", "key.slashclient-hud.dungeonZoomOut" }),
		Map.entry("skytasks", new String[] { "key.slashclient-hud.skyTasksTrack" }),
		Map.entry("skyDump", new String[] { "key.slashclient-hud.skyDump" }),
		Map.entry("clips", new String[] { "key.slashclient-hud.clip" }),
		Map.entry("replay", new String[] { "key.slashclient-hud.replay" }),
		Map.entry("emotes", new String[] { "key.slashclient-hud.emote" }),
		Map.entry("sprays", new String[] { "key.slashclient-hud.spray" }),
		Map.entry("lightOverlay", new String[] { "key.slashclient-hud.lightOverlay" }),
		Map.entry("cameraDistance", new String[] { "key.slashclient-hud.cameraDistance" }),
		Map.entry("autoClicker", new String[] { "key.slashclient-hud.autoClick" }),
		Map.entry("holdKeys", new String[] { "key.slashclient-hud.holdAttack", "key.slashclient-hud.holdUse" }),
		Map.entry("inventorySort", new String[] { "key.slashclient-hud.sort" }),
		Map.entry("slotLock", new String[] { "key.slashclient-hud.slotLock" }));

	/** The game's key with this name, or null when this version has none. */
	public static net.minecraft.client.KeyMapping keyMapping(String name) {
		for (var k : net.minecraft.client.Minecraft.getInstance().options.keyMappings) if (k.getName().equals(name)) return k;
		return null;
	}

	/**
	 * Sets the game's key and saves it to options.txt: the game's Controls, SlashClient's keys window
	 * and the module's page all show the new one at once.
	 */
	public static void setKey(net.minecraft.client.KeyMapping key, com.mojang.blaze3d.platform.InputConstants.Key to) {
		key.setKey(to);
		net.minecraft.client.KeyMapping.resetMapping();
		net.minecraft.client.Minecraft.getInstance().options.save();
	}

	/** The key a binding has now (its saved name read back: the field itself is private). */
	public static com.mojang.blaze3d.platform.InputConstants.Key keyOf(net.minecraft.client.KeyMapping key) {
		return com.mojang.blaze3d.platform.InputConstants.getKey(key.saveString());
	}

	/**
	 * The other bindings on the same key (of the game or any mod), for the warning under the key. The
	 * F3 shortcuts are left out: they only work with F3 held, so they do not get in the way.
	 */
	public static List<net.minecraft.client.KeyMapping> clashes(net.minecraft.client.KeyMapping key) {
		List<net.minecraft.client.KeyMapping> out = new ArrayList<>();
		if (key.isUnbound()) return out;
		for (var k : net.minecraft.client.Minecraft.getInstance().options.keyMappings)
			if (k != key && k.same(key) && !k.getName().startsWith("key.debug.")) out.add(k);
		return out;
	}

	/** The card with the rows of its keys added at the top of its settings. */
	private static Entry withKeys(Entry e) {
		String[] names = ENTRY_KEYS.get(e.id());
		if (names == null) return e;
		List<Setting> settings = new ArrayList<>();
		for (String name : names) if (keyMapping(name) != null) settings.add(new Key(name));
		settings.addAll(e.settings());
		return new Entry(e.id(), e.nameKey(), e.category(), e.icon(), e.get(), e.set(), settings, e.open());
	}

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
		Map.entry("reach", "combat"), Map.entry("target", "combat"), Map.entry("attackindicator", "combat"), Map.entry("armor", "combat"), Map.entry("effects", "combat"),
		Map.entry("items", "combat"), Map.entry("keystrokes", "combat"), Map.entry("dungeonmap", "skyup"), Map.entry("minimap", "world"), Map.entry("skytasks", "skyup"), Map.entry("skyfish", "skyup"), Map.entry("skycase", "skyup"), Map.entry("skywardrobe", "skyup"), Map.entry("skyxp", "skyup"), Map.entry("skyshaman", "skyup"), Map.entry("skyplan", "skyup"),
		Map.entry("twitchchat", "chat"), Map.entry("kickchat", "chat"), Map.entry("nethercoords", "world"));

	static final int[] COLORS = { 0xFFFFFFFF, 0xFF60A5FA, 0xFF4ADE80, 0xFF55FFFF, 0xFFFACC15, 0xFFF87171, 0xFFA855F7, 0xFFFF55FF };
	/** The block outline's colours: the game's black first. */
	static final int[] OUTLINE_COLORS = { 0xFF000000, 0xFFFFFFFF, 0xFF60A5FA, 0xFF4ADE80, 0xFF55FFFF, 0xFFFACC15, 0xFFF87171, 0xFFA855F7, 0xFFFF55FF };

	/** Switching on asks first (once); switching off is at once. */
	private static void risky(boolean on, Runnable apply) {
		if (on) dev.slash3rss.slashclient.hud.Assist.enableRisky(apply);
		else apply.run();
	}

	/** A stream chat's channel first (it is what the module needs), its own options after the usual ones. */
	private static void streamChat(List<Setting> settings, Supplier<dev.slash3rss.slashclient.hud.streams.StreamChatSettings> s, boolean kick) {
		// read through `s` each time: pasting a share code or a server's layout puts new settings in place
		settings.add(0, new Text("slashclient-hud.streams.channel", "slashclient-hud.streams.channelHint", 64, () -> s.get().channel, v -> s.get().channel = v));
		// Kick sometimes refuses the lookup of a channel's chat: its number can be typed here instead
		if (kick) settings.add(1, new Text("slashclient-hud.streams.chatroomId", "slashclient-hud.streams.chatroomHint", 12, () -> s.get().chatroomId,
			v -> s.get().chatroomId = v.replaceAll("[^0-9]", "")));
		settings.add(new Slider("slashclient-hud.streams.lines", 3f, 20f, 1f, "%.0f", () -> (float) s.get().lines, v -> s.get().lines = Math.round(v)));
		settings.add(new Slider("slashclient-hud.streams.width", 120f, 400f, 10f, "%.0f px", () -> (float) s.get().width, v -> s.get().width = Math.round(v)));
		settings.add(new Toggle("slashclient-hud.streams.badges", () -> s.get().badges, v -> s.get().badges = v));
		settings.add(new Toggle("slashclient-hud.streams.nameColors", () -> s.get().nameColors, v -> s.get().nameColors = v));
		settings.add(new Toggle("slashclient-hud.streams.fade", () -> s.get().fade, v -> s.get().fade = v));
	}

	/** Where a value's colour stops being green and where it turns red (the two may go either way: more FPS is better, more ping worse). */
	private static void thresholds(List<Setting> settings, float min, float max, float step, String format,
		Supplier<Integer> good, Consumer<Integer> setGood, Supplier<Integer> bad, Consumer<Integer> setBad) {
		settings.add(new Slider("slashclient-hud.set.gradeGood", min, max, step, format, () -> (float) good.get(), v -> setGood.accept(Math.round(v))));
		settings.add(new Slider("slashclient-hud.set.gradeBad", min, max, step, format, () -> (float) bad.get(), v -> setBad.accept(Math.round(v))));
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
				// its own corners, or the HUD-wide ones
				new Toggle("slashclient-hud.set.ownRadius", () -> p.radius != null, v -> p.radius = v ? cfg.cornerRadius : null),
				new Slider("slashclient-hud.set.radius", 0f, HudConfig.MAX_RADIUS, 1f, "%.0f px", () -> (float) p.radius(cfg), v -> p.radius = Math.round(v)),
				new Toggle("slashclient-hud.set.ownColor", () -> p.color != null, v -> p.color = v ? cfg.textColor : null),
				new Colors("slashclient-hud.textColor", COLORS, () -> p.textColor(cfg), v -> p.color = v),
				new Toggle("slashclient-hud.shadow", () -> p.shadow(cfg), v -> p.shadow = v)));
			// only what does something for it: a picture has no box, a module colouring its text itself takes no text colour
			java.util.Set<String> pointless = new java.util.HashSet<>();
			if (m.bare()) pointless.addAll(List.of("slashclient-hud.background", "slashclient-hud.set.opacity", "slashclient-hud.set.outline", "slashclient-hud.set.ownRadius", "slashclient-hud.set.radius"));
			if (!m.textColored()) pointless.addAll(List.of("slashclient-hud.set.ownColor", "slashclient-hud.textColor"));
			if (!m.shadowed()) pointless.add("slashclient-hud.shadow");
			settings.removeIf(s -> pointless.contains(s.labelKey()));
			// the look every module has: after the module's own options, which come first
			List<Setting> look = List.copyOf(settings);
			// options of single modules
			switch (m.id()) {
				case "clock" -> {
					settings.add(new Toggle("slashclient-hud.set.clockSeconds", () -> cfg.clockSeconds, v -> cfg.clockSeconds = v));
					settings.add(new Toggle("slashclient-hud.set.clock12h", () -> cfg.clock12h, v -> cfg.clock12h = v));
				}
				case "block" -> {
					settings.add(new Toggle("slashclient-hud.set.blockTool", () -> cfg.blockTool, v -> cfg.blockTool = v));
					settings.add(new Toggle("slashclient-hud.set.blockBestTool", () -> cfg.blockBestTool, v -> cfg.blockBestTool = v));
					settings.add(new Toggle("slashclient-hud.set.blockBreakBar", () -> cfg.blockBreakBar, v -> cfg.blockBreakBar = v));
					settings.add(new Toggle("slashclient-hud.set.blockGrowth", () -> cfg.blockGrowth, v -> cfg.blockGrowth = v));
					settings.add(new Toggle("slashclient-hud.set.blockDetails", () -> cfg.blockDetails, v -> cfg.blockDetails = v));
					settings.add(new Toggle("slashclient-hud.set.blockBees", () -> cfg.blockBees, v -> cfg.blockBees = v));
					settings.add(new Toggle("slashclient-hud.set.blockShelf", () -> cfg.blockShelf, v -> cfg.blockShelf = v));
					settings.add(new Toggle("slashclient-hud.set.blockFrames", () -> cfg.blockFrames, v -> cfg.blockFrames = v));
					settings.add(new Toggle("slashclient-hud.set.blockPower", () -> cfg.blockPower, v -> cfg.blockPower = v));
					settings.add(new Toggle("slashclient-hud.set.blockCoords", () -> cfg.blockCoords, v -> cfg.blockCoords = v));
					settings.add(new Toggle("slashclient-hud.set.blockLight", () -> cfg.blockLight, v -> cfg.blockLight = v));
					settings.add(new Toggle("slashclient-hud.set.blockHardness", () -> cfg.blockHardness, v -> cfg.blockHardness = v));
					settings.add(new Toggle("slashclient-hud.set.blockId", () -> cfg.blockId, v -> cfg.blockId = v));
					settings.add(new Toggle("slashclient-hud.set.blockState", () -> cfg.blockState, v -> cfg.blockState = v));
				}
				case "coords" -> {
					settings.add(new Slider("slashclient-hud.set.coordsDecimals", 0f, 2f, 1f, "%.0f", () -> (float) cfg.coordsDecimals, v -> cfg.coordsDecimals = Math.round(v)));
					settings.add(new Toggle("slashclient-hud.set.coordsY", () -> cfg.coordsY, v -> cfg.coordsY = v));
					settings.add(new Toggle("slashclient-hud.set.coordsFacing", () -> cfg.coordsFacing, v -> cfg.coordsFacing = v));
					settings.add(new Toggle("slashclient-hud.set.coordsOneLine", () -> cfg.coordsOneLine, v -> cfg.coordsOneLine = v));
				}
				case "dungeonmap" -> {
					settings.add(new Toggle("slashclient-hud.dungeon.plan", () -> cfg.dungeonPlan, v -> cfg.dungeonPlan = v));
					settings.add(new Toggle("slashclient-hud.dungeon.blockColors", () -> cfg.dungeonBlockColors, v -> cfg.dungeonBlockColors = v));
					settings.add(new Slider("slashclient-hud.dungeon.size", 80f, 240f, 10f, "%.0f px", () -> (float) cfg.dungeonSize, v -> cfg.dungeonSize = Math.round(v)));
					settings.add(new Slider("slashclient-hud.dungeon.scanRange", dev.slash3rss.slashclient.hud.skyup.DungeonMap.MIN_RANGE, dev.slash3rss.slashclient.hud.skyup.DungeonMap.MAX_RANGE, 8f, "%.0f",
						() -> (float) cfg.dungeonScanRange, v -> cfg.dungeonScanRange = Math.round(v)));
					settings.add(new Toggle("slashclient-hud.dungeon.title", () -> cfg.dungeonTitle, v -> cfg.dungeonTitle = v));
					settings.add(new Toggle("slashclient-hud.dungeon.progress", () -> cfg.dungeonProgress, v -> cfg.dungeonProgress = v));
					settings.add(new Choice("slashclient-hud.set.shape", new String[] { "square", "circle" }, "slashclient-hud.dungeon.shape.",
						() -> cfg.dungeonShape, v -> cfg.dungeonShape = v));
					settings.add(new Slider("slashclient-hud.dungeon.zoom", 1f, 4f, 0.25f, "%.2f×", () -> cfg.dungeonZoom, v -> cfg.dungeonZoom = v));
					settings.add(new Toggle("slashclient-hud.dungeon.follow", () -> cfg.dungeonFollow, v -> cfg.dungeonFollow = v));
					settings.add(new Toggle("slashclient-hud.dungeon.selfHead", () -> cfg.dungeonSelfHead, v -> cfg.dungeonSelfHead = v));
					settings.add(new Toggle("slashclient-hud.dungeon.startArrow", () -> cfg.dungeonStartArrow, v -> cfg.dungeonStartArrow = v));
					settings.add(new Toggle("slashclient-hud.dungeon.players", () -> cfg.dungeonPlayers, v -> cfg.dungeonPlayers = v));
					settings.add(new Toggle("slashclient-hud.dungeon.mobs", () -> cfg.dungeonMobs, v -> cfg.dungeonMobs = v));
					// each mob class its own look
					String[] styles = dev.slash3rss.slashclient.hud.skyup.DungeonMap.MOB_STYLES;
					settings.add(new Choice("slashclient-hud.dungeon.mobNormal", styles, "slashclient-hud.dungeon.mobStyle.", () -> cfg.dungeonMobNormal, v -> cfg.dungeonMobNormal = v));
					settings.add(new Choice("slashclient-hud.dungeon.mobElite", styles, "slashclient-hud.dungeon.mobStyle.", () -> cfg.dungeonMobElite, v -> cfg.dungeonMobElite = v));
					settings.add(new Choice("slashclient-hud.dungeon.mobBoss", styles, "slashclient-hud.dungeon.mobStyle.", () -> cfg.dungeonMobBoss, v -> cfg.dungeonMobBoss = v));
					settings.add(new Choice("slashclient-hud.dungeon.mobMinion", styles, "slashclient-hud.dungeon.mobStyle.", () -> cfg.dungeonMobMinion, v -> cfg.dungeonMobMinion = v));
					settings.add(new Choice("slashclient-hud.dungeon.mobOther", styles, "slashclient-hud.dungeon.mobStyle.", () -> cfg.dungeonMobOther, v -> cfg.dungeonMobOther = v));
					settings.add(new Toggle("slashclient-hud.dungeon.containers", () -> cfg.dungeonContainers, v -> cfg.dungeonContainers = v));
					settings.add(new Toggle("slashclient-hud.dungeon.counters", () -> cfg.dungeonCounters, v -> cfg.dungeonCounters = v));
					settings.add(new Toggle("slashclient-hud.dungeon.loot.chest", () -> cfg.dungeonChests, v -> cfg.dungeonChests = v));
					settings.add(new Toggle("slashclient-hud.dungeon.loot.barrel", () -> cfg.dungeonBarrels, v -> cfg.dungeonBarrels = v));
					settings.add(new Toggle("slashclient-hud.dungeon.loot.pot", () -> cfg.dungeonPots, v -> cfg.dungeonPots = v));
					settings.add(new Toggle("slashclient-hud.dungeon.loot.flowerPot", () -> cfg.dungeonFlowerPots, v -> cfg.dungeonFlowerPots = v));
					settings.add(new Toggle("slashclient-hud.dungeon.loot.ore", () -> cfg.dungeonOres, v -> cfg.dungeonOres = v));
					// which ores, one by one
					for (String ore : dev.slash3rss.slashclient.hud.skyup.DungeonRooms.ORES) {
						settings.add(new Toggle("slashclient-hud.dungeon.ore." + ore, () -> dev.slash3rss.slashclient.hud.skyup.DungeonRooms.oreCounted(ore),
							v -> dev.slash3rss.slashclient.hud.skyup.DungeonRooms.countOre(ore, v)));
					}
					settings.add(new Toggle("slashclient-hud.dungeon.cleared", () -> cfg.dungeonCleared, v -> cfg.dungeonCleared = v));
					settings.add(new Toggle("slashclient-hud.dungeon.noSpawner", () -> cfg.dungeonNoSpawner, v -> cfg.dungeonNoSpawner = v));
					// switched on, it holds the height the player stands at now; the slider moves it
					settings.add(new Toggle("slashclient-hud.dungeon.fixedY", () -> cfg.dungeonFixedY, v -> {
						var player = net.minecraft.client.Minecraft.getInstance().player;
						if (v && player != null) cfg.dungeonY = player.getBlockY();
						cfg.dungeonFixedY = v;
					}));
					settings.add(new Slider("slashclient-hud.dungeon.y", -64f, 320f, 1f, "Y %.0f", () -> (float) cfg.dungeonY, v -> cfg.dungeonY = Math.round(v)));
				}
				case "minimap" -> {
					settings.add(new Slider("slashclient-hud.minimap.size", 64f, 200f, 8f, "%.0f px", () -> (float) cfg.minimapSize, v -> cfg.minimapSize = Math.round(v)));
					settings.add(new Slider("slashclient-hud.minimap.zoom", 0.5f, 4f, 0.5f, "%.1f×", () -> cfg.minimapZoom, v -> cfg.minimapZoom = v));
					settings.add(new Choice("slashclient-hud.set.shape", dev.slash3rss.slashclient.hud.map.Minimap.SHAPES, "slashclient-hud.dungeon.shape.",
						() -> cfg.minimapShape, v -> cfg.minimapShape = v));
					settings.add(new Toggle("slashclient-hud.minimap.rotate", () -> cfg.minimapRotate, v -> cfg.minimapRotate = v));
					settings.add(new Toggle("slashclient-hud.minimap.coords", () -> cfg.minimapCoords, v -> cfg.minimapCoords = v));
					settings.add(new Toggle("slashclient-hud.minimap.waypoints", () -> cfg.minimapWaypoints, v -> cfg.minimapWaypoints = v));
					settings.add(new Toggle("slashclient-hud.map.players", () -> cfg.mapPlayers, v -> cfg.mapPlayers = v));
					settings.add(new Toggle("slashclient-hud.map.hostile", () -> cfg.mapHostile, v -> cfg.mapHostile = v));
					settings.add(new Toggle("slashclient-hud.map.passive", () -> cfg.mapPassive, v -> cfg.mapPassive = v));
				}
				case "skytasks" -> {
					settings.add(new Slider("slashclient-hud.skyTasks.max", 1f, 10f, 1f, "%.0f", () -> (float) cfg.skyTasksMax, v -> cfg.skyTasksMax = Math.round(v)));
					settings.add(new Slider("slashclient-hud.skyTasks.width", 100f, 320f, 10f, "%.0f px", () -> (float) cfg.skyTasksWidth, v -> cfg.skyTasksWidth = Math.round(v)));
					settings.add(new Toggle("slashclient-hud.skyTasks.compact", () -> cfg.skyTasksCompact, v -> cfg.skyTasksCompact = v));
					settings.add(new Toggle("slashclient-hud.skyTasks.scroll", () -> cfg.skyTasksScroll, v -> cfg.skyTasksScroll = v));
					settings.add(new Toggle("slashclient-hud.skyTasks.shaman", () -> cfg.skyTasksShaman, v -> cfg.skyTasksShaman = v));
					settings.add(new Choice("slashclient-hud.skyTasks.mark", HudConfig.SKY_TASKS_MARKS, "slashclient-hud.skyTasks.mark.", () -> cfg.skyTasksMark, v -> cfg.skyTasksMark = v));
					settings.add(new Toggle("slashclient-hud.skyTasks.hideDone", () -> cfg.skyTasksHideDone, v -> cfg.skyTasksHideDone = v));
					settings.add(new Toggle("slashclient-hud.skyTasks.rewards", () -> cfg.skyTasksRewards, v -> cfg.skyTasksRewards = v));
					settings.add(new Toggle("slashclient-hud.skyTasks.trackAll", () -> cfg.skyTasksTrackAll, v -> cfg.skyTasksTrackAll = v));
					settings.add(new Toggle("slashclient-hud.skyTasks.autoDaily", () -> cfg.skyTasksAutoDaily, v -> cfg.skyTasksAutoDaily = v));
					settings.add(new Toggle("slashclient-hud.skyTasks.tierCount", () -> cfg.skyTasksTierCount, v -> cfg.skyTasksTierCount = v));
					settings.add(new Toggle("slashclient-hud.skyTasks.joinHintSetting", () -> cfg.skyTasksJoinHint, v -> cfg.skyTasksJoinHint = v));
					settings.add(new Slider("slashclient-hud.skyTasks.dailyRemind", 0f, 120f, 5f, "%.0f min", () -> (float) cfg.skyDailyRemind, v -> cfg.skyDailyRemind = Math.round(v)));
					// the chat tabs' sounds ("default" the bell), heard when picked
					String[] sounds = java.util.Arrays.stream(dev.slash3rss.slashclient.hud.chat.ChatTabs.SOUNDS).map(s -> s.isEmpty() ? "default" : s).toArray(String[]::new);
					settings.add(new Choice("slashclient-hud.skyTasks.dailySound", sounds, "slashclient-hud.chat.sound.", () -> cfg.skyDailySound, v -> {
						cfg.skyDailySound = v;
						dev.slash3rss.slashclient.hud.chat.ChatTabs.playSound(net.minecraft.client.Minecraft.getInstance(), "default".equals(v) ? "" : v);
					}));
					settings.add(new Slider("slashclient-hud.skyTasks.bonusRemind", 0f, 240f, 15f, "%.0f min", () -> (float) cfg.skyBonusEvery, v -> cfg.skyBonusEvery = Math.round(v)));
				}
				case "skyfish" -> {
					settings.add(new Choice("slashclient-hud.skyFish.split", new String[] { "none", "size", "species", "quality" }, "slashclient-hud.skyFish.split.",
						() -> cfg.skyFishSplit, v -> cfg.skyFishSplit = v));
					settings.add(new Toggle("slashclient-hud.skyFish.weight", () -> cfg.skyFishWeight, v -> cfg.skyFishWeight = v));
					settings.add(new Toggle("slashclient-hud.skyFish.value", () -> cfg.skyFishValue, v -> cfg.skyFishValue = v));
					settings.add(new Slider("slashclient-hud.skyFish.pause", 1f, 60f, 1f, "%.0f min", () -> (float) cfg.skyFishPause, v -> cfg.skyFishPause = Math.round(v)));
				}
				case "skyplan" -> {
					settings.add(new Slider("slashclient-hud.skyPlan.rows", 1f, 8f, 1f, "%.0f", () -> (float) cfg.skyPlanRows, v -> cfg.skyPlanRows = Math.round(v)));
					settings.add(new Slider("slashclient-hud.skyPlan.remind", 0f, 60f, 1f, "%.0f min", () -> (float) cfg.skyPlanRemind, v -> cfg.skyPlanRemind = Math.round(v)));
					// which kinds the banner is for
					settings.add(new Toggle("slashclient-hud.skyPlan.events", () -> cfg.skyPlanEvents, v -> cfg.skyPlanEvents = v));
					settings.add(new Toggle("slashclient-hud.skyPlan.fishing", () -> cfg.skyPlanFishing, v -> cfg.skyPlanFishing = v));
					settings.add(new Toggle("slashclient-hud.skyPlan.boss", () -> cfg.skyPlanBoss, v -> cfg.skyPlanBoss = v));
					String[] sounds = java.util.Arrays.stream(dev.slash3rss.slashclient.hud.chat.ChatTabs.SOUNDS).map(s -> s.isEmpty() ? "default" : s).toArray(String[]::new);
					settings.add(new Choice("slashclient-hud.skyPlan.sound", sounds, "slashclient-hud.chat.sound.", () -> cfg.skyPlanSound, v -> {
						cfg.skyPlanSound = v;
						dev.slash3rss.slashclient.hud.chat.ChatTabs.playSound(net.minecraft.client.Minecraft.getInstance(), "default".equals(v) ? "" : v);
					}));
				}
				case "skycase" -> {
					settings.add(new Choice("slashclient-hud.skyCase.layout", HudConfig.SKY_CASE_LAYOUTS, "slashclient-hud.skyCase.layout.",
						() -> cfg.skyCaseLayout, v -> cfg.skyCaseLayout = v));
					settings.add(new Choice("slashclient-hud.skyCase.recentShow", HudConfig.SKY_CASE_RECENT, "slashclient-hud.skyCase.recentShow.",
						() -> cfg.skyCaseRecentShow, v -> cfg.skyCaseRecentShow = v));
					settings.add(new Slider("slashclient-hud.skyCase.rows", 1f, 10f, 1f, "%.0f", () -> (float) cfg.skyCaseRows, v -> cfg.skyCaseRows = Math.round(v)));
					settings.add(new Toggle("slashclient-hud.skyCase.sum", () -> cfg.skyCaseSum, v -> cfg.skyCaseSum = v));
					settings.add(new Toggle("slashclient-hud.skyCase.newDropSetting", () -> cfg.skyCaseNewDrop, v -> cfg.skyCaseNewDrop = v));
					settings.add(new Slider("slashclient-hud.skyCase.window", 10f, 300f, 10f, "%.0f s", () -> (float) cfg.skyCaseWindow, v -> cfg.skyCaseWindow = Math.round(v)));
				}
				case "skywardrobe" -> {
					settings.add(new Toggle("slashclient-hud.skyWardrobe.names", () -> cfg.skyWardrobeNames, v -> cfg.skyWardrobeNames = v));
					settings.add(new Toggle("slashclient-hud.skyWardrobe.status", () -> cfg.skyWardrobeStatus, v -> cfg.skyWardrobeStatus = v));
				}
				case "fps" -> {
					settings.add(new Toggle("slashclient-hud.set.fpsColored", () -> cfg.fpsColored, v -> cfg.fpsColored = v));
					thresholds(settings, 10f, 240f, 5f, "%.0f FPS", () -> cfg.fpsGood, v -> cfg.fpsGood = v, () -> cfg.fpsBad, v -> cfg.fpsBad = v);
				}
				case "ping" -> thresholds(settings, 10f, 1000f, 10f, "%.0f ms", () -> cfg.pingGood, v -> cfg.pingGood = v, () -> cfg.pingBad, v -> cfg.pingBad = v);
				case "memory" -> thresholds(settings, 5f, 100f, 5f, "%.0f%%", () -> cfg.memoryGood, v -> cfg.memoryGood = v, () -> cfg.memoryBad, v -> cfg.memoryBad = v);
				case "cpu" -> thresholds(settings, 5f, 100f, 5f, "%.0f%%", () -> cfg.cpuGood, v -> cfg.cpuGood = v, () -> cfg.cpuBad, v -> cfg.cpuBad = v);
				case "gpu" -> thresholds(settings, 5f, 100f, 5f, "%.0f%%", () -> cfg.gpuGood, v -> cfg.gpuGood = v, () -> cfg.gpuBad, v -> cfg.gpuBad = v);
				case "speed" -> settings.add(new Slider("slashclient-hud.set.coordsDecimals", 0f, 3f, 1f, "%.0f", () -> (float) cfg.speedDecimals, v -> cfg.speedDecimals = Math.round(v)));
				case "armor" -> {
					settings.add(new Choice("slashclient-hud.set.armorDurability", HudConfig.ARMOR_DURABILITY, "slashclient-hud.armorDurability.", () -> cfg.armorDurability, v -> cfg.armorDurability = v));
					settings.add(new Toggle("slashclient-hud.set.armorHorizontal", () -> cfg.armorHorizontal, v -> cfg.armorHorizontal = v));
					settings.add(new Toggle("slashclient-hud.set.armorHand", () -> cfg.armorHand, v -> cfg.armorHand = v));
				}
				case "durability" -> {
					settings.add(new Choice("slashclient-hud.set.durabilityFormat", HudConfig.DURABILITY_FORMATS, "slashclient-hud.durabilityFormat.", () -> cfg.durabilityFormat, v -> cfg.durabilityFormat = v));
					settings.add(new Toggle("slashclient-hud.set.durabilityBar", () -> cfg.durabilityBar, v -> cfg.durabilityBar = v));
					settings.add(new Slider("slashclient-hud.set.durabilityWarn", 0f, 50f, 5f, "%.0f%%", () -> (float) cfg.durabilityWarn, v -> cfg.durabilityWarn = Math.round(v)));
				}
				case "keystrokes" -> {
					settings.add(new Colors("slashclient-hud.set.keystrokesPressed", OUTLINE_COLORS, () -> cfg.keystrokesPressed, v -> cfg.keystrokesPressed = v));
					settings.add(new Toggle("slashclient-hud.set.keystrokesMouse", () -> cfg.keystrokesMouse, v -> cfg.keystrokesMouse = v));
					settings.add(new Toggle("slashclient-hud.set.keystrokesCps", () -> cfg.keystrokesCps, v -> cfg.keystrokesCps = v));
					settings.add(new Toggle("slashclient-hud.set.keystrokesSpace", () -> cfg.keystrokesSpace, v -> cfg.keystrokesSpace = v));
				}
				case "target" -> {
					settings.add(new Toggle("slashclient-hud.set.targetBar", () -> cfg.targetBar, v -> cfg.targetBar = v));
					settings.add(new Toggle("slashclient-hud.set.targetDistance", () -> cfg.targetDistance, v -> cfg.targetDistance = v));
				}
				case "compass" -> settings.add(new Toggle("slashclient-hud.set.compassDegrees", () -> cfg.compassDegrees, v -> cfg.compassDegrees = v));
				case "friends" -> settings.add(new Slider("slashclient-hud.set.friendsRows", 1f, 15f, 1f, "%.0f", () -> (float) cfg.friendsRows, v -> cfg.friendsRows = Math.round(v)));
				case "inventory" -> settings.add(new Toggle("slashclient-hud.set.inventoryHotbar", () -> cfg.inventoryHotbar, v -> cfg.inventoryHotbar = v));
				case "twitchchat", "kickchat" -> streamChat(settings, m.id().equals("kickchat") ? () -> cfg.kickChat : () -> cfg.twitchChat, m.id().equals("kickchat"));
				case "spotify" -> dev.slash3rss.slashclient.hud.NowPlayingModule.settings(settings, () -> SlashHud.config.spotify);
				default -> {}
			}
			if (m.id().equals("effects")) settings.add(new Toggle("slashclient-hud.effectIcons", () -> cfg.effectIcons, v -> cfg.effectIcons = v));
			settings.removeIf(look::contains);
			settings.addAll(look);
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
		// every key (the game's and the mods') saved under a name and put back with a click
		out.add(new Entry("keyPresets", "slashclient-hud.keyPresets", "extras", "m-keypresets", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.KeyPresetsScreen(dev.slash3rss.slashclient.hud.Compat.screen(mc)));
		}));
		// SkyUp's dungeon loot not taken yet, outlined in the world (only in a dungeon); through walls only when switched on
		int[] lootColors = dev.slash3rss.slashclient.hud.skyup.LootHighlight.COLORS;
		out.add(new Entry("lootHighlight", "slashclient-hud.lootHighlight", "skyup", "m-loothighlight", () -> cfg.lootHighlight, v -> cfg.lootHighlight = v, List.of(
			new Toggle("slashclient-hud.dungeon.loot.chest", () -> cfg.lootChests, v -> cfg.lootChests = v),
			new Colors("slashclient-hud.lootHighlight.chestColor", lootColors, () -> cfg.lootChestColor, v -> cfg.lootChestColor = v),
			new Toggle("slashclient-hud.dungeon.loot.barrel", () -> cfg.lootBarrels, v -> cfg.lootBarrels = v),
			new Colors("slashclient-hud.lootHighlight.barrelColor", lootColors, () -> cfg.lootBarrelColor, v -> cfg.lootBarrelColor = v),
			new Toggle("slashclient-hud.dungeon.loot.pot", () -> cfg.lootPots, v -> cfg.lootPots = v),
			new Colors("slashclient-hud.lootHighlight.potColor", lootColors, () -> cfg.lootPotColor, v -> cfg.lootPotColor = v),
			new Toggle("slashclient-hud.dungeon.loot.flowerPot", () -> cfg.lootFlowerPots, v -> cfg.lootFlowerPots = v),
			new Colors("slashclient-hud.lootHighlight.flowerPotColor", lootColors, () -> cfg.lootFlowerPotColor, v -> cfg.lootFlowerPotColor = v),
			new Toggle("slashclient-hud.dungeon.loot.ore", () -> cfg.lootOres, v -> cfg.lootOres = v),
			new Colors("slashclient-hud.lootHighlight.oreColor", lootColors, () -> cfg.lootOreColor, v -> cfg.lootOreColor = v),
			new Toggle("slashclient-hud.lootHighlight.drops", () -> cfg.lootDrops, v -> cfg.lootDrops = v),
			new Toggle("slashclient-hud.lootHighlight.dropItemColors", () -> cfg.lootDropItemColors, v -> cfg.lootDropItemColors = v),
			new Colors("slashclient-hud.lootHighlight.dropColor", lootColors, () -> cfg.lootDropColor, v -> cfg.lootDropColor = v),
			new Toggle("slashclient-hud.lootHighlight.fill", () -> cfg.lootHighlightFill, v -> cfg.lootHighlightFill = v),
			new Toggle("slashclient-hud.lootHighlight.pulse", () -> cfg.lootHighlightPulse, v -> cfg.lootHighlightPulse = v),
			new Toggle("slashclient-hud.lootHighlight.walls", () -> cfg.lootHighlightWalls, v -> cfg.lootHighlightWalls = v),
			new Toggle("slashclient-hud.lootHighlight.limit", () -> cfg.lootHighlightLimit, v -> cfg.lootHighlightLimit = v),
			new Slider("slashclient-hud.lootHighlight.range", dev.slash3rss.slashclient.hud.skyup.LootHighlight.MIN_RANGE, dev.slash3rss.slashclient.hud.skyup.LootHighlight.MAX_RANGE, 4f, "%.0f",
				() -> (float) cfg.lootHighlightRange, v -> cfg.lootHighlightRange = Math.round(v))), null));
		// the XP calculator of slash3rss.dev
		out.add(new Entry("xpCalc", "slashclient-hud.xp.title", "extras", "m-xpcalc", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.XpCalcScreen(dev.slash3rss.slashclient.hud.Compat.screen(mc)));
		}));
		//#if MC >= 26.3
		// and its SkyUp edition: bottling with the tax, the mending assistant, the AFK countdown
		out.add(new Entry("skyXpCalc", "slashclient-hud.skyXp.title", "skyup", "m-skyxpcalc", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.skyup.SkyXpScreen(dev.slash3rss.slashclient.hud.Compat.screen(mc)));
		}));
		// SkyUp's pack in the player's own resource packs, kept up to date; switched on, the server does not ask
		out.add(new Entry("skyPack", "slashclient-hud.skyPack", "skyup", "skyup", () -> cfg.skyPackLocal, v -> cfg.skyPackLocal = v, List.of(
			new Note("slashclient-hud.skyPack.note", () -> new Object[0])), null));
		// the GUI dump for reports: what a server's window holds, saved to a file on its key
		out.add(new Entry("skyDump", "slashclient-hud.skyDump.title", "skyup", "m-skydump", () -> cfg.skyDump, v -> cfg.skyDump = v, List.of(
			new Note("slashclient-hud.skyDump.note", () -> new Object[0])), null));
		// every fish species: what was caught, the records, the fun facts
		out.add(new Entry("skyAtlas", "slashclient-hud.skyAtlas.title", "skyup", "m-fishatlas", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.skyup.SkyAtlasScreen(dev.slash3rss.slashclient.hud.Compat.screen(mc)));
		}));
		// SkyUp's wiki, read through the launcher
		out.add(new Entry("skyWiki", "slashclient-hud.skyWiki.title", "skyup", "m-skywiki", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.skyup.SkyWikiScreen(dev.slash3rss.slashclient.hud.Compat.screen(mc)));
		}));
		// SkyUp's cases in detail: every reward of each case, won or not
		out.add(new Entry("skyCaseStats", "slashclient-hud.skyCase.screen", "skyup", "m-skycase", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.skyup.SkyCaseScreen(dev.slash3rss.slashclient.hud.Compat.screen(mc)));
		}));
		//#endif
		out.add(new Entry("reconnect", "slashclient-hud.reconnectButton", "extras", "m-reconnect", () -> cfg.reconnect, v -> cfg.reconnect = v, List.of(), null));
		out.add(new Entry("sessionRenew", "slashclient-hud.sessionRenew", "extras", "m-accounts", () -> cfg.sessionRenew, v -> cfg.sessionRenew = v, List.of(), null));
		// each server in the list has its own mode (its edit screen); this one is for the rest
		out.add(new Entry("serverPacks", "slashclient-hud.serverPacks", "extras", "m-server", null, null, List.of(
			new Choice("slashclient-hud.serverPacks.default", dev.slash3rss.slashclient.hud.servers.ServerPacks.MODES, "slashclient-hud.serverPacks.choice.",
				() -> cfg.serverPackDefault, v -> cfg.serverPackDefault = v)), null));
		out.add(new Entry("fullbright", "slashclient-hud.fullbright", "extras", "m-fullbright", () -> cfg.fullbright, v -> cfg.fullbright = v, List.of(), null));
		out.add(new Entry("lowFire", "slashclient-hud.lowFire", "extras", "m-lowfire", () -> cfg.lowFire, v -> cfg.lowFire = v, List.of(), null));
		out.add(new Entry("blockOutline", "slashclient-hud.blockOutline", "extras", "m-block", () -> cfg.blockOutline, v -> cfg.blockOutline = v, List.of(
			new Colors("slashclient-hud.blockOutline.color", OUTLINE_COLORS, () -> cfg.blockOutlineColor, v -> cfg.blockOutlineColor = v),
			new Slider("slashclient-hud.blockOutline.opacity", 10f, 100f, 5f, "%.0f%%", () -> (float) cfg.blockOutlineOpacity, v -> cfg.blockOutlineOpacity = Math.round(v)),
			new Slider("slashclient-hud.blockOutline.width", 0.5f, 5f, 0.25f, "%.2f×", () -> cfg.blockOutlineWidth, v -> cfg.blockOutlineWidth = v)), null));
		out.add(new Entry("lowShield", "slashclient-hud.lowShield", "extras", "m-armor", () -> cfg.lowShield, v -> cfg.lowShield = v, List.of(
			new Slider("slashclient-hud.lowShield.amount", 5f, 50f, 5f, "%.0f", () -> cfg.lowShieldAmount, v -> cfg.lowShieldAmount = v)), null));
		out.add(new Entry("heldItems", "slashclient-hud.heldItems", "extras", "m-items", () -> cfg.heldItems, v -> cfg.heldItems = v, List.of(
			new Slider("slashclient-hud.set.scale", 50f, 100f, 5f, "%.0f%%", () -> cfg.heldItemScale * 100f, v -> cfg.heldItemScale = v / 100f),
			new Slider("slashclient-hud.heldItems.x", -30f, 30f, 2f, "%.0f", () -> cfg.heldItemX, v -> cfg.heldItemX = v),
			new Slider("slashclient-hud.heldItems.y", -30f, 30f, 2f, "%.0f", () -> cfg.heldItemY, v -> cfg.heldItemY = v),
			new Slider("slashclient-hud.heldItems.z", -30f, 30f, 2f, "%.0f", () -> cfg.heldItemZ, v -> cfg.heldItemZ = v)), null));
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
		// a marker at the crosshair for our own hits (with the game's crosshair too)
		out.add(new Entry("hitMarker", "slashclient-hud.hitMarker", "combat", "m-hits", () -> cfg.hitMarker, v -> cfg.hitMarker = v, List.of(
			new Choice("slashclient-hud.set.shape", dev.slash3rss.slashclient.hud.HitMarker.STYLES, "slashclient-hud.hitMarker.style.", () -> cfg.hitMarkerStyle, v -> cfg.hitMarkerStyle = v),
			new Colors("slashclient-hud.hitMarker.color", COLORS, () -> cfg.hitMarkerColor, v -> cfg.hitMarkerColor = v),
			new Slider("slashclient-hud.set.size", dev.slash3rss.slashclient.hud.HitMarker.MIN_SIZE, dev.slash3rss.slashclient.hud.HitMarker.MAX_SIZE, 1f, "%.0f",
				() -> (float) cfg.hitMarkerSize, v -> cfg.hitMarkerSize = Math.round(v)),
			new Slider("slashclient-hud.hitMarker.duration", 100f, 1000f, 50f, "%.0f ms", () -> (float) cfg.hitMarkerDuration, v -> cfg.hitMarkerDuration = Math.round(v)),
			new Toggle("slashclient-hud.hitMarker.kill", () -> cfg.hitMarkerKill, v -> cfg.hitMarkerKill = v),
			new Colors("slashclient-hud.hitMarker.killColor", COLORS, () -> cfg.hitMarkerKillColor, v -> cfg.hitMarkerKillColor = v),
			new Toggle("slashclient-hud.hitMarker.projectiles", () -> cfg.hitMarkerProjectiles, v -> cfg.hitMarkerProjectiles = v),
			new Toggle("slashclient-hud.hitMarker.sound", () -> cfg.hitMarkerSound, v -> cfg.hitMarkerSound = v),
			new Choice("slashclient-hud.hitMarker.soundKind", dev.slash3rss.slashclient.hud.HitMarker.SOUNDS, "slashclient-hud.hitMarker.sound.", () -> cfg.hitMarkerSoundKind, v -> cfg.hitMarkerSoundKind = v),
			new Slider("slashclient-hud.hitMarker.volume", 0f, 100f, 5f, "%.0f%%", () -> (float) cfg.hitMarkerVolume, v -> cfg.hitMarkerVolume = Math.round(v))), null));
		// our own armour off our own player, piece by piece (the elytra on its own: off, it shows gliding)
		out.add(new Entry("hideOwnArmor", "slashclient-hud.hideArmor", "extras", "m-armor", () -> cfg.hideOwnArmor, v -> cfg.hideOwnArmor = v, List.of(
			new Toggle("slashclient-hud.hideArmor.helmet", () -> cfg.hideOwnHelmet, v -> cfg.hideOwnHelmet = v),
			new Toggle("slashclient-hud.hideArmor.chestplate", () -> cfg.hideOwnChestplate, v -> cfg.hideOwnChestplate = v),
			new Toggle("slashclient-hud.hideArmor.leggings", () -> cfg.hideOwnLeggings, v -> cfg.hideOwnLeggings = v),
			new Toggle("slashclient-hud.hideArmor.boots", () -> cfg.hideOwnBoots, v -> cfg.hideOwnBoots = v),
			new Toggle("slashclient-hud.hideArmor.elytra", () -> cfg.hideOwnElytra, v -> cfg.hideOwnElytra = v)), null));
		out.add(new Entry("appearance", "slashclient-hud.set.appearance", "extras", "m-appearance", null, null, List.of(
			new Colors("slashclient-hud.textColor", COLORS, () -> cfg.textColor, v -> cfg.textColor = v),
			new Toggle("slashclient-hud.shadow", () -> cfg.textShadow, v -> cfg.textShadow = v),
			new Toggle("slashclient-hud.set.backgroundAll", () -> cfg.background, v -> cfg.background = v),
			new Colors("slashclient-hud.set.backgroundColor", OUTLINE_COLORS, () -> cfg.backgroundColor, v -> cfg.backgroundColor = v),
			new Slider("slashclient-hud.set.radiusAll", 0f, HudConfig.MAX_RADIUS, 1f, "%.0f px", () -> (float) cfg.cornerRadius, v -> cfg.cornerRadius = Math.round(v)),
			new Colors("slashclient-hud.set.outlineColor", OUTLINE_COLORS, () -> cfg.outlineColor, v -> cfg.outlineColor = v)), null));
		// the game's windows in dark grey: the textures are read again, dark or not
		out.add(new Entry("darkGui", "slashclient-hud.set.darkGui", "extras", "m-fullbright", () -> cfg.darkGui, v -> {
			if (cfg.darkGui == v) return;
			cfg.darkGui = v;
			DarkGui.reload();
		}, List.of(new Choice("slashclient-hud.set.darkGuiShade", DarkGui.SHADES, "slashclient-hud.set.darkGuiShade.", () -> cfg.darkGuiShade, v -> {
			if (v.equals(cfg.darkGuiShade)) return;
			cfg.darkGuiShade = v;
			if (cfg.darkGui) DarkGui.reload();
		})), null));
		// the windows' block parts made of their blocks (the crafting table's top, the furnace's front…)
		out.add(new Entry("blockWindows", "slashclient-hud.set.blockWindows", "extras", "m-block", () -> cfg.blockWindows, v -> {
			if (cfg.blockWindows == v) return;
			cfg.blockWindows = v;
			// the windows' own textures only: at once, without reloading the game's resources
			dev.slash3rss.slashclient.hud.ui.BlockWindows.refresh();
		}, List.of(), null));
		out.add(new Entry("badges", "slashclient-hud.set.badges", "extras", "m-badges", () -> cfg.badges, v -> cfg.badges = v, List.of(
			new Toggle("slashclient-hud.set.badges.clans", () -> cfg.clanTags, v -> cfg.clanTags = v),
			new Toggle("slashclient-hud.set.badges.clansOthers", () -> cfg.clanTagsOthers, v -> cfg.clanTagsOthers = v)), null));
		out.add(new Entry("killEffects", "slashclient-hud.set.killEffects", "extras", "m-kd", () -> cfg.killEffects, v -> cfg.killEffects = v, List.of(
			new Toggle("slashclient-hud.set.killEffects.others", () -> cfg.killEffectsOthers, v -> cfg.killEffectsOthers = v)), null));
		// your own shield and weapon skins always show; other players' only when asked for (fair PvP)
		out.add(new Entry("heldSkins", "slashclient-hud.set.heldSkins", "extras", "m-armor", null, null, List.of(
			new Toggle("slashclient-hud.set.heldSkins.others", () -> cfg.heldSkinsOthers, v -> cfg.heldSkinsOthers = v)), null));
		out.add(new Entry("ringEffects", "slashclient-hud.set.ringEffects", "extras", "m-light", () -> cfg.ringEffects, v -> cfg.ringEffects = v, List.of(
			new Toggle("slashclient-hud.set.ringEffects.others", () -> cfg.ringEffectsOthers, v -> cfg.ringEffectsOthers = v)), null));
		out.add(new Entry("moveEffects", "slashclient-hud.set.moveEffects", "extras", "m-movement", () -> cfg.moveEffects, v -> cfg.moveEffects = v, List.of(
			new Toggle("slashclient-hud.set.moveEffects.others", () -> cfg.moveEffectsOthers, v -> cfg.moveEffectsOthers = v)), null));
		out.add(new Entry("sprays", "slashclient-hud.set.sprays", "extras", "m-appearance", () -> cfg.sprays, v -> cfg.sprays = v, List.of(
			new Toggle("slashclient-hud.set.sprays.others", () -> cfg.spraysOthers, v -> cfg.spraysOthers = v)), null));
		out.add(new Entry("menu", "slashclient-hud.set.menu", "extras", "m-menu", () -> cfg.customMenu, v -> cfg.customMenu = v, List.of(
			new Toggle("slashclient-hud.set.seasonalLook", () -> cfg.seasonalLook, v -> cfg.seasonalLook = v)), null));
		out.add(new Entry("pause", "slashclient-hud.set.pause", "extras", "m-pause", () -> cfg.customPause, v -> cfg.customPause = v, List.of(), null));
		out.add(new Entry("serverList", "slashclient-hud.set.serverList", "extras", "m-server", () -> cfg.customServerList, v -> cfg.customServerList = v, List.of(), null));
		out.add(new Entry("loading", "slashclient-hud.set.loading", "extras", "m-menu", () -> cfg.customLoading, v -> cfg.customLoading = v, List.of(
			new Toggle("slashclient-hud.set.loading.tips", () -> cfg.loadingTips, v -> cfg.loadingTips = v)), null));
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
		// M outside a dungeon: all the ground seen, waypoints and friends, over the whole screen
		out.add(new Entry("worldMap", "slashclient-hud.worldMap", "world", "m-worldmap", () -> cfg.worldMap, v -> cfg.worldMap = v, List.of(
			new Slider("slashclient-hud.worldMap.zoom", dev.slash3rss.slashclient.hud.map.WorldMapScreen.MIN_ZOOM, dev.slash3rss.slashclient.hud.map.WorldMapScreen.MAX_ZOOM, 0.125f, "%.2f×",
				() -> cfg.worldMapZoom, v -> cfg.worldMapZoom = v),
			new Toggle("slashclient-hud.map.players", () -> cfg.mapPlayers, v -> cfg.mapPlayers = v),
			new Toggle("slashclient-hud.map.hostile", () -> cfg.mapHostile, v -> cfg.mapHostile = v),
			new Toggle("slashclient-hud.map.passive", () -> cfg.mapPassive, v -> cfg.mapPassive = v)), null));
		// friends sharing their position on the minimap and the map; ours shared or not (on the account, as in the launcher)
		out.add(new Entry("friendsOnMap", "slashclient-hud.friendMap", "world", "m-friendmap", () -> cfg.friendsOnMap, v -> cfg.friendsOnMap = v, List.of(
			new Toggle("slashclient-hud.friendMap.names", () -> cfg.friendsOnMapNames, v -> cfg.friendsOnMapNames = v),
			new Toggle("slashclient-hud.friendMap.share", dev.slash3rss.slashclient.hud.social.FriendPositions::sharing, dev.slash3rss.slashclient.hud.social.FriendPositions::setSharing)), null));
		// the death point, the light level overlay, no weather and the F5 camera's distance (one file each in the HUD's package)
		out.add(new Entry("deathWaypoint", "slashclient-hud.deathPoint", "world", "m-deathpoint", () -> cfg.deathWaypoint, v -> cfg.deathWaypoint = v, List.of(), null));
		// the death screen: where, how long, and a button keeping the place (DeathInfo)
		out.add(new Entry("deathScreen", "slashclient-hud.deathScreen", "world", "m-deathscreen", () -> cfg.deathScreen, v -> cfg.deathScreen = v, List.of(), null));
		out.add(new Entry("lightOverlay", "slashclient-hud.lightOverlay", "world", "m-lightoverlay", () -> cfg.lightOverlay, v -> cfg.lightOverlay = v, List.of(
			new Slider("slashclient-hud.lightOverlay.radius", 4f, 32f, 2f, "%.0f", () -> (float) cfg.lightOverlayRadius, v -> cfg.lightOverlayRadius = Math.round(v)),
			new Toggle("slashclient-hud.lightOverlay.crops", () -> cfg.lightOverlayCrops, v -> cfg.lightOverlayCrops = v)), null));
		out.add(new Entry("weatherOff", "slashclient-hud.weatherOff", "world", "m-weather", () -> cfg.weatherOff, v -> cfg.weatherOff = v, List.of(), null));
		out.add(new Entry("cameraDistance", "slashclient-hud.cameraDistance", "extras", "m-cameradistance", () -> cfg.cameraDistance, v -> cfg.cameraDistance = v, List.of(
			new Slider("slashclient-hud.cameraDistance.default", dev.slash3rss.slashclient.hud.CameraDistance.MIN, dev.slash3rss.slashclient.hud.CameraDistance.MAX, 0.5f, "%.1f",
				() -> cfg.cameraDistanceDefault, v -> cfg.cameraDistanceDefault = v),
			new Toggle("slashclient-hud.cameraDistance.key", () -> cfg.cameraDistanceKey, v -> cfg.cameraDistanceKey = v),
			new Toggle("slashclient-hud.cameraDistance.reset", () -> cfg.cameraDistanceReset, v -> cfg.cameraDistanceReset = v)), null));
		out.add(new Entry("screenshot", "slashclient-hud.extra.screenshot", "extras", "m-screenshot", () -> cfg.screenshotClipboard, v -> cfg.screenshotClipboard = v, List.of(), null));
		out.add(new Entry("screenshotCaption", "slashclient-hud.caption", "extras", "m-shotcaption", () -> cfg.screenshotCaption, v -> cfg.screenshotCaption = v, List.of(
			new Choice("slashclient-hud.caption.corner", dev.slash3rss.slashclient.hud.replay.ShotCaption.CORNERS, "slashclient-hud.caption.corner.",
				() -> cfg.screenshotCaptionCorner, v -> cfg.screenshotCaptionCorner = v),
			new Toggle("slashclient-hud.caption.coords", () -> cfg.screenshotCaptionCoords, v -> cfg.screenshotCaptionCoords = v),
			new Toggle("slashclient-hud.caption.server", () -> cfg.screenshotCaptionServer, v -> cfg.screenshotCaptionServer = v)), null));
		out.add(new Entry("liveNametags", "slashclient-hud.extra.liveNametags", "extras", "m-badges", () -> cfg.liveNametags, v -> cfg.liveNametags = v, List.of(), null));
		out.add(new Entry("nametagPing", "slashclient-hud.extra.nametagPing", "extras", "m-tablist", () -> cfg.nametagPing, v -> cfg.nametagPing = v, List.of(), null));
		// SlashClient's notifications: which kinds come, and quiet while the launcher says "Nie przeszkadzać"
		out.add(new Entry("notifications", "slashclient-hud.notifications", "extras", "m-toasts", () -> cfg.toasts, v -> cfg.toasts = v, List.of(
			new Toggle("slashclient-hud.notifications.messages", () -> cfg.toastMessages, v -> cfg.toastMessages = v),
			new Toggle("slashclient-hud.notifications.online", () -> cfg.toastOnline, v -> cfg.toastOnline = v),
			new Toggle("slashclient-hud.notifications.playing", () -> cfg.toastPlaying, v -> cfg.toastPlaying = v),
			new Toggle("slashclient-hud.notifications.live", () -> cfg.toastLive, v -> cfg.toastLive = v),
			new Toggle("slashclient-hud.notifications.invites", () -> cfg.toastInvites, v -> cfg.toastInvites = v),
			new Toggle("slashclient-hud.notifications.communities", () -> cfg.toastCommunities, v -> cfg.toastCommunities = v),
			new Toggle("slashclient-hud.notifications.achievements", () -> cfg.toastAchievements, v -> cfg.toastAchievements = v),
			new Toggle("slashclient-hud.notifications.errors", () -> cfg.toastErrors, v -> cfg.toastErrors = v),
			new Toggle("slashclient-hud.notifications.other", () -> cfg.toastOther, v -> cfg.toastOther = v),
			new Toggle("slashclient-hud.notifications.dnd", () -> cfg.toastDnd, v -> cfg.toastDnd = v)), null));
		out.add(new Entry("serverFriends", "slashclient-hud.serverFriends.setting", "extras", "m-friends", () -> cfg.serverFriends, v -> cfg.serverFriends = v, List.of(), null));
		out.add(new Entry("chatStack", "slashclient-hud.chat.stack", "chat", "m-chatstack", () -> cfg.chatStack, v -> cfg.chatStack = v, List.of(), null));
		out.add(new Entry("chatCopy", "slashclient-hud.chat.copy", "chat", "m-chatcopy", () -> cfg.chatCopy, v -> cfg.chatCopy = v, List.of(
			new Choice("slashclient-hud.chat.copy.format", dev.slash3rss.slashclient.hud.chat.ChatExtras.COPY_FORMATS, "slashclient-hud.chat.copy.format.", () -> cfg.chatCopyFormat, v -> cfg.chatCopyFormat = v),
			new Choice("slashclient-hud.chat.copy.time", dev.slash3rss.slashclient.hud.chat.ChatExtras.COPY_TIMES, "slashclient-hud.chat.copy.time.", () -> cfg.chatCopyTime, v -> cfg.chatCopyTime = v),
			new Toggle("slashclient-hud.chat.copy.noSender", () -> cfg.chatCopyNoSender, v -> cfg.chatCopyNoSender = v),
			new Choice("slashclient-hud.chat.copy.notice", dev.slash3rss.slashclient.hud.chat.ChatExtras.COPY_NOTICES, "slashclient-hud.chat.copy.notice.", () -> cfg.chatCopyNotice, v -> cfg.chatCopyNotice = v)), null));
		out.add(new Entry("chatCoords", "slashclient-hud.chatCoords.setting", "chat", "m-waypoints", () -> cfg.chatCoords, v -> cfg.chatCoords = v, List.of(), null));
		out.add(new Entry("chatSearch", "slashclient-hud.chat.searchBox", "chat", "m-chatsearch", () -> cfg.chatSearch, v -> cfg.chatSearch = v, List.of(), null));
		out.add(new Entry("chatHistory", "slashclient-hud.chat.history", "chat", "chat", () -> cfg.chatLongHistory, v -> cfg.chatLongHistory = v, List.of(
			new Slider("slashclient-hud.chat.history.lines", 100f, 16000f, 100f, "%.0f", () -> (float) cfg.chatHistoryLines, v -> cfg.chatHistoryLines = Math.round(v)),
			new Note("slashclient-hud.chat.history.note", () -> new Object[0])), null));
		// the game itself empties the chat on leaving a server
		out.add(new Entry("chatKeep", "slashclient-hud.chat.keep", "chat", "chat", () -> cfg.chatKeep, v -> cfg.chatKeep = v, List.of(), null));
		// the game's own HUD parts
		// the game's own parts: moved in the editor (drag their boxes), shown, scaled
		HudConfig.Placement scoreboard = cfg.placement("scoreboard"), bossbar = cfg.placement("bossbar"), tablist = cfg.placement("tablist"), actionbar = cfg.placement("actionbar"), titles = cfg.placement("titles");
		out.add(new Entry("scoreboard", "slashclient-hud.game.scoreboard", "game", "m-scoreboard", () -> cfg.scoreboard && scoreboard.enabled, v -> cfg.scoreboard = scoreboard.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.scoreboardScale, v -> cfg.scoreboardScale = v),
			new Toggle("slashclient-hud.game.numbers", () -> cfg.scoreboardNumbers, v -> cfg.scoreboardNumbers = v)), null));
		out.add(new Entry("bossbar", "slashclient-hud.game.bossbar", "game", "m-bossbar", () -> cfg.bossBar && bossbar.enabled, v -> cfg.bossBar = bossbar.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.bossBarScale, v -> cfg.bossBarScale = v)), null));
		out.add(new Entry("tablist", "slashclient-hud.game.tablist", "game", "m-tablist", () -> tablist.enabled, v -> tablist.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.tabScale, v -> cfg.tabScale = v),
			new Toggle("slashclient-hud.game.numericPing", () -> cfg.tabNumericPing, v -> cfg.tabNumericPing = v),
			new Toggle("slashclient-hud.game.tabHideHeader", () -> cfg.tabHideHeader, v -> cfg.tabHideHeader = v),
			new Toggle("slashclient-hud.game.tabHideFooter", () -> cfg.tabHideFooter, v -> cfg.tabHideFooter = v),
			new Slider("slashclient-hud.game.tabMaxPlayers", 10f, 80f, 5f, "%.0f", () -> (float) cfg.tabMaxPlayers, v -> cfg.tabMaxPlayers = Math.round(v)),
			new Slider("slashclient-hud.game.tabRowOpacity", 0f, 100f, 1f, "%.0f%%", () -> (float) cfg.tabRowOpacity, v -> cfg.tabRowOpacity = Math.round(v)),
			new Slider("slashclient-hud.game.tabPanelOpacity", 0f, 100f, 1f, "%.0f%%", () -> (float) cfg.tabPanelOpacity, v -> cfg.tabPanelOpacity = Math.round(v))), null));
		//#if MC >= 1.20.2
		out.add(new Entry("actionbar", "slashclient-hud.game.actionbar", "game", "m-actionbar", () -> cfg.actionBar && actionbar.enabled, v -> cfg.actionBar = actionbar.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.actionBarScale, v -> cfg.actionBarScale = v)), null));
		//#endif
		// on = the setting and the editor's box both (the box's ✕ turns off the latter, so this turns both on again)
		out.add(new Entry("titles", "slashclient-hud.game.titles", "game", "m-titles", () -> cfg.titles && titles.enabled, v -> cfg.titles = titles.enabled = v, List.of(
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", () -> cfg.titleScale, v -> cfg.titleScale = v)), null));
		out.add(new Entry("toasts", "slashclient-hud.game.toasts", "game", "m-toasts", () -> cfg.placement("toasts").enabled, v -> cfg.placement("toasts").enabled = v, List.of(), null));
		// the chat: the game's own background opacity and scale (above 1 with ours), the same as in its Chat Settings
		out.add(new Entry("chat", "slashclient-hud.game.chat", "game", "chat", () -> cfg.placement("chat").enabled, v -> cfg.placement("chat").enabled = v, List.of(
			new Slider("slashclient-hud.set.opacity", 0f, 100f, 5f, "%.0f%%", dev.slash3rss.slashclient.hud.chat.ChatLook::opacity, dev.slash3rss.slashclient.hud.chat.ChatLook::setOpacity),
			new Slider("slashclient-hud.set.scale", 0.5f, 1.5f, 0.05f, "%.2f×", dev.slash3rss.slashclient.hud.chat.ChatLook::shownScale, dev.slash3rss.slashclient.hud.chat.ChatLook::setScale)), null));
		out.add(new Entry("nametag", "slashclient-hud.game.nametag", "game", "m-nametag", () -> cfg.ownNametag, v -> cfg.ownNametag = v, List.of(), null));
		out.add(new Entry("chatMentions", "slashclient-hud.chat.mentions", "chat", "m-mentions", () -> cfg.chatMentions, v -> cfg.chatMentions = v, List.of(), null));
		out.add(new Entry("chatTimestamps", "slashclient-hud.chatTimestamps", "chat", "m-chattimestamps", () -> cfg.chatTimestamps, v -> cfg.chatTimestamps = v, List.of(), null));
		// in a world it starts a run, in the menu it shows the last one
		out.add(new Entry("benchmark", "slashclient-hud.benchmark", "extras", "m-benchmark", null, null, List.of(), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			if (mc.player != null) dev.slash3rss.slashclient.hud.benchmark.Benchmark.start(mc);
			else mc.setScreenAndShow(dev.slash3rss.slashclient.hud.benchmark.BenchmarkScreen.latest());
		}));
		// the emote wheel (key N): in a world it opens at once
		out.add(new Entry("emotes", "slashclient-hud.emote", "extras", "m-emotes", null, null, List.of(
			new Toggle("slashclient-hud.emote.camera", () -> cfg.emoteCamera, v -> cfg.emoteCamera = v)), () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			if (mc.player != null) mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.cosmetics.EmoteScreen(dev.slash3rss.slashclient.hud.cosmetics.Cosmetics.emoteKey()));
		}));
		// clips: the last seconds of the game, saved with F8
		out.add(new Entry("clips", "slashclient-hud.clips", "extras", "m-clips", () -> cfg.clips, v -> cfg.clips = v, List.of(
			new Slider("slashclient-hud.clips.length", 10f, 60f, 5f, "%.0f s", () -> (float) cfg.clipSeconds, v -> cfg.clipSeconds = Math.round(v)),
			new Choice("slashclient-hud.clips.resolution", HudConfig.CLIP_RESOLUTIONS, "slashclient-hud.clips.resolution.", () -> cfg.clipResolution, v -> cfg.clipResolution = v),
			new Choice("slashclient-hud.clips.fps", HudConfig.CLIP_FPS, "slashclient-hud.clips.fps.", () -> String.valueOf(cfg.clipFps), v -> cfg.clipFps = Integer.parseInt(v)),
			new Note("slashclient-hud.clips.quality.note", () -> new Object[0])), null));
		// the instant replay: the last seconds watched in the game (Replay)
		out.add(new Entry("replay", "slashclient-hud.replay", "extras", "m-replay", () -> cfg.replay, v -> cfg.replay = v, List.of(
			new Slider("slashclient-hud.replay.length", 15f, 60f, 15f, "%.0f s", () -> (float) cfg.replaySeconds, v -> cfg.replaySeconds = Math.round(v)),
			new Toggle("slashclient-hud.replay.pause", () -> cfg.replayPause, v -> cfg.replayPause = v),
			new Note("slashclient-hud.replay.cost", () -> new Object[0])), null));
		// helpers; the automatic ones say first that servers may ban for them
		out.add(new Entry("autoClicker", "slashclient-hud.assist.autoClicker", "combat", "m-autoclicker", () -> cfg.autoClicker,
			v -> risky(v, () -> cfg.autoClicker = v), List.of(
			new Choice("slashclient-hud.assist.mode", HudConfig.AUTO_CLICK_MODES, "slashclient-hud.assist.mode.", () -> cfg.autoClickMode, v -> cfg.autoClickMode = v),
			new Note("slashclient-hud.assist.mode.note", () -> new Object[0]),
			new Toggle("slashclient-hud.assist.left", () -> cfg.autoClickLeft, v -> cfg.autoClickLeft = v),
			new Slider("slashclient-hud.assist.cps", 1f, 20f, 1f, "%.0f CPS", () -> (float) cfg.autoClickCps, v -> cfg.autoClickCps = Math.round(v)),
			new Toggle("slashclient-hud.assist.right", () -> cfg.autoClickRight, v -> cfg.autoClickRight = v),
			new Slider("slashclient-hud.assist.rightCps", 1f, 20f, 1f, "%.0f CPS", () -> (float) cfg.autoClickRightCps, v -> cfg.autoClickRightCps = Math.round(v)),
			// what the left button clicks at: anything (but a player), or only a mob under the crosshair
			new Choice("slashclient-hud.assist.target", HudConfig.AUTO_CLICK_TARGETS, "slashclient-hud.assist.target.",
				() -> cfg.autoClickMobs ? "mobs" : "all", v -> cfg.autoClickMobs = "mobs".equals(v)),
			new Toggle("slashclient-hud.assist.cooldown", () -> cfg.autoClickCooldown, v -> cfg.autoClickCooldown = v),
			new Toggle("slashclient-hud.assist.shield", () -> cfg.autoClickShield, v -> cfg.autoClickShield = v),
			new Toggle("slashclient-hud.assist.containers", () -> cfg.autoClickContainers, v -> cfg.autoClickContainers = v),
			new Toggle("slashclient-hud.assist.jump", () -> cfg.autoClickJump, v -> cfg.autoClickJump = v),
			new Slider("slashclient-hud.assist.jumps", 1f, 10f, 1f, "%.0f/s", () -> (float) cfg.autoClickJumps, v -> cfg.autoClickJumps = Math.round(v))), null));
		out.add(new Entry("autoTool", "slashclient-hud.assist.autoTool", "world", "m-autotool", () -> cfg.autoTool,
			v -> risky(v, () -> cfg.autoTool = v), List.of(
			new Toggle("slashclient-hud.assist.toolBlocks", () -> cfg.autoToolBlocks, v -> cfg.autoToolBlocks = v),
			// blocks more than one kind of tool digs: which one
			new Choice("slashclient-hud.assist.toolLeaves", HudConfig.AUTO_TOOL_LEAVES, "slashclient-hud.assist.toolBlock.", () -> cfg.autoToolLeaves, v -> cfg.autoToolLeaves = v),
			new Choice("slashclient-hud.assist.toolCobweb", HudConfig.AUTO_TOOL_COBWEB, "slashclient-hud.assist.toolBlock.", () -> cfg.autoToolCobweb, v -> cfg.autoToolCobweb = v),
			new Choice("slashclient-hud.assist.toolBamboo", HudConfig.AUTO_TOOL_BAMBOO, "slashclient-hud.assist.toolBlock.", () -> cfg.autoToolBamboo, v -> cfg.autoToolBamboo = v),
			new Choice("slashclient-hud.assist.toolGourds", HudConfig.AUTO_TOOL_GOURDS, "slashclient-hud.assist.toolBlock.", () -> cfg.autoToolGourds, v -> cfg.autoToolGourds = v),
			new Toggle("slashclient-hud.assist.toolWeapons", () -> cfg.autoToolWeapons, v -> cfg.autoToolWeapons = v),
			new Choice("slashclient-hud.assist.toolWeapon", HudConfig.AUTO_TOOL_WEAPONS, "slashclient-hud.assist.toolWeapon.", () -> cfg.autoToolWeapon, v -> cfg.autoToolWeapon = v),
			new Toggle("slashclient-hud.assist.toolShears", () -> cfg.autoToolShears, v -> cfg.autoToolShears = v),
			new Toggle("slashclient-hud.assist.toolMilk", () -> cfg.autoToolMilk, v -> cfg.autoToolMilk = v),
			new Choice("slashclient-hud.assist.toolMooshroom", HudConfig.AUTO_TOOL_MOOSHROOM, "slashclient-hud.assist.toolMooshroom.", () -> cfg.autoToolMooshroom, v -> cfg.autoToolMooshroom = v),
			new Toggle("slashclient-hud.assist.toolFish", () -> cfg.autoToolFish, v -> cfg.autoToolFish = v),
			new Toggle("slashclient-hud.assist.toolBrush", () -> cfg.autoToolBrush, v -> cfg.autoToolBrush = v),
			new Toggle("slashclient-hud.assist.toolFeed", () -> cfg.autoToolFeed, v -> cfg.autoToolFeed = v)), null));
		out.add(new Entry("autoRefill", "slashclient-hud.assist.autoRefill", "world", "m-autorefill", () -> cfg.autoRefill,
			v -> risky(v, () -> cfg.autoRefill = v), List.of(), null));
		// holding a button is set up with keys of its own: they are its settings (withKeys)
		out.add(new Entry("holdKeys", "slashclient-hud.assist.holdKeys", "extras", "m-holdkeys", null, null, List.of(
			new Toggle("slashclient-hud.assist.holdScreens", () -> cfg.holdInScreens, v -> cfg.holdInScreens = v)), null));
		out.add(new Entry("toolWarning", "slashclient-hud.assist.toolWarning", "combat", "m-toolwarning", () -> cfg.toolWarning, v -> cfg.toolWarning = v, List.of(
			new Slider("slashclient-hud.assist.toolWarningAt", 1f, 30f, 1f, "%.0f%%", () -> (float) cfg.toolWarningPercent, v -> cfg.toolWarningPercent = Math.round(v))), null));
		out.add(new Entry("mouseTweaks", "slashclient-hud.extra.mouseTweaks", "extras", "m-mousetweaks", () -> cfg.mouseTweaks, v -> cfg.mouseTweaks = v, List.of(), null));
		out.add(new Entry("craftFit", "slashclient-hud.craftFit", "extras", "m-mousetweaks", () -> cfg.craftFit, v -> cfg.craftFit = v, List.of(), null));
		// sorting with R or the window's button, with the normal clicks at a pace servers accept; off on the servers listed
		out.add(new Entry("inventorySort", "slashclient-hud.sort", "extras", "m-sort", () -> cfg.inventorySort, v -> cfg.inventorySort = v, List.of(
			new Slider("slashclient-hud.sort.delay", 0f, 250f, 10f, "%.0f ms", () -> (float) cfg.sortDelay, v -> cfg.sortDelay = Math.round(v)),
			new Toggle("slashclient-hud.sort.hotbar", () -> cfg.sortHotbar, v -> cfg.sortHotbar = v),
			new Toggle("slashclient-hud.sort.button", () -> cfg.sortButton, v -> cfg.sortButton = v),
			new Toggle("slashclient-hud.sort.move", () -> cfg.chestMove, v -> cfg.chestMove = v),
			new Toggle("slashclient-hud.sort.moveHotbar", () -> cfg.chestMoveHotbar, v -> cfg.chestMoveHotbar = v),
			new Text("slashclient-hud.sort.offServers", "slashclient-hud.sort.offServersHint", 200, () -> cfg.sortOffServers, v -> cfg.sortOffServers = v)), null));
		out.add(new Entry("shulkerPreview", "slashclient-hud.shulkerPreview", "extras", "m-shulker", () -> cfg.shulkerPreview, v -> cfg.shulkerPreview = v, List.of(), null));
		out.add(new Entry("enchantColors", "slashclient-hud.enchantColors", "extras", "m-enchant", () -> cfg.enchantColors, v -> cfg.enchantColors = v, List.of(
			new Note("slashclient-hud.enchantColors.note", () -> new Object[0])), null));
		out.add(new Entry("inventorySearch", "slashclient-hud.invSearch", "extras", "m-invsearch", () -> cfg.inventorySearch, v -> cfg.inventorySearch = v, List.of(), null));
		out.add(new Entry("slotLock", "slashclient-hud.slotLock", "combat", "m-slotlock", () -> cfg.slotLock, v -> cfg.slotLock = v, List.of(), null));
		out.add(new Entry("compactHearts", "slashclient-hud.game.compactHearts", "game", "m-hearts", () -> cfg.compactHearts, v -> cfg.compactHearts = v, List.of(), null));
		out.add(new Entry("foodPreview", "slashclient-hud.game.foodPreview", "game", "m-saturation", () -> cfg.foodPreview, v -> cfg.foodPreview = v, List.of(
			new Note("slashclient-hud.game.foodPreview.note", () -> new Object[0])), null));
		out.add(new Entry("chatTabs", "slashclient-hud.chat.tabs", "chat", "m-chattabs", null, null, List.of(), openChatTabs));
		out.add(new Entry("chatWindowsOnly", "slashclient-hud.chat.windowsOnly", "chat", "m-chattabs", () -> cfg.chatWindowsOnly, v -> {
			cfg.chatWindowsOnly = v;
			dev.slash3rss.slashclient.hud.chat.ChatTabs.reapply();
		}, List.of(), null));
		out.replaceAll(Catalog::withKeys);
		return out;
	}
}
