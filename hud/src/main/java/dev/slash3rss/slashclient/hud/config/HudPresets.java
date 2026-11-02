package dev.slash3rss.slashclient.hud.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.google.gson.reflect.TypeToken;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.gamehud.GameParts;
import dev.slash3rss.slashclient.hud.servers.ServerLayouts;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Ready HUD layouts, put on with one click in the editor's Share page: which modules are on and
 * where. A preset touches only the modules: the game's own parts (scoreboard, chat, …) stay where
 * the player put them, a module the preset leaves out is only switched off (its look kept for
 * later), and a module it switches on keeps the player's colours and background. The HUD-wide
 * colours, the extras and the rest of the settings stay as they are.
 *
 * The player can also save the modules as they are now as a preset of their own, under a name:
 * putting one on brings back every module as it was saved, the game's parts too.
 *
 * Before the first preset the player's own modules are kept in config/slashclient-hud-presets.json,
 * so "Back to my layout" puts them back, even after a restart. While a server's layout is on
 * (ServerLayouts), the preset and its way back belong to that server's layout.
 */
public final class HudPresets {
	private HudPresets() {}

	public static final String[] IDS = { "minimal", "pvp", "survival", "partner", "streamer" };
	public static final Map<String, String> ICONS = Map.of("minimal", "layout", "pvp", "combat", "survival", "world",
		"partner", "partner", "streamer", "m-twitchchat");

	public static final int MAX_SAVED = 12, NAME_MAX = 24;
	/** The id a saved preset is picked by: "own:" and its name. */
	public static final String OWN = "own:";

	/** A preset the player saved: its name and every module as it was. */
	public static final class Saved {
		public String name = "";
		public Map<String, HudConfig.Placement> modules = new LinkedHashMap<>();
	}

	private static final class Store {
		/** The player's saved presets, in the order they were saved. */
		List<Saved> saved = new ArrayList<>();
		/** The player's own modules from before the first preset, for each layout ("" = the player's own, else a server's). */
		Map<String, Map<String, HudConfig.Placement>> own = new LinkedHashMap<>();
		/** The preset last put on, for each layout. */
		Map<String, String> picked = new LinkedHashMap<>();
	}

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-hud-presets.json");
	private static Store store;

	private static Store store() {
		if (store != null) return store;
		store = new Store();
		try {
			if (Files.exists(FILE)) {
				Store read = GSON.fromJson(Files.readString(FILE), Store.class);
				if (read != null) {
					if (read.own == null) read.own = new LinkedHashMap<>();
					if (read.picked == null) read.picked = new LinkedHashMap<>();
					if (read.saved == null) read.saved = new ArrayList<>();
					read.saved.removeIf(p -> p == null || p.name == null || p.name.isBlank() || p.modules == null);
					read.own.values().removeIf(m -> m == null);
					store = read;
				}
			}
		} catch (IOException | JsonParseException e) {
			SlashHud.LOG.warn("Nie udało się wczytać {}: {}", FILE, e.toString());
		}
		return store;
	}

