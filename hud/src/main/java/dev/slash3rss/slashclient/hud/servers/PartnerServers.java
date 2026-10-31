package dev.slash3rss.slashclient.hud.servers;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import dev.slash3rss.slashclient.hud.players.Badges;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Partner servers: SlashClient's server lists them with a background picture, drawn behind that
 * server in the game's server list. The list is asked for when the server list opens (at most
 * every few minutes); pictures are fetched once per version and kept as textures.
 */
public final class PartnerServers {
	private PartnerServers() {}

	private record Picture(Identifier id, int width, int height) {}

	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
	private static final Gson GSON = new Gson();
	private static final long REFRESH_MS = 5 * 60_000;
	/** Normalized address → the picture's address on the server (with its version). */
	private static volatile Map<String, String> backgrounds = Map.of();
	/** Every partner's normalized address, with a picture or without. */
	private static volatile java.util.Set<String> partners = java.util.Set.of();
	/** A partner's other addresses (another domain, a raw IP), normalized → that partner's own address. */
	private static volatile Map<String, String> aliases = Map.of();
	/** Picture address → texture, once loaded. */
	private static final Map<String, Picture> pictures = new ConcurrentHashMap<>();
	private static final Map<String, Boolean> loading = new ConcurrentHashMap<>();
	private static long fetchedAt;
	private static int counter;

	/** "SkyUp.pl:25565" → "skyup.pl", the form the server keeps. */
	static String normalize(String address) {
		String a = address == null ? "" : address.trim().toLowerCase(Locale.ROOT);
		if (a.endsWith(".")) a = a.substring(0, a.length() - 1);
		return a.endsWith(":25565") ? a.substring(0, a.length() - 6) : a;
	}

	/**
	 * The partner a server in the player's list is, as the server keeps it: the address itself, one of
	 * the partner's other addresses the admin listed ("1.2.3.4", "skyup.eu"), or a subdomain of either
	 * ("play.skyup.pl", "mc.skyup.eu:25565" → "skyup.pl"). The longest matching address wins. Null when
	 * it is no partner.
	 */
	public static String partnerKey(String address) {
		String a = normalize(address);
		if (a.isEmpty()) return null;
		java.util.Set<String> all = partners;
		Map<String, String> other = aliases;
		if (all.contains(a)) return a;
		String alias = other.get(a);
		if (alias != null) return alias;
		// a port other than 25565 belongs to the address: "mc.x.pl:25566" is x.pl's only if the partner has that port
		String best = null, key = null;
		for (String p : all) {
			if (a.endsWith("." + p) && (best == null || p.length() > best.length())) {
				best = p;
				key = p;
			}
		}
		for (Map.Entry<String, String> e : other.entrySet()) {
			String p = e.getKey();
			if (a.endsWith("." + p) && (best == null || p.length() > best.length())) {
				best = p;
				key = e.getValue();
			}
		}
		return key;
	}

