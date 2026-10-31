package dev.slash3rss.slashclient.hud.map;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.storage.LevelResource;

import java.net.IDN;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.players.TabStatus;

/**
 * Which list of waypoints belongs to the place the player is in (and which explored map, and which
 * death point).
 *
 * A server is its address written one way: lower case, without the default port 25565 or a dot at
 * the end, an international name in its ASCII form ("server:skyup.pl" for "SkyUp.pl:25565" and
 * "skyup.pl."). Subdomains stay apart: play.skyup.pl may well be another server than skyup.pl; points
 * kept under another spelling can be moved by hand (WaypointsScreen, "Move…").
 *
 * A singleplayer world is its folder ("save:New World (1)"), not its name: renaming a world keeps its
 * points and two worlds of the same name do not share them. Points kept under the name (the old
 * "world:<name>") move to the folder the first time the world is opened, when no other world has
 * that name; otherwise they wait for the move by hand.
 *
 * A server network (one address, many modes behind a proxy) adds the mode to the key when the tab
 * list says it (the server's status rules, TabStatus.mode: SkyUp's "AnyBlock · S3 (Wyspy)"), as
 * "server:skyup.pl#anyblock · s3 (wyspy)". New points then belong to the mode the player is in;
 * points from before (the server's own key) show in every mode until the player gives them to one.
 * A server where no mode shows keeps one list as before. Per server the split can be switched off.
 */
public final class WaypointKeys {
	private WaypointKeys() {}

	public static final String SERVER = "server:", SAVE = "save:", OLD_WORLD = "world:";
	/** Between a server's key and its mode. */
	public static final char MODE = '#';

	/** What the screens need to remember: the split switched off per server, the modes' names as shown, the worlds' names. */
	private static final class Settings {
		Map<String, Boolean> split = new LinkedHashMap<>();
		Map<String, String> modes = new LinkedHashMap<>();
		Map<String, String> names = new LinkedHashMap<>();
	}

	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-waypoints-keys.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Settings settings;

	private static Settings settings() {
		if (settings == null) {
			try {
				if (Files.exists(FILE)) settings = GSON.fromJson(Files.readString(FILE), Settings.class);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: waypoint keys: {}", e.toString());
			}
			if (settings == null) settings = new Settings();
			if (settings.split == null) settings.split = new LinkedHashMap<>();
			if (settings.modes == null) settings.modes = new LinkedHashMap<>();
			if (settings.names == null) settings.names = new LinkedHashMap<>();
		}
		return settings;
	}

