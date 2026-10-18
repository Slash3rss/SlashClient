package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.multiplayer.ServerData;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Partner servers the admin pinned (panel → Partnerzy) sit first in the multiplayer list: they are
 * added when missing, moved to the top when elsewhere, and cannot be deleted, moved, renamed or
 * re-addressed (see the server list mixins) — only their resource pack setting can be changed.
 * Pinned ones marked to rotate take turns at the very top, one step each time the list loads.
 * The list comes with the partners from SlashClient's server and is kept on disk, so it is there
 * before the first answer.
 *
 * A pinned server is called by the name set in the panel, or by its address when there is none.
 * One already in the list under the game's default name ("Minecraft Server", e.g. added by hand or
 * by an older list) or under a name SlashClient gave it before is renamed; a name the player chose
 * stays.
 */
public final class PinnedServer {
	private PinnedServer() {}

	/** A pinned partner: its address (normalized), the name it gets in the list, and whether it rotates. */
	public record Pin(String address, String name, boolean rotate) {}

	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-pinned-servers.json");
	/** Address → the names SlashClient has given that pinned server, so a new name from the panel replaces them. */
	private static final Path GIVEN_FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-pinned-names.json");
	private static final Gson GSON = new Gson();
	/** The game's default server name, in English and Polish; the current language's is asked for as well. */
	private static final Set<String> DEFAULT_NAMES = Set.of("Minecraft Server", "Serwer Minecrafta");
	private static volatile List<Pin> pins = load();
	private static final Map<String, Set<String>> given = loadGiven();
	/** How far the rotating ones have turned (once per load of the list). */
	private static int turn;

	private static List<Pin> load() {
		try {
			if (Files.exists(FILE)) {
				List<Pin> read = GSON.fromJson(Files.readString(FILE, StandardCharsets.UTF_8), new TypeToken<List<Pin>>() {}.getType());
				if (read != null) return List.copyOf(read);
			}
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: pinned servers: {}", e.toString());
		}
		// before the server has said anything: SkyUp.pl, as it always was
		return List.of(new Pin("skyup.pl", "SkyUp.pl", false));
	}

	private static Map<String, Set<String>> loadGiven() {
		Map<String, Set<String>> out = new HashMap<>();
		try {
			if (Files.exists(GIVEN_FILE)) {
				Map<String, List<String>> read = GSON.fromJson(Files.readString(GIVEN_FILE, StandardCharsets.UTF_8), new TypeToken<Map<String, List<String>>>() {}.getType());
				if (read != null) read.forEach((address, names) -> out.put(address, new HashSet<>(names)));
			}
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: pinned server names: {}", e.toString());
		}
		return out;
	}

	/** Remembers that SlashClient called this server so (kept on disk when it is new). */
	private static synchronized void remember(String address, String name) {
		if (!given.computeIfAbsent(address, a -> new HashSet<>()).add(name)) return;
		try {
			Files.writeString(GIVEN_FILE, GSON.toJson(given), StandardCharsets.UTF_8);
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: pinned server names: {}", e.toString());
		}
	}

	/** The name a pinned server has in the list: the one from the panel, or its address. */
	static String nameOf(Pin pin) {
		return pin.name() == null || pin.name().isBlank() ? pin.address() : pin.name().trim();
	}

	/**
	 * Whether `name`, on the pinned server `pin` already in the list, was not chosen by the player:
	 * none, the game's default one, the address itself, or one SlashClient gave it earlier.
	 */
	static boolean renamable(String name, Pin pin, Set<String> defaults, Set<String> earlier) {
		if (name == null || name.isBlank()) return true;
		String n = name.trim();
		return defaults.contains(n) || PartnerServers.normalize(n).equals(pin.address()) || earlier.contains(n);
	}

	private static Set<String> defaultNames() {
		Set<String> out = new HashSet<>(DEFAULT_NAMES);
		try {
			out.add(net.minecraft.client.resources.language.I18n.get("selectServer.defaultName"));
		} catch (Exception e) {
			// the language is not loaded yet: the known ones will do
		}
		return out;
	}

	/** The pinned partners, from the server's answer (kept for the next start). */
	static void set(List<Pin> next) {
		if (next.equals(pins)) return;
		// the names they had until now become "given by SlashClient", so the new ones replace them
		for (Pin old : pins) remember(old.address(), nameOf(old));
		pins = List.copyOf(next);
		try {
			Files.writeString(FILE, GSON.toJson(pins), StandardCharsets.UTF_8);
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: pinned servers: {}", e.toString());
		}
	}

	public static List<Pin> pins() {
		return pins;
	}

	public static boolean is(ServerData server) {
		if (server == null || server.ip == null) return false;
		String ip = PartnerServers.normalize(server.ip);
		for (Pin p : pins) if (p.address().equals(ip)) return true;
		return false;
	}

	/** The order on top of the list: the rotating ones first, turned one step each load, then the fixed ones. */
	static List<Pin> order(List<Pin> all, int turn) {
		List<Pin> rotating = new ArrayList<>(), fixed = new ArrayList<>();
		for (Pin p : all) (p.rotate() ? rotating : fixed).add(p);
		List<Pin> out = new ArrayList<>();
		for (int i = 0; i < rotating.size(); i++) out.add(rotating.get((i + turn) % rotating.size()));
		out.addAll(fixed);
		return out;
	}

	/** Puts the pinned partners at the top of `servers`, adding the ones not there and naming them. */
	public static void ensure(List<ServerData> servers) {
		List<Pin> order = order(pins, turn++);
		Set<String> defaults = defaultNames();
		for (int i = order.size() - 1; i >= 0; i--) {
			Pin pin = order.get(i);
			ServerData found = null;
			for (ServerData s : servers) {
				if (s.ip != null && PartnerServers.normalize(s.ip).equals(pin.address())) {
					found = s;
					break;
				}
			}
			String name = nameOf(pin);
			if (found == null) found = new ServerData(name, pin.address(), ServerData.Type.OTHER);
			else {
				servers.remove(found);
				Set<String> earlier;
				synchronized (PinnedServer.class) {
					earlier = Set.copyOf(given.getOrDefault(pin.address(), Set.of()));
				}
				if (!name.equals(found.name) && renamable(found.name, pin, defaults, earlier)) found.name = name;
			}
			if (name.equals(found.name)) remember(pin.address(), name);
			servers.add(0, found);
		}
	}

	/** Whether swapping these two positions would move a pinned server. */
	public static boolean blocksSwap(List<ServerData> servers, int a, int b) {
		return touches(servers, a) || touches(servers, b);
	}

	private static boolean touches(List<ServerData> servers, int i) {
		return i >= 0 && i < servers.size() && is(servers.get(i));
	}

	/** For the test: these partners pinned, as if the server had said so. */
	public static void sampleForTest(List<Pin> next) {
		pins = List.copyOf(next);
		turn = 0;
	}
}