	/** Asks SlashClient's server for the partners, when the server list opens. */
	public static void refresh() {
		String server = Badges.server;
		if (server == null || System.currentTimeMillis() - fetchedAt < REFRESH_MS) return;
		fetchedAt = System.currentTimeMillis();
		HttpRequest request = HttpRequest.newBuilder(URI.create(server + "/v1/partners")).timeout(Duration.ofSeconds(8)).GET().build();
		HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString()).thenAccept(res -> {
			if (res.statusCode() != 200) {
				retrySoon();
				return;
			}
			Map<String, String> next = new ConcurrentHashMap<>();
			java.util.Set<String> all = ConcurrentHashMap.newKeySet();
			java.util.List<PinnedServer.Pin> pins = new java.util.ArrayList<>();
			Map<String, PartnerIcons.Anim> icons = new java.util.HashMap<>();
			Map<String, String> other = new ConcurrentHashMap<>();
			boolean saysPinned = false;
			for (JsonElement e : GSON.fromJson(res.body(), JsonObject.class).getAsJsonArray("partners")) {
				JsonObject p = e.getAsJsonObject();
				String address = normalize(p.get("address").getAsString());
				all.add(address);
				// the partner's other addresses (older servers do not send them); pins stay on the main address
				if (p.has("aliases") && p.get("aliases").isJsonArray()) {
					for (JsonElement alias : p.getAsJsonArray("aliases")) {
						String a = alias.isJsonPrimitive() ? normalize(alias.getAsString()) : "";
						if (!a.isEmpty() && !a.equals(address)) other.putIfAbsent(a, address);
					}
				}
				// the ones the admin pinned on top of the server list (servers before 0.9.2 do not say)
				saysPinned |= p.has("pinned");
				if (p.has("pinned") && p.get("pinned").getAsBoolean()) {
					String name = p.has("name") && !p.get("name").isJsonNull() ? p.get("name").getAsString() : "";
					pins.add(new PinnedServer.Pin(address, name, p.has("rotate") && p.get("rotate").getAsBoolean()));
				}
				if (p.has("background") && !p.get("background").isJsonNull()) next.put(address, server + p.get("background").getAsString());
				// an animated icon in place of the server's own (older servers do not send one)
				if (p.has("icon") && !p.get("icon").isJsonNull() && p.has("iconDelays")) {
					var delays = p.getAsJsonArray("iconDelays");
					int[] times = new int[delays.size()];
					for (int i = 0; i < times.length; i++) times[i] = delays.get(i).getAsInt();
					if (times.length > 0) icons.put(address, new PartnerIcons.Anim(server + p.get("icon").getAsString(), p.has("iconSize") ? p.get("iconSize").getAsInt() : 0, times));
				}
			}
			// a partner's own address beats another partner's alias
			all.forEach(other::remove);
			partners = all;
			aliases = other;
			backgrounds = next;
			PartnerIcons.set(icons);
			if (saysPinned) PinnedServer.set(pins);
			next.values().forEach(PartnerServers::load);
		}).exceptionally(err -> {
			SlashHud.LOG.debug("SlashClient: partner servers: {}", err.toString());
			retrySoon();
			return null;
		});
	}

	/** No answer (no network for a moment, the server restarting): asked again in half a minute, not in five. */
	private static void retrySoon() {
		fetchedAt = System.currentTimeMillis() - REFRESH_MS + 30_000;
	}

	private static void load(String url) {
		if (pictures.containsKey(url) || loading.putIfAbsent(url, true) != null) return;
		HTTP.sendAsync(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15)).GET().build(), HttpResponse.BodyHandlers.ofByteArray())
			.thenAccept(res -> {
				if (res.statusCode() == 200) Minecraft.getInstance().execute(() -> register(url, res.body()));
				else loading.remove(url);
			})
			.exceptionally(err -> {
				loading.remove(url);
				return null;
			});
	}

	/** On the render thread: the picture becomes a texture of its own. */
	private static void register(String key, byte[] data) {
		try {
			NativeImage image = NativeImage.read(data);
			register(key, image);
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: partner server picture {}: {}", key, e.toString());
		} finally {
			loading.remove(key);
		}
	}

	private static void register(String key, NativeImage image) {
		Identifier id = Identifier.fromNamespaceAndPath(SlashHud.ID, "partner/" + counter++);
		int w = image.getWidth(), h = image.getHeight();
		Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "SlashClient partner server", image));
		pictures.put(key, new Picture(id, w, h));
	}

	/** Draws the partner's picture over the row (cut to fill it), dimmed so the game's text stays readable. */
	public static void drawBehind(GuiGraphicsExtractor g, ServerData server, int x, int y, int w, int h) {
		if (server == null || w <= 0 || h <= 0) return;
		String key = partnerKey(server.ip);
		String url = key == null ? null : backgrounds.get(key);
		Picture p = url == null ? null : pictures.get(url);
		if (p == null) return;
		// "cover": the part of the picture with the row's proportions, from its middle
		float row = (float) w / h, pic = (float) p.width() / p.height();
		int uw = p.width(), vh = p.height(), u = 0, v = 0;
		if (pic > row) {
			uw = Math.round(p.height() * row);
			u = (p.width() - uw) / 2;
		} else {
			vh = Math.round(p.width() / row);
			v = (p.height() - vh) / 2;
		}
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, p.id(), x, y, u, v, w, h, uw, vh, p.width(), p.height(), 0xFFFFFFFF);
		g.fill(x, y, x + w, y + h, 0x80000000);
	}

	public static boolean isPartner(ServerData server) {
		return server != null && partnerKey(server.ip) != null;
	}

	/**
	 * The "Partner" badge: a small gold pill with a handshake, right after the server's name, or in
	 * the row's bottom right corner when a long name leaves no room next to the player count.
	 */
	public static void drawBadge(GuiGraphicsExtractor g, ServerData server, int x, int y, int w, int h) {
		if (!isPartner(server)) return;
		drawFrame(g, x, y, w, h);
		var font = Minecraft.getInstance().font;
		int sw = pillWidth(), sh = pillHeight();
		// the game writes the name at 32 + 3 px from the row's left edge, the player count at its right
		int bx = x + 35 + font.width(server.name == null ? "" : server.name) + 4, by = y + 1;
		if (bx + sw > x + w - 72) {
			bx = x + w - sw - 2;
			by = y + h - sh - 1;
		}
		drawPill(g, bx, by);
	}

	/** The "Partner" pill's size on screen (drawn at three quarters: a small mark next to the name, not a second title). */
	public static int pillWidth() {
		net.minecraft.network.chat.Component label = dev.slash3rss.slashclient.hud.ui.Ui.trBold("slashclient-hud.partner");
		return Math.round((4 + 7 + 3 + Minecraft.getInstance().font.width(label) + 5) * 0.75f);
	}

	public static int pillHeight() {
		return Math.round(11 * 0.75f);
	}

	/** The gold "Partner" pill with its top left corner at (bx, by). */
	public static void drawPill(GuiGraphicsExtractor g, int bx, int by) {
		net.minecraft.network.chat.Component label = dev.slash3rss.slashclient.hud.ui.Ui.trBold("slashclient-hud.partner");
		int bw = 4 + 7 + 3 + Minecraft.getInstance().font.width(label) + 5, bh = 11;
		float s = 0.75f;
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(bx, by);
		pose.scale(s, s);
		// a soft shadow, the gold body with a lighter top, a thin bright edge on top
		dev.slash3rss.slashclient.hud.ui.Ui.round(g, 0, 1, bw, bh, 4, 0x55000000);
		dev.slash3rss.slashclient.hud.ui.Ui.round(g, 0, 0, bw, bh, 4, 0xFFD97706);
		g.fillGradient(2, 1, bw - 2, bh - 1, 0xFFFDE68A, 0xFFF59E0B);
		g.fill(3, 0, bw - 3, 1, 0xFFFEF3C7);
		dev.slash3rss.slashclient.hud.ui.Ui.icon(g, "partner", 4, 2, 7, 0xFF451A03);
		dev.slash3rss.slashclient.hud.ui.Ui.draw(g, label, 14, 2, 0xFF451A03);
		pose.popMatrix();
	}

	/**
	 * A gold frame around the row: a deep gold edge, a light inner line like polished metal, and
	 * a brighter strip along the top where the light falls.
	 */
	public static void drawFrame(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		// a thin gold line, lit a little from inside
		dev.slash3rss.slashclient.hud.ui.Ui.roundOutline(g, x - 1, y - 1, w + 2, h + 2, 3, 0xFFF59E0B);
		dev.slash3rss.slashclient.hud.ui.Ui.roundOutline(g, x, y, w, h, 2, 0x50FDE68A);
	}

	/** For the test: a partner with a made-up picture, without the network. */
	public static void sampleForTest(String address, String... otherAddresses) {
		NativeImage image = new NativeImage(600, 64, false);
		for (int px = 0; px < 600; px++) {
			for (int py = 0; py < 64; py++) {
				int r = 30 + px * 120 / 600, gr = 80 + py, b = 200 - px * 100 / 600;
				image.setPixel(px, py, 0xFF000000 | r << 16 | gr << 8 | b);
			}
		}
		String key = "test:" + address;
		register(key, image);
		Map<String, String> next = new ConcurrentHashMap<>(backgrounds);
		next.put(normalize(address), key);
		backgrounds = next;
		java.util.Set<String> all = ConcurrentHashMap.newKeySet();
		all.addAll(partners);
		all.add(normalize(address));
		partners = all;
		Map<String, String> other = new ConcurrentHashMap<>(aliases);
		for (String a : otherAddresses) other.put(normalize(a), normalize(address));
		aliases = other;
	}
}