	private static void saveSettings() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(settings()));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: waypoint keys: {}", e.toString());
		}
	}

	// ---------- writing a key one way ----------

	/** "SkyUp.pl.:25565" → "skyup.pl"; "[::1]:25566" stays; "zażółć.pl" → "xn--…". */
	public static String address(String address) {
		String a = address == null ? "" : address.trim().toLowerCase(Locale.ROOT);
		String host = a, port = "";
		if (a.startsWith("[")) {
			int end = a.indexOf(']');
			if (end > 0) {
				host = a.substring(0, end + 1);
				String rest = a.substring(end + 1);
				port = rest.startsWith(":") ? rest.substring(1) : "";
			}
		} else if (a.indexOf(':') >= 0 && a.indexOf(':') == a.lastIndexOf(':')) {
			host = a.substring(0, a.indexOf(':'));
			port = a.substring(a.indexOf(':') + 1);
		}
		while (host.endsWith(".")) host = host.substring(0, host.length() - 1);
		if (!host.chars().allMatch(c -> c < 128)) {
			try {
				host = IDN.toASCII(host, IDN.ALLOW_UNASSIGNED).toLowerCase(Locale.ROOT);
			} catch (RuntimeException e) {
				// not a name IDN takes: kept as written
			}
		}
		port = port.trim();
		if (port.matches("\\d{1,5}")) port = String.valueOf(Integer.parseInt(port));
		return port.isEmpty() || port.equals("25565") ? host : host + ":" + port;
	}

	public static String serverKey(String address) {
		return SERVER + address(address);
	}

	/** A mode as it goes into a key: lower case, without the separator. */
	public static String modeId(String mode) {
		return mode.replace(MODE, ' ').trim().toLowerCase(Locale.ROOT);
	}

	public static String withMode(String base, String mode) {
		return mode == null || mode.isBlank() ? base : base + MODE + modeId(mode);
	}

	/** The key without its mode. */
	public static String base(String key) {
		int i = key == null ? -1 : key.indexOf(MODE);
		return key == null ? "" : i < 0 ? key : key.substring(0, i);
	}

	/** Any key written the one way ("server:SkyUp.pl:25565" → "server:skyup.pl"); other keys as they are. */
	public static String normalize(String key) {
		if (key == null) return "";
		String base = base(key), mode = key.length() > base.length() ? key.substring(base.length() + 1) : null;
		if (base.regionMatches(true, 0, SERVER, 0, SERVER.length())) base = serverKey(base.substring(SERVER.length()));
		return mode == null ? base : withMode(base, mode);
	}

	// ---------- where the player is ----------

	/** The test plays in singleplayer as if on this server address (null: as it is). */
	public static String serverForTest;
	private static String cachedAddress, cachedServerKey;
	private static MinecraftServer cachedServer;
	private static String cachedSaveKey;

	/** The address of the server the game is on, or null in singleplayer and the menus. */
	public static String address(Minecraft mc) {
		if (serverForTest != null) return serverForTest;
		var server = mc.getCurrentServer();
		return server == null ? null : server.ip;
	}

	/** The singleplayer world's folder ("New World (1)"). */
	static String folder(MinecraftServer server) {
		try {
			Path f = server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize().getFileName();
			if (f != null) return f.toString();
		} catch (RuntimeException e) {
			SlashHud.LOG.debug("SlashClient: world folder: {}", e.toString());
		}
		return server.getWorldData().getLevelName();
	}

	/** The place without a mode: "server:skyup.pl", "save:<folder>" or "unknown". */
	public static String baseKey(Minecraft mc) {
		String a = address(mc);
		if (a != null) {
			if (!a.equals(cachedAddress)) {
				cachedAddress = a;
				cachedServerKey = serverKey(a);
			}
			return cachedServerKey;
		}
		MinecraftServer server = mc.getSingleplayerServer();
		if (server != null) {
			if (server != cachedServer) {
				cachedServer = server;
				cachedSaveKey = SAVE + folder(server);
			}
			return cachedSaveKey;
		}
		return "unknown";
	}

	private static String mode, modeBase;
	private static Object modeLevel;
	private static long modeCheckedAt;

	/** The mode the player is in on this server ("AnyBlock · S3 (Wyspy)"), or null when none shows. */
	public static String mode(Minecraft mc) {
		return mode != null && baseKey(mc).equals(modeBase) ? mode : null;
	}

	/** Whether the points of this server's modes are kept apart (on unless switched off). */
	public static boolean split(String base) {
		Boolean v = settings().split.get(base);
		return v == null || v;
	}

	public static void setSplit(String base, boolean on) {
		if (on) settings().split.remove(base);
		else settings().split.put(base, false);
		saveSettings();
	}

	/** Where new points of this place go: the server's mode when there is one and modes are kept apart. */
	public static String key(Minecraft mc) {
		String base = baseKey(mc), m = mode(mc);
		return m != null && split(base) ? withMode(base, m) : base;
	}

	/** Whose explored map this is: every mode its own (the ground differs), whether points are kept apart or not. */
	public static String terrainKey(Minecraft mc) {
		return withMode(baseKey(mc), mode(mc));
	}

	/** The key a point shared with friends carries: the server (written the one way) or the world's name, as older SlashClients read it. */
	public static String sharedWorld(Minecraft mc) {
		String a = address(mc);
		if (a != null) return serverKey(a);
		MinecraftServer server = mc.getSingleplayerServer();
		return server == null ? "unknown" : OLD_WORLD + server.getWorldData().getLevelName();
	}

	/** Each tick: the mode from the tab list (twice a second), and a singleplayer world's points under its old name moved. */
	public static void tick(Minecraft mc) {
		String a = address(mc);
		if (a == null) {
			mode = null;
			modeBase = null;
			singleplayer(mc);
			return;
		}
		if (mc.level == null) return;
		long now = System.currentTimeMillis();
		if (mc.level == modeLevel && now - modeCheckedAt < 500) return;
		modeLevel = mc.level;
		modeCheckedAt = now;
		String base = baseKey(mc);
		if (!base.equals(modeBase)) {
			modeBase = base;
			mode = null;
		}
		TabStatus.refresh();
		// a tab list that says nothing (yet) keeps the mode last read on this server
		String m = TabStatus.modeOnTab(mc, a);
		if (m != null && !m.equals(mode)) {
			mode = m;
			String key = withMode(base, m);
			if (!m.equals(settings().modes.get(key))) {
				settings().modes.put(key, m);
				saveSettings();
			}
		}
	}

	/** For the test: the mode read from the tab list now. */
	public static void readModeNow(Minecraft mc) {
		modeCheckedAt = 0;
		modeLevel = null;
		tick(mc);
	}

	public static void resetForTest() {
		serverForTest = null;
		mode = null;
		modeBase = null;
		cachedAddress = null;
		cachedServer = null;
		migratedServer = null;
	}

	// ---------- singleplayer: from the name to the folder ----------

	private static MinecraftServer migratedServer;

	static void rerunSingleplayerForTest() {
		migratedServer = null;
	}

	private static void singleplayer(Minecraft mc) {
		MinecraftServer server = mc.getSingleplayerServer();
		if (server == null || mc.level == null || server == migratedServer) return;
		migratedServer = server;
		String folder = folder(server), name = server.getWorldData().getLevelName();
		if (!name.equals(settings().names.get(SAVE + folder))) {
			settings().names.put(SAVE + folder, name);
			saveSettings();
		}
		List<Waypoints.Point> old = Waypoints.lists().get(OLD_WORLD + name);
		if (old == null || old.isEmpty()) return;
		// which other worlds have this name: the list of worlds, read off the game's thread
		try {
			var candidates = mc.getLevelSource().findLevelCandidates();
			mc.getLevelSource().loadLevelSummaries(candidates).thenAccept(summaries -> {
				List<String> folders = new ArrayList<>();
				for (var s : summaries) if (s != null && name.equals(s.getLevelName())) folders.add(s.getLevelId());
				mc.execute(() -> {
					if (moveOldWorld(Waypoints.lists(), folder, name, folders)) {
						SlashHud.LOG.info("SlashClient: waypoints of \"{}\" now kept by its folder \"{}\"", name, folder);
						Waypoints.save();
					}
				});
			}).exceptionally(e -> {
				SlashHud.LOG.warn("SlashClient: waypoints: the worlds' list: {}", e.toString());
				return null;
			});
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: waypoints: the worlds' list: {}", e.toString());
		}
	}

	/**
	 * Moves the points kept under a world's name to its folder, when no other world (folder) has that
	 * name: `folders` are the worlds of that name the game lists (the open one may be missing, as it is
	 * locked). Two worlds of the same name: left as they are, for the move by hand. True when moved.
	 */
	public static boolean moveOldWorld(Map<String, List<Waypoints.Point>> all, String folder, String name, List<String> folders) {
		String old = OLD_WORLD + name;
		List<Waypoints.Point> list = all.get(old);
		if (list == null || list.isEmpty()) return false;
		for (String f : folders) if (!f.equals(folder)) return false;
		Waypoints.backupOnce();
		merge(all, old, SAVE + folder);
		return true;
	}

	// ---------- moving points between keys ----------

	/** Every key written the one way; lists under two spellings of one server put together. True when something changed. */
	public static boolean normalizeKeys(Map<String, List<Waypoints.Point>> all) {
		boolean changed = false;
		for (String k : new ArrayList<>(all.keySet())) {
			String n = normalize(k);
			if (n.equals(k)) continue;
			if (!changed) Waypoints.backupOnce();
			merge(all, k, n);
			changed = true;
		}
		return changed;
	}

	/** All points of `from` added to `to` (a point exactly like one already there only once); `from` gone. Returns how many moved. */
	public static int merge(Map<String, List<Waypoints.Point>> all, String from, String to) {
		if (from.equals(to)) return 0;
		List<Waypoints.Point> list = all.remove(from);
		if (list == null) return 0;
		List<Waypoints.Point> into = all.computeIfAbsent(to, k -> new ArrayList<>());
		int n = 0;
		for (Waypoints.Point p : list) {
			if (p == null) continue;
			n++;
			if (into.stream().noneMatch(q -> same(p, q))) into.add(p);
		}
		return n;
	}

	private static boolean same(Waypoints.Point a, Waypoints.Point b) {
		return a.x == b.x && a.y == b.y && a.z == b.z && a.color == b.color && a.visible == b.visible && a.death == b.death
			&& java.util.Objects.equals(a.name, b.name) && java.util.Objects.equals(a.dimension, b.dimension) && java.util.Objects.equals(a.from, b.from);
	}

	/** The other places with points, to move here: every key but this place's own and its modes, the most points first. */
	public static List<String> others(Minecraft mc) {
		String base = baseKey(mc);
		List<String> out = new ArrayList<>();
		for (var e : Waypoints.lists().entrySet()) {
			if (e.getValue() == null || e.getValue().isEmpty()) continue;
			if (base(e.getKey()).equals(base) || "unknown".equals(e.getKey())) continue;
			out.add(e.getKey());
		}
		out.sort((x, y) -> Integer.compare(Waypoints.lists().get(y).size(), Waypoints.lists().get(x).size()));
		return out;
	}

	/** Moves another place's points here: to the server's own list (they show in every mode) or the world's. */
	public static int moveHere(Minecraft mc, String from) {
		String base = baseKey(mc);
		if ("unknown".equals(base)) return 0;
		Waypoints.backupOnce();
		int n = merge(Waypoints.lists(), from, base);
		Waypoints.save();
		return n;
	}

	/** Whether the point shows in every mode of this server (it is in the server's own list while modes are kept apart). */
	public static boolean everyMode(Minecraft mc, Waypoints.Point p) {
		String key = key(mc), base = baseKey(mc);
		if (key.equals(base)) return false;
		List<Waypoints.Point> list = Waypoints.lists().get(base);
		return list != null && list.stream().anyMatch(q -> q == p);
	}

	/** "Only this mode": a point shown in every mode goes to the mode the player is in. */
	public static void onlyThisMode(Minecraft mc, Waypoints.Point p) {
		if (!everyMode(mc, p)) return;
		Waypoints.lists().get(baseKey(mc)).removeIf(q -> q == p);
		Waypoints.lists().computeIfAbsent(key(mc), k -> new ArrayList<>()).add(p);
		Waypoints.save();
	}

	// ---------- for the screens ----------

	/** A key as people read it: "skyup.pl · AnyBlock · S3 (Wyspy)", a world's name. */
	public static String describe(String key) {
		String base = base(key), m = key.length() > base.length() ? key.substring(base.length() + 1) : null;
		String place;
		if (base.startsWith(SERVER)) place = base.substring(SERVER.length());
		else if (base.startsWith(SAVE)) {
			String name = settings().names.get(base);
			place = name != null ? name : base.substring(SAVE.length());
		} else if (base.startsWith(OLD_WORLD)) place = base.substring(OLD_WORLD.length());
		else place = base;
		if (m != null) {
			String shown = settings().modes.get(key);
			place += " · " + (shown != null ? shown : m);
		}
		return place;
	}

	/** A key of a server (not a singleplayer world). */
	public static boolean isServer(String key) {
		return key.startsWith(SERVER);
	}

	/** A mode's name as shown, kept for a key that has one (from a friend's point, say). */
	public static void rememberMode(String key, String shown) {
		if (shown == null || key.indexOf(MODE) < 0 || shown.equals(settings().modes.get(key))) return;
		settings().modes.put(key, shown);
		saveSettings();
	}

	/** The name for a world's folder, as the game had it when last opened (for the test). */
	public static void rememberName(String folder, String name) {
		settings().names.put(SAVE + folder, name);
		saveSettings();
	}
}
