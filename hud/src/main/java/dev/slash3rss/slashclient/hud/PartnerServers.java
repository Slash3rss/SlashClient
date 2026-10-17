package dev.slash3rss.slashclient.hud;

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

	/** Asks SlashClient's server for the partners, when the server list opens. */
	public static void refresh() {
		String server = Badges.server;
		if (server == null || System.currentTimeMillis() - fetchedAt < REFRESH_MS) return;
		fetchedAt = System.currentTimeMillis();
		HttpRequest request = HttpRequest.newBuilder(URI.create(server + "/v1/partners")).timeout(Duration.ofSeconds(8)).GET().build();
		HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString()).thenAccept(res -> {
			if (res.statusCode() != 200) return;
			Map<String, String> next = new ConcurrentHashMap<>();
			java.util.Set<String> all = ConcurrentHashMap.newKeySet();
			for (JsonElement e : GSON.fromJson(res.body(), JsonObject.class).getAsJsonArray("partners")) {
				JsonObject p = e.getAsJsonObject();
				String address = normalize(p.get("address").getAsString());
				all.add(address);
				if (p.has("background") && !p.get("background").isJsonNull()) next.put(address, server + p.get("background").getAsString());
			}
			partners = all;
			backgrounds = next;
			next.values().forEach(PartnerServers::load);
		}).exceptionally(err -> {
			SlashHud.LOG.debug("SlashClient: partner servers: {}", err.toString());
			return null;
		});
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
		String url = backgrounds.get(normalize(server.ip));
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
		return server != null && partners.contains(normalize(server.ip));
	}

	/**
	 * The "Partner" badge: a small gold pill with a handshake, right after the server's name, or in
	 * the row's bottom right corner when a long name leaves no room next to the player count.
	 */
	public static void drawBadge(GuiGraphicsExtractor g, ServerData server, int x, int y, int w, int h) {
		if (!isPartner(server)) return;
		drawFrame(g, x, y, w, h);
		var font = Minecraft.getInstance().font;
		net.minecraft.network.chat.Component label = dev.slash3rss.slashclient.hud.ui.Ui.trBold("slashclient-hud.partner");
		int bw = 4 + 7 + 3 + font.width(label) + 5, bh = 11;
		// drawn at three quarters: a small mark next to the name, not a second title
		float s = 0.75f;
		int sw = Math.round(bw * s), sh = Math.round(bh * s);
		// the game writes the name at 32 + 3 px from the row's left edge, the player count at its right
		int bx = x + 35 + font.width(server.name == null ? "" : server.name) + 4, by = y + 1;
		if (bx + sw > x + w - 72) {
			bx = x + w - sw - 2;
			by = y + h - sh - 1;
		}
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
	private static void drawFrame(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		dev.slash3rss.slashclient.hud.ui.Ui.roundOutline(g, x - 2, y - 2, w + 4, h + 4, 3, 0x66B45309);
		dev.slash3rss.slashclient.hud.ui.Ui.roundOutline(g, x - 1, y - 1, w + 2, h + 2, 3, 0xFFF59E0B);
		dev.slash3rss.slashclient.hud.ui.Ui.roundOutline(g, x, y, w, h, 2, 0x80FDE68A);
		g.fill(x + 3, y - 1, x + w - 3, y, 0xFFFEF3C7);
	}

	/** For the test: a partner with a made-up picture, without the network. */
	public static void sampleForTest(String address) {
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
	}
}