	private static void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(store()));
		} catch (IOException e) {
			SlashHud.LOG.warn("Nie udało się zapisać {}: {}", FILE, e.toString());
		}
	}

	/** Which layout is being changed: a server's while its own is on, else the player's. */
	private static String context() {
		String server = ServerLayouts.active();
		return server == null ? "" : server;
	}

	/** The preset last put on this layout, or null (also after going back). */
	public static String picked() {
		return store().picked.get(context());
	}

	/** Whether "Back to my layout" has something to put back. */
	public static boolean canGoBack() {
		return store().own.containsKey(context());
	}

	/** The player's saved presets' names. */
	public static List<String> saved() {
		List<String> out = new ArrayList<>();
		for (Saved p : store().saved) out.add(p.name);
		return out;
	}

	private static Saved find(String name) {
		for (Saved p : store().saved) if (p.name.equalsIgnoreCase(name.trim())) return p;
		return null;
	}

	/** Whether a preset can be saved under this name: not empty, and a new one only while there is room (a saved name is replaced). */
	public static boolean canSave(String name) {
		if (name == null || name.isBlank()) return false;
		return find(name) != null || store().saved.size() < MAX_SAVED;
	}

	/** The modules as they are now become a preset under this name (one of the same name is replaced); false when it cannot. */
	public static boolean save(String name) {
		HudConfig cfg = SlashHud.config;
		if (cfg == null || !canSave(name)) return false;
		String clean = name.trim();
		if (clean.length() > NAME_MAX) clean = clean.substring(0, NAME_MAX);
		Saved p = find(clean);
		if (p == null) {
			p = new Saved();
			store().saved.add(p);
		}
		p.name = clean;
		p.modules = copy(cfg.modules);
		// what is on now is this preset
		store().picked.put(context(), OWN + clean);
		save();
		return true;
	}

	/** A saved preset forgotten (the HUD stays as it is). */
	public static void delete(String name) {
		Saved p = find(name);
		if (p == null) return;
		store().saved.remove(p);
		store().picked.values().removeIf(v -> v.equalsIgnoreCase(OWN + p.name));
		save();
	}

	/**
	 * Puts the preset on the HUD (one of IDS, or OWN and a saved one's name), keeping the player's
	 * own modules first (once, so a second preset keeps the first ones).
	 */
	public static void apply(String id) {
		HudConfig cfg = SlashHud.config;
		if (cfg == null || id == null) return;
		Store s = store();
		if (id.startsWith(OWN)) {
			Saved p = find(id.substring(OWN.length()));
			if (p == null) return;
			s.own.putIfAbsent(context(), copy(cfg.modules));
			// modules added since it was saved keep what they have now
			for (var e : copy(p.modules).entrySet()) if (e.getValue() != null) cfg.modules.put(e.getKey(), e.getValue());
			cfg.save();
			s.picked.put(context(), OWN + p.name);
			save();
			ServerLayouts.remember();
			return;
		}
		if (!List.of(IDS).contains(id)) return;
		s.own.putIfAbsent(context(), copy(cfg.modules));
		Map<String, HudConfig.Placement> wanted = places(id, cfg);
		Map<String, HudConfig.Placement> out = new LinkedHashMap<>();
		for (var e : cfg.modules.entrySet()) {
			String key = e.getKey();
			HudConfig.Placement now = e.getValue();
			if (GameParts.IDS.contains(key) || now == null) {
				out.put(key, now);
				continue;
			}
			HudConfig.Placement p = wanted.get(key);
			if (p == null) {
				HudConfig.Placement off = copy(now);
				off.enabled = false;
				out.put(key, off);
			} else {
				// the player's look stays, the place and the size are the preset's
				p.background = now.background;
				p.color = now.color;
				p.shadow = now.shadow;
				p.opacity = now.opacity;
				p.outline = now.outline;
				p.radius = now.radius;
				out.put(key, p);
			}
		}
		cfg.modules.clear();
		cfg.modules.putAll(out);
		cfg.save();
		s.picked.put(context(), id);
		save();
		ServerLayouts.remember();
	}

	/** The player's own modules from before the first preset come back. */
	public static void goBack() {
		HudConfig cfg = SlashHud.config;
		Store s = store();
		Map<String, HudConfig.Placement> own = s.own.remove(context());
		s.picked.remove(context());
		save();
		if (cfg == null || own == null) return;
		// modules added since (a newer version) keep what they have now
		for (var e : own.entrySet()) if (e.getValue() != null) cfg.modules.put(e.getKey(), e.getValue());
		cfg.save();
		ServerLayouts.remember();
	}

	/** The modules a preset switches on and where; everything else goes off. */
	static Map<String, HudConfig.Placement> places(String id, HudConfig cfg) {
		Map<String, HudConfig.Placement> m = new LinkedHashMap<>();
		switch (id) {
			case "minimal" -> {
				// only what is looked at all the time
				m.put("fps", at(0, 0, 2, 2));
				m.put("coords", at(0, 0, 2, 17));
				m.put("effects", at(1, 0, -2, 2));
			}
			case "pvp" -> {
				// numbers on the left, the fight around the crosshair (clear of the titles over it), the gear low on the right
				m.put("fps", at(0, 0, 2, 2));
				m.put("ping", at(0, 0, 2, 17));
				m.put("cps", at(0, 0, 2, 32));
				m.put("kd", at(0, 0, 2, 47));
				// the keystrokes a little higher than usual, clear of the chat, and sprinting and sneaking over them
				m.put("movement", at(0, 0.5f, 2, -60));
				m.put("keystrokes", at(0, 0.5f, 2, -10));
				m.put("target", at(0.5f, 0, 0, 28));
				m.put("hits", at(0.5f, 0.5f, 0, -40));
				m.put("attackindicator", at(0.5f, 0.5f, 0, 36));
				m.put("combo", at(0.5f, 0.5f, 40, 36));
				m.put("reach", at(0.5f, 0.5f, -40, 36));
				m.put("durability", at(0.5f, 0.5f, 140, 0));
				m.put("ammo", at(0.5f, 0.5f, -140, 0));
				m.put("effects", at(1, 0, -2, 2));
				m.put("armor", at(1, 1, -2, -26));
				m.put("items", at(1, 1, -2, -2));
			}
			case "survival" -> {
				// the map in the top left corner and under it where you are and what time it is, all above the chat;
				// the compass under the player list and the boss bar, the food and the flight under it
				HudConfig.Placement map = at(0, 0, 2, 2);
				map.background = false;
				m.put("minimap", map);
				// the map's box is a little taller than the map (the place's name under it)
				int top = Math.max(40, cfg.minimapSize) + 16;
				m.put("fps", at(0, 0, 2, top));
				m.put("coords", at(0, 0, 2, top + 15));
				m.put("nethercoords", at(0, 0, 2, top + 42));
				m.put("biome", at(0, 0, 2, top + 57));
				m.put("daytime", at(0, 0, 2, top + 72));
				m.put("light", at(0, 0, 2, top + 87));
				m.put("compass", at(0.5f, 0, 0, 24));
				m.put("elytra", at(0.5f, 0, 0, 54));
				m.put("saturation", at(0.5f, 0, 0, 70));
				m.put("block", at(0.5f, 0.5f, 0, -45));
				m.put("durability", at(0.5f, 0.5f, 140, 0));
				// on the right under the toasts, and the gear low, clear of the scoreboard
				m.put("effects", at(1, 0, -2, 68));
				m.put("armor", at(1, 1, -2, -26));
				m.put("items", at(1, 1, -2, -2));
			}
			case "partner" -> {
				// on the left the numbers and under them the dungeon map with its loot, all above the chat (the
				// shamanism recipes in the map's place: no summons in a dungeon), the tasks beside them; on the
				// right the plan under the toasts, the wardrobe beside the scoreboard, the counters under it
				m.put("fps", at(0, 0, 2, 2));
				m.put("ping", at(0, 0, 2, 17));
				m.put("coords", at(0, 0, 2, 32));
				m.put("dungeonmap", at(0, 0, 2, 62));
				m.put("skyshaman", at(0, 0, 2, 62));
				m.put("dungeonloot", at(0, 0, 2, 186));
				m.put("skytasks", at(0, 0, 158, 62));
				m.put("skyxp", at(0.5f, 0, 0, 26));
				m.put("effects", at(1, 0, -2, 2));
				m.put("skyplan", at(1, 0, -2, 68));
				m.put("skywardrobe", at(1, 0, -104, 116));
				m.put("skycase", at(1, 0, -2, 228));
				m.put("skyfish", at(1, 0, -135, 228));
			}
			case "streamer" -> {
				// what viewers like to see: the keys and clicks, the music, the time on stream, the chats of the set channels
				m.put("fps", at(0, 0, 2, 2));
				m.put("cps", at(0, 0, 2, 17));
				m.put("session", at(0, 0, 2, 32));
				m.put("clock", at(0, 0, 2, 47));
				HudConfig.Placement keys = at(0, 0.5f, 2, -10);
				keys.scale = 1.25f;
				m.put("keystrokes", keys);
				m.put("spotify", at(1, 0.3f, -2, 0));
				m.put("effects", at(1, 0, -2, 2));
				m.put("armor", at(1, 1, -2, -2));
				if (cfg.twitchChat != null && cfg.twitchChat.channel != null && !cfg.twitchChat.channel.isBlank()) m.put("twitchchat", at(0, 0, 104, 2));
				if (cfg.kickChat != null && cfg.kickChat.channel != null && !cfg.kickChat.channel.isBlank()) m.put("kickchat", at(1, 0.75f, -2, 0));
			}
			default -> {}
		}
		return m;
	}

	private static HudConfig.Placement at(float ax, float ay, int dx, int dy) {
		return new HudConfig.Placement(true, ax, ay, dx, dy);
	}

	private static HudConfig.Placement copy(HudConfig.Placement p) {
		return GSON.fromJson(GSON.toJson(p), HudConfig.Placement.class);
	}

	private static final Type MODULES = new TypeToken<LinkedHashMap<String, HudConfig.Placement>>() {}.getType();

	private static Map<String, HudConfig.Placement> copy(Map<String, HudConfig.Placement> modules) {
		return GSON.fromJson(GSON.toJson(modules), MODULES);
	}

	/** For the test: forgets the kept layouts without touching the HUD. */
	public static void clearForTest() {
		store = new Store();
		save();
	}
}
