package dev.slash3rss.slashclient.hud.servers;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.CopyOnWriteArrayList;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Server resource packs, chosen per server: "prompt" (the game asks, as always), "accept" (downloaded
 * and applied without asking), "decline" (refused; a server that requires its pack may kick for it)
 * "ignore" (nothing is downloaded or applied, but the server hears that the pack loaded fine, so
 * servers that insist on their pack let the player in with their own textures) and "keep" (the pack
 * kept in the player's resource packs and switched on for good: not loaded again at every join;
 * KeptPacks).
 *
 * The first three are the game's own setting of a server in the list (its pack status), so that
 * stays in step; "ignore" is kept here by address (normalized like the partner servers), the game's
 * setting then being "prompt". Servers not in the list (direct connect, LAN, a world opened to LAN)
 * get the default from SlashClient's settings. The answers themselves are given in
 * mixin.ResourcePackPushMixin.
 */
public final class ServerPacks {
	private ServerPacks() {}

	public enum Mode {
		PROMPT, ACCEPT, DECLINE, IGNORE, KEEP;

		public String id() {
			return name().toLowerCase(Locale.ROOT);
		}

		public Mode next() {
			return values()[(ordinal() + 1) % values().length];
		}

		public static Mode of(String id) {
			for (Mode m : values()) if (m.id().equals(id)) return m;
			return PROMPT;
		}
	}

	/** The modes as the settings window lists them (the first is the default). */
	public static final String[] MODES = { "prompt", "accept", "decline", "ignore", "keep" };

	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-server-packs.json");
	private static final Gson GSON = new Gson();
	/** Normalized addresses set to "ignore", and those set to "keep" (a file of its own, so older mods read the first as before). */
	private static final Set<String> ignored = load(FILE);
	private static final Path KEEP_FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-server-packs-keep.json");
	private static final Set<String> kept = load(KEEP_FILE);
	/** The servers in the list as last loaded or saved (the game's own objects, so their setting is current). */
	private static volatile List<ServerData> listed = List.of();

	private static Set<String> load(Path file) {
		Set<String> out = new TreeSet<>();
		try {
			if (Files.exists(file)) {
				List<String> read = GSON.fromJson(Files.readString(file, StandardCharsets.UTF_8), new TypeToken<List<String>>() {}.getType());
				if (read != null) for (String a : read) out.add(PartnerServers.normalize(a));
			}
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: server packs: {}", e.toString());
		}
		return out;
	}

	private static void save() {
		try {
			Files.writeString(FILE, GSON.toJson(new ArrayList<>(ignored)), StandardCharsets.UTF_8);
			Files.writeString(KEEP_FILE, GSON.toJson(new ArrayList<>(kept)), StandardCharsets.UTF_8);
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: server packs: {}", e.toString());
		}
	}

	/** The mode of a server in the list (or being edited). */
	public static Mode of(ServerData server) {
		if (server == null) return Mode.PROMPT;
		synchronized (ignored) {
			if (server.ip != null && ignored.contains(PartnerServers.normalize(server.ip))) return Mode.IGNORE;
			if (server.ip != null && kept.contains(PartnerServers.normalize(server.ip))) return Mode.KEEP;
		}
		return switch (server.getResourcePackStatus()) {
			case ENABLED -> Mode.ACCEPT;
			case DISABLED -> Mode.DECLINE;
			default -> Mode.PROMPT;
		};
	}

	/** The game's own setting for `mode` ("ignore" leaves it asking, should SlashClient be gone one day). */
	public static void setVanilla(ServerData server, Mode mode) {
		server.setResourcePackStatus(switch (mode) {
			// kept: without SlashClient the game takes the pack by itself
			case ACCEPT, KEEP -> ServerData.ServerPackStatus.ENABLED;
			case DECLINE -> ServerData.ServerPackStatus.DISABLED;
			default -> ServerData.ServerPackStatus.PROMPT;
		});
	}

	/** After "Done" in the edit screen: "ignore" kept for the address the server has now, dropped from the one it had. */
	public static void remember(String oldAddress, String newAddress, Mode mode) {
		synchronized (ignored) {
			boolean changed = oldAddress != null && ignored.remove(PartnerServers.normalize(oldAddress));
			changed |= oldAddress != null && kept.remove(PartnerServers.normalize(oldAddress));
			if (mode == Mode.IGNORE && newAddress != null && !newAddress.isBlank()) changed |= ignored.add(PartnerServers.normalize(newAddress));
			if (mode == Mode.KEEP && newAddress != null && !newAddress.isBlank()) changed |= kept.add(PartnerServers.normalize(newAddress));
			if (changed) save();
		}
	}

	/** The servers in the list, each time it is loaded or saved. */
	public static void listed(List<ServerData> servers) {
		listed = List.copyOf(servers);
	}

