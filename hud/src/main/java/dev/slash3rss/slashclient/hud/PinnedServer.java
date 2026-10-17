package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.multiplayer.ServerData;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Partner servers the admin pinned (panel → Partnerzy) sit first in the multiplayer list: they are
 * added when missing, moved to the top when elsewhere, and cannot be deleted, moved, renamed or
 * re-addressed (see the server list mixins) — only their resource pack setting can be changed.
 * Pinned ones marked to rotate take turns at the very top, one step each time the list loads.
 * The list comes with the partners from SlashClient's server and is kept on disk, so it is there
 * before the first answer.
 */
public final class PinnedServer {
	private PinnedServer() {}

	/** A pinned partner: its address (normalized), the name it gets in the list, and whether it rotates. */
	public record Pin(String address, String name, boolean rotate) {}

	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-pinned-servers.json");
	private static final Gson GSON = new Gson();
	private static volatile List<Pin> pins = load();
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

	/** The pinned partners, from the server's answer (kept for the next start). */
	static void set(List<Pin> next) {
		if (next.equals(pins)) return;
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

	/** Puts the pinned partners at the top of `servers`, adding the ones not there. */
	public static void ensure(List<ServerData> servers) {
		List<Pin> order = order(pins, turn++);
		for (int i = order.size() - 1; i >= 0; i--) {
			Pin pin = order.get(i);
			ServerData found = null;
			for (ServerData s : servers) {
				if (s.ip != null && PartnerServers.normalize(s.ip).equals(pin.address())) {
					found = s;
					break;
				}
			}
			if (found == null) found = new ServerData(pin.name().isBlank() ? pin.address() : pin.name(), pin.address(), ServerData.Type.OTHER);
			else servers.remove(found);
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
