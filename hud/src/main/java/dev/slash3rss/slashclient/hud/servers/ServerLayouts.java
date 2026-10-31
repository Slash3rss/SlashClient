package dev.slash3rss.slashclient.hud.servers;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.chat.ChatLook;
import dev.slash3rss.slashclient.hud.chat.ChatTabs;

/**
 * HUD layouts per server, in config/slashclient-hud-servers.json: a layout saved for a server's
 * address (normalized as the partner list does it) comes on by itself when joining it, and the
 * player's own layout comes back in singleplayer and on other servers.
 *
 * A layout is the HUD's look only: the modules' places and their own settings, the game's parts,
 * the HUD-wide colour and background, and the chat's size and opacity. The extras, the chat tabs
 * and the rest of the settings stay the same everywhere. While a server's layout is on, the
 * player's own one waits in this file ("standard"), so it is never lost, even when the game is
 * closed on the server: the next start puts it back. The share codes are made from the HUD as it
 * is now and know nothing of this file.
 */
public final class ServerLayouts {
	private ServerLayouts() {}

	/** HudConfig's fields that belong to a layout. */
	static final List<String> KEYS = List.of("modules", "textColor", "background", "textShadow",
		"scoreboard", "scoreboardScale", "scoreboardOffset", "scoreboardNumbers", "bossBar", "bossBarScale", "bossBarOffset",
		"tabScale", "tabNumericPing", "titles", "titleScale", "actionBar", "actionBarScale",
		"clockSeconds", "clock12h", "coordsDecimals", "coordsFacing", "fpsColored", "effectIcons", "chatScaleExtra");
	/** The game's own chat options a layout carries too. */
	private static final String CHAT_SCALE = "gameChatScale", CHAT_BACKGROUND = "gameChatBackground";

	private static final class Store {
		/** Server address to its layout, in the order they were saved. */
		Map<String, JsonObject> layouts = new LinkedHashMap<>();
		/** The player's own layout while a server's is on, else null. */
		JsonObject standard;
		/** The server whose layout is on now, else null. */
		String active;
	}

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-hud-servers.json");
	private static Store store = new Store();
	/** For the test: taken as the address of the server the game is on (null: the real one). */
	public static String testAddress;

	public static void register() {
		load();
		// closed while on a server's layout last time: the player's own comes back before anything is drawn
		net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents.CLIENT_STARTED.register(mc -> {
			if (store.active != null) switchTo(null);
		});
		net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents.JOIN.register((handler, sender, mc) -> switchTo(address(mc)));
		net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents.DISCONNECT.register((handler, mc) -> mc.execute(() -> switchTo(null)));
	}

	private static void load() {
		try {
			if (!Files.exists(FILE)) return;
			Store read = GSON.fromJson(Files.readString(FILE), Store.class);
			if (read == null) return;
			if (read.layouts == null) read.layouts = new LinkedHashMap<>();
			read.layouts.values().removeIf(Objects::isNull);
			store = read;
		} catch (IOException | JsonParseException e) {
			SlashHud.LOG.warn("Nie udało się wczytać {}: {}", FILE, e.toString());
		}
	}

	private static void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(store));
		} catch (IOException e) {
			SlashHud.LOG.warn("Nie udało się zapisać {}: {}", FILE, e.toString());
		}
	}

	/** The normalized address of the server the game is on; null in singleplayer and out of a world. */
	public static String address(Minecraft mc) {
		if (testAddress != null) return testAddress;
		var server = mc.getCurrentServer();
		if (server == null || server.ip == null || mc.hasSingleplayerServer()) return null;
		String a = PartnerServers.normalize(server.ip);
		return a.isEmpty() ? null : a;
	}

	/** The servers with a layout of their own. */
	public static List<String> servers() {
		return new ArrayList<>(store.layouts.keySet());
	}

	public static boolean has(String server) {
		return server != null && store.layouts.containsKey(server);
	}

	/** The server whose layout is on now, or null for the player's own. */
	public static String active() {
		return store.active;
	}

	/**
	 * Puts on the layout for this server (null: none), keeping what changed in the one that was
	 * on: a server's back into its layout, the player's own into "standard".
	 */
	public static void switchTo(String server) {
		if (SlashHud.config == null) return;
		String target = has(server) ? server : null;
		if (Objects.equals(target, store.active)) return;
		if (store.active != null) store.layouts.put(store.active, capture());
		else store.standard = capture();
		apply(target != null ? store.layouts.get(target) : store.standard);
		if (target == null) store.standard = null;
		store.active = target;
		save();
	}

	/** The HUD as it is now becomes this server's layout, and is on from now: the editor's changes go to it. */
	public static void saveFor(String server) {
		if (server == null) return;
		if (store.active == null) store.standard = capture();
		else if (!store.active.equals(server)) store.layouts.put(store.active, capture());
		store.layouts.put(server, capture());
		store.active = server;
		save();
	}

	/** What changed in the editor goes into the server's layout that is on (called when it closes). */
	public static void remember() {
		if (store.active == null || SlashHud.config == null) return;
		store.layouts.put(store.active, capture());
		save();
	}

	/** A server's layout forgotten; when it is on, the player's own comes back. */
	public static void delete(String server) {
		if (server == null) return;
		if (server.equals(store.active)) {
			apply(store.standard);
			store.standard = null;
			store.active = null;
		}
		store.layouts.remove(server);
		save();
	}

	/** The layout part of the HUD as it is now. */
	private static JsonObject capture() {
		JsonObject all = GSON.toJsonTree(SlashHud.config).getAsJsonObject(), out = new JsonObject();
		for (String key : KEYS) if (all.has(key)) out.add(key, all.get(key).deepCopy());
		Minecraft mc = Minecraft.getInstance();
		if (mc != null && mc.options != null) {
			out.addProperty(CHAT_SCALE, mc.options.chatScale().get());
			out.addProperty(CHAT_BACKGROUND, mc.options.textBackgroundOpacity().get());
		}
		return out;
	}

	/** Puts a layout on the HUD; the settings that are not part of it stay as they are. */
	private static void apply(JsonObject layout) {
		if (layout == null) return;
		HudConfig cfg = SlashHud.config;
		JsonObject all = GSON.toJsonTree(cfg).getAsJsonObject();
		for (String key : KEYS) if (layout.has(key)) all.add(key, layout.get(key).deepCopy());
		HudConfig merged = GSON.fromJson(all, HudConfig.class);
		if (merged == null) return;
		cfg.copyFrom(HudConfig.fillMissing(merged));
		ChatTabs.changed();
		Minecraft mc = Minecraft.getInstance();
		if (mc != null && mc.options != null) {
			try {
				if (layout.has(CHAT_SCALE)) mc.options.chatScale().set(Math.max(0, Math.min(1, layout.get(CHAT_SCALE).getAsDouble())));
				if (layout.has(CHAT_BACKGROUND)) mc.options.textBackgroundOpacity().set(Math.max(0, Math.min(1, layout.get(CHAT_BACKGROUND).getAsDouble())));
			} catch (RuntimeException e) {
				SlashHud.LOG.warn("Zły układ czatu w {}: {}", FILE, e.toString());
			}
			mc.options.save();
			ChatLook.rescale(mc);
		}
	}

	/** For the test: forgets every layout without touching the HUD. */
	public static void clearForTest() {
		store = new Store();
		save();
	}
}