	/** The mode for servers not in the list, from the settings. */
	public static Mode defaultMode() {
		return SlashHud.config == null ? Mode.PROMPT : Mode.of(SlashHud.config.serverPackDefault);
	}

	/** A server set to "keep" from outside its edit screen (SkyUp's question): by its address, and in the list when it is there. */
	public static void keep(ServerData server) {
		if (server == null || server.ip == null) return;
		synchronized (ignored) {
			ignored.remove(PartnerServers.normalize(server.ip));
			kept.add(PartnerServers.normalize(server.ip));
			save();
		}
		for (ServerData s : listed) if (s.ip != null && PartnerServers.normalize(s.ip).equals(PartnerServers.normalize(server.ip))) setVanilla(s, Mode.KEEP);
	}

	/** The mode for the server being joined: its own when it is in the list (by itself or by its address), else the default. */
	public static Mode forConnection(ServerData server) {
		if (server != null && server.ip != null) {
			// kept "for good" by its address (also joined without the list, e.g. SkyUp's question)
			synchronized (ignored) {
				if (kept.contains(PartnerServers.normalize(server.ip))) return Mode.KEEP;
			}
			List<ServerData> list = listed;
			for (ServerData s : list) if (s == server) return of(s);
			String ip = PartnerServers.normalize(server.ip);
			for (ServerData s : list) if (s.ip != null && PartnerServers.normalize(s.ip).equals(ip)) return of(s);
		}
		return defaultMode();
	}

	// ---- the edit screen ----

	/** The game's name for the setting ("Server Resource Packs"), under its key of this version. */
	public static Component settingName() {
		String key = net.minecraft.locale.Language.getInstance().has("manageServer.resourcePack") ? "manageServer.resourcePack" : "addServer.resourcePack";
		return Component.translatable(key);
	}

	/** "Server Resource Packs: Ignore", shortened when the button is too narrow for the full name of the mode. */
	public static Component buttonLabel(Mode mode, int width) {
		Component full = CommonComponents.optionNameValue(settingName(), Component.translatable("slashclient-hud.serverPacks.mode." + mode.id()));
		if (Minecraft.getInstance().font.width(full) <= width - 8) return full;
		return CommonComponents.optionNameValue(settingName(), Component.translatable("slashclient-hud.serverPacks.short." + mode.id()));
	}

	/** What the mode does, for the button's tooltip. */
	public static Component hint(Mode mode) {
		return Component.translatable("slashclient-hud.serverPacks.hint." + mode.id());
	}

	/** One short line under the button. */
	public static Component line(Mode mode) {
		return Component.translatable("slashclient-hud.serverPacks.line." + mode.id());
	}

	public static int lineColor(Mode mode) {
		return switch (mode) {
			case DECLINE -> 0xFFFCA5A5;
			case IGNORE -> 0xFFFDE68A;
			case ACCEPT -> 0xFF86EFAC;
			case KEEP -> 0xFF93C5FD;
			default -> 0xFFA0A0A0;
		};
	}

	/** How wide the tag is on screen. */
	public static int tagWidth(ServerData server) {
		return Math.round((Minecraft.getInstance().font.width(Ui.tr("slashclient-hud.serverPacks.tag." + of(server).id())) + 6) * 0.75f);
	}

	/** A small tag in the bottom right corner of a server's row in the list, when it does not just ask. */
	public static void drawTag(GuiGraphicsExtractor g, ServerData server, int x, int y, int w, int h) {
		if (server == null || w <= 0) return;
		Mode mode = of(server);
		if (mode == Mode.PROMPT) return;
		Component label = Ui.tr("slashclient-hud.serverPacks.tag." + mode.id());
		var font = Minecraft.getInstance().font;
		// drawn at three quarters, like the partner badge: a note, not a second title
		float s = 0.75f;
		int bw = font.width(label) + 6, bh = 10;
		int sw = Math.round(bw * s), sh = Math.round(bh * s);
		int bx = x + w - sw - 2, by = y + h - sh - 1;
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(bx, by);
		pose.scale(s, s);
		Ui.round(g, 0, 0, bw, bh, 3, 0xC0000000);
		Ui.draw(g, label, 3, 1, lineColor(mode));
		pose.popMatrix();
	}

	// ---- for the test ----

	/** What the client chose for the last pack the server sent. */
	public static volatile String lastDecision = "";
	/** What the (integrated) server heard back about packs, in order, while listening. */
	public static final List<String> heard = new CopyOnWriteArrayList<>();
	public static volatile boolean listening;

	public static void decided(Mode mode) {
		lastDecision = mode.id();
	}

	/** On the server: a client's answer about a pack (mixin.ResourcePackAnswerMixin). */
	public static void heard(String action) {
		if (listening) heard.add(action);
	}
}
