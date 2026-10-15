package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Settings in config/slashclient-hud.json. The launcher writes the same file, so the
 * player can switch modules on and off there too; the in-game editor moves them.
 */
public final class HudConfig {
	/**
	 * Where a module sits: an anchor (0 = left/top, 0.5 = middle, 1 = right/bottom) plus an
	 * offset in GUI pixels. Modules stay by their corner or edge at any window size.
	 */
	public static final class Placement {
		public boolean enabled = true;
		public float ax;
		public float ay;
		public int dx;
		public int dy;
		/** Size of the module, 0.5 to 2. */
		public float scale = 1f;
		/** Own background setting; null = the HUD-wide one. */
		public Boolean background;

		/** For Gson, so missing fields keep the defaults above. */
		Placement() {}

		public float scale() {
			return scale <= 0 ? 1f : scale;
		}

		public boolean background(HudConfig cfg) {
			return background == null ? cfg.background : background;
		}

		Placement(boolean enabled, float ax, float ay, int dx, int dy) {
			this.enabled = enabled;
			this.ax = ax;
			this.ay = ay;
			this.dx = dx;
			this.dy = dy;
		}
	}

	/** A chat tab: shows only the lines that match one of its patterns. */
	public static final class ChatTab {
		public String name;
		/** Plain text (case does not matter) or regular expressions; "{nick}" is the player's name. */
		public List<String> patterns = new ArrayList<>();
		public boolean regex;

		public ChatTab(String name, boolean regex, String... patterns) {
			this.name = name;
			this.regex = regex;
			this.patterns.addAll(List.of(patterns));
		}
	}

	public Map<String, Placement> modules = new LinkedHashMap<>();
	public List<ChatTab> chatTabs = new ArrayList<>();
	/** ARGB colour of the text. */
	public int textColor = 0xFFFFFFFF;
	public boolean background = true;
	public boolean textShadow = true;

	// ---- extras, the other things clients usually have ----
	/** Hold the zoom key (C) to zoom; the mouse wheel changes how far while held. */
	public boolean zoom = true;
	public float zoomFactor = 4f;
	public boolean zoomSmooth = true;
	public boolean fullbright = false;
	/** The fire overlay sits lower, so it covers less of the screen. */
	public boolean lowFire = false;
	public boolean chatTimestamps = false;
	/** "vanilla", "plus", "dot", "plusdot" or "x". */
	public String crosshair = "vanilla";
	public int crosshairColor = 0xFFFFFFFF;
	public int crosshairSize = 5;
	public int crosshairGap = 2;
	/** The SlashClient main menu instead of Minecraft's own. */
	public boolean customMenu = true;

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-hud.json");

	static HudConfig defaults() {
		HudConfig c = new HudConfig();
		// left column, one text line (14 px) apart
		c.modules.put("fps", new Placement(true, 0, 0, 2, 2));
		c.modules.put("ping", new Placement(true, 0, 0, 2, 17));
		c.modules.put("cps", new Placement(true, 0, 0, 2, 32));
		c.modules.put("coords", new Placement(true, 0, 0, 2, 47));
		c.modules.put("speed", new Placement(false, 0, 0, 2, 74));
		// top middle, under the boss bar area only when switched on
		c.modules.put("server", new Placement(false, 0.5f, 0, 0, 2));
		c.modules.put("players", new Placement(false, 0.5f, 0, 0, 17));
		c.modules.put("biome", new Placement(false, 0.5f, 0, 0, 32));
		c.modules.put("daytime", new Placement(false, 0.5f, 0, 0, 47));
		c.modules.put("light", new Placement(false, 0.5f, 0, 0, 62));
		c.modules.put("saturation", new Placement(false, 0.5f, 0, 0, 77));
		// right column; the effect list replaces Minecraft's own effect icons
		c.modules.put("clock", new Placement(false, 1, 0, -2, 2));
		c.modules.put("memory", new Placement(false, 1, 0, -2, 17));
		c.modules.put("session", new Placement(false, 1, 0, -2, 32));
		c.modules.put("effects", new Placement(true, 1, 0, -2, 47));
		c.modules.put("armor", new Placement(true, 1, 0.5f, -2, 20));
		c.modules.put("items", new Placement(true, 1, 1, -2, -2));
		// around the crosshair
		c.modules.put("target", new Placement(true, 0.5f, 0.5f, 0, 40));
		c.modules.put("combo", new Placement(false, 0.5f, 0.5f, 30, 12));
		c.modules.put("reach", new Placement(false, 0.5f, 0.5f, -30, 12));
		c.modules.put("keystrokes", new Placement(true, 0, 0.5f, 2, 20));
		c.modules.put("movement", new Placement(false, 0, 0.5f, 2, -2));
		c.chatTabs.add(new ChatTab("@", false, "{nick}"));
		// private messages look different on every server; these catch the common ones
		c.chatTabs.add(new ChatTab("PM", true, "(?i)(whispers to you|szepcze|\\[msg\\]|-> ?(me|ja)\\b|\\bfrom \\w+:)"));
		return c;
	}

	public static HudConfig load() {
		HudConfig defaults = defaults();
		try {
			if (!Files.exists(FILE)) {
				defaults.save();
				return defaults;
			}
			HudConfig read = GSON.fromJson(Files.readString(FILE), HudConfig.class);
			return read == null ? defaults : fillMissing(read);
		} catch (IOException | JsonSyntaxException e) {
			SlashHud.LOG.warn("Nie udało się wczytać {}: {}", FILE, e.toString());
			return defaults;
		}
	}

	/** Settings from an older version or a share code: whatever is missing gets its default. */
	static HudConfig fillMissing(HudConfig read) {
		HudConfig defaults = defaults();
		if (read.modules == null) read.modules = new LinkedHashMap<>();
		// modules added in newer versions get their default place
		for (var e : defaults.modules.entrySet()) read.modules.putIfAbsent(e.getKey(), e.getValue());
		if (read.chatTabs == null) read.chatTabs = defaults.chatTabs;
		if (read.crosshair == null) read.crosshair = defaults.crosshair;
		return read;
	}

	/** Takes over everything from `other` (a pasted code) and saves. */
	public void copyFrom(HudConfig other) {
		modules = other.modules;
		chatTabs = other.chatTabs;
		textColor = other.textColor;
		background = other.background;
		textShadow = other.textShadow;
		zoom = other.zoom;
		zoomFactor = other.zoomFactor;
		zoomSmooth = other.zoomSmooth;
		fullbright = other.fullbright;
		lowFire = other.lowFire;
		chatTimestamps = other.chatTimestamps;
		crosshair = other.crosshair;
		crosshairColor = other.crosshairColor;
		crosshairSize = other.crosshairSize;
		crosshairGap = other.crosshairGap;
		customMenu = other.customMenu;
		save();
	}

	public void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(this));
		} catch (IOException e) {
			SlashHud.LOG.warn("Nie udało się zapisać {}: {}", FILE, e.toString());
		}
	}

	public Placement placement(String id) {
		return modules.computeIfAbsent(id, k -> new Placement(false, 0, 0, 2, 2));
	}
}
