package dev.slash3rss.slashclient.hud.servers;

import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.social.Social;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Badges;

/**
 * Friends next to servers in the server list: the faces of SlashClient friends who play on that
 * server right now, from the same presence that says "Playing on …" in the friends window. A server
 * is the same place however it was typed (no :25565, any case) and under a partner's other
 * addresses. Friends who hide where they play (the server then sends no address), invisible or
 * muted ones never show; without a SlashClient account nothing does.
 */
public final class ServerFriends {
	private ServerFriends() {}

	/** At most this many faces in a row; the rest is "+N". */
	public static final int MAX_FACES = 3;

	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
	/** Friend id → their avatar's address on SlashClient's server ("/v1/head/<uuid>"), from the friends list. */
	private static final Map<String, String> avatars = new ConcurrentHashMap<>();
	private record Face(Identifier id, int width, int height) {}

	/** Avatar address → its texture once loaded; a failed one stays missing (the initial is drawn instead). */
	private static final Map<String, Face> faces = new ConcurrentHashMap<>();
	private static final Map<String, Boolean> asked = new ConcurrentHashMap<>();
	private static int counter;

	/** The friend's avatar, as the friends list gives it (Social.friendFrom). */
	public static void avatarFrom(String friendId, String avatar) {
		if (friendId == null || friendId.isEmpty()) return;
		if (avatar == null || avatar.isEmpty()) avatars.remove(friendId);
		else avatars.put(friendId, avatar);
	}

	/** "Play.Example.com.:25565" → "play.example.com"; a partner's other address → the partner's own. */
	static String place(String address) {
		String a = address == null ? "" : address.trim().toLowerCase(Locale.ROOT).replaceAll("\\.+(?=:\\d+$|$)", "");
		if (a.endsWith(":25565")) a = a.substring(0, a.length() - 6);
		if (a.isEmpty()) return "";
		String partner = PartnerServers.partnerKey(a);
		return partner != null ? partner : a;
	}

	/** Whether two addresses are the same server (the test checks the matching with it). */
	public static boolean samePlace(String a, String b) {
		String pa = place(a);
		return !pa.isEmpty() && pa.equals(place(b));
	}

	/** The friends on this server now, in the friends list's order; empty when switched off or not signed in. */
	public static List<Social.Friend> on(ServerData server) {
		if (server == null || SlashHud.config == null || !SlashHud.config.serverFriends) return List.of();
		if (!Social.available() || !Social.signedIn()) return List.of();
		String here = place(server.ip);
		if (here.isEmpty()) return List.of();
		List<Social.Friend> out = new ArrayList<>();
		for (Social.Friend f : Social.friends()) {
			// the server sends no address for a friend who hides it; muted friends stay quiet here too
			if (f.muted() || "offline".equals(f.status()) || "invisible".equals(f.status()) || !"server".equals(f.activity()) || f.server() == null || f.server().isEmpty()) continue;
			if (here.equals(place(f.server()))) out.add(f);
		}
		return out;
	}

	/** How wide the row of faces is at `size` pixels each (0 for nobody). */
	public static int width(List<Social.Friend> friends, int size) {
		if (friends.isEmpty()) return 0;
		int shown = Math.min(MAX_FACES, friends.size());
		int w = size + (shown - 1) * (size - 2);
		if (friends.size() > shown) w += 2 + Ui.width(more(friends));
		return w;
	}

	private static Component more(List<Social.Friend> friends) {
		return Ui.text("+" + (friends.size() - MAX_FACES));
	}

	/** The faces, slightly overlapping, with "+N" after them when there are more; (x, y) is the top left corner. */
	public static void draw(GuiGraphicsExtractor g, List<Social.Friend> friends, int x, int y, int size) {
		int shown = Math.min(MAX_FACES, friends.size());
		// the first one on top: drawn last
		for (int i = shown - 1; i >= 0; i--) face(g, friends.get(i), x + i * (size - 2), y, size);
		if (friends.size() > shown) Ui.draw(g, more(friends), x + size + (shown - 1) * (size - 2) + 2, y + (size - 8) / 2, Ui.TEXT_2);
	}

	/** One face in a thin dark frame; until it is loaded (or without one), the first letter on blue as in the friends window. */
	private static void face(GuiGraphicsExtractor g, Social.Friend f, int x, int y, int size) {
		g.fill(x - 1, y - 1, x + size + 1, y + size + 1, 0xFF0A0D14);
		Face tex = texture(f.id());
		if (tex != null) {
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, tex.id(), x, y, 0, 0, size, size, tex.width(), tex.height(), tex.width(), tex.height(), 0xFFFFFFFF);
			return;
		}
		g.fill(x, y, x + size, y + size, Ui.ACCENT_DARK);
		Component initial = Ui.bold(f.name().isEmpty() ? "?" : f.name().substring(0, 1).toUpperCase(Locale.ROOT));
		// the letter shrunk to the face (a small face in the game's list would cut it)
		float s = Math.min(1f, (size - 2) / 9f);
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x + size / 2f, y + size / 2f);
		pose.scale(s, s);
		Ui.draw(g, initial, -Ui.width(initial) / 2, -4, 0xFFFFFFFF);
		pose.popMatrix();
	}

	/**
	 * In the game's own server list: the faces right after the server's name (after the partner badge
	 * when it is there), or in the row's bottom right corner when a long name leaves no room before the
	 * player count; the names on hover, in the game's tooltip.
	 */
	public static void drawInRow(GuiGraphicsExtractor g, ServerData server, int x, int y, int w, int h, int mx, int my) {
		List<Social.Friend> friends = on(server);
		int fw = width(friends, 8);
		if (fw == 0 || w <= 0) return;
		var font = Minecraft.getInstance().font;
		// where PartnerServers.drawBadge puts its pill: after the name, or in the bottom right corner
		int afterName = x + 35 + font.width(server.name == null ? "" : server.name) + 4;
		boolean partner = PartnerServers.isPartner(server);
		boolean pillInline = partner && afterName + PartnerServers.pillWidth() <= x + w - 72;
		int fx = pillInline ? afterName + PartnerServers.pillWidth() + 3 : afterName, fy = y + 1;
		if (fx + fw > x + w - 72) {
			// beside the resource pack tag and a partner badge already in that corner
			fx = x + w - 2 - fw;
			if (ServerPacks.of(server) != ServerPacks.Mode.PROMPT) fx -= ServerPacks.tagWidth(server) + 3;
			if (partner && !pillInline) fx -= PartnerServers.pillWidth() + 3;
			fy = y + h - 9;
		}
		draw(g, friends, fx, fy, 8);
		if (mx >= fx - 1 && mx < fx + fw + 1 && my >= fy - 1 && my < fy + 9) {
			//#if MC >= 1.21.6
			g.setComponentTooltipForNextFrame(font, tip(friends), mx, my);
			//#else
			//$ if (Minecraft.getInstance().screen != null) Minecraft.getInstance().screen.setTooltipForNextRenderPass(tip(friends).stream().map(Component::getVisualOrderText).toList());
			//#endif
		}
	}

	/** The tooltip: who is there. */
	public static List<Component> tip(List<Social.Friend> friends) {
		List<Component> lines = new ArrayList<>();
		lines.add(Ui.tr("slashclient-hud.serverFriends.title", friends.size()));
		for (Social.Friend f : friends) lines.add(Ui.text("• " + f.name()));
		return lines;
	}

	/** The friend's face as a texture, asked for once (SlashClient's server cuts it from the skin, 8×8 scaled up). */
	private static Face texture(String friendId) {
		String avatar = avatars.get(friendId);
		if (avatar == null) return null;
		Face id = faces.get(avatar);
		if (id != null || asked.putIfAbsent(avatar, true) != null) return id;
		// only a Minecraft face from SlashClient's own server; a picture from a sign-in provider stays the initial
		String server = Badges.server;
		if (server == null || !avatar.startsWith("/v1/head/")) return null;
		HTTP.sendAsync(HttpRequest.newBuilder(URI.create(server + avatar)).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofByteArray())
			.thenAccept(res -> {
				if (res.statusCode() != 200) return;
				try {
					NativeImage image = NativeImage.read(res.body());
					if (image.getWidth() > 256 || image.getHeight() > 256) {
						image.close();
						return;
					}
					Minecraft.getInstance().execute(() -> register(avatar, image));
				} catch (Exception e) {
					SlashHud.LOG.debug("SlashClient: friend's face {}: {}", avatar, e.toString());
				}
			})
			.exceptionally(err -> null);
		return null;
	}

	private static void register(String avatar, NativeImage image) {
		Identifier id = Identifier.fromNamespaceAndPath(SlashHud.ID, "friend_face/" + counter++);
		int w = image.getWidth(), h = image.getHeight();
		Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "SlashClient friend's face", image));
		faces.put(avatar, new Face(id, w, h));
	}

	// ---------- for the test ----------

	/** A made-up face (8×8, one colour with darker eyes) for a test friend; on the game's thread. */
	public static void sampleFaceForTest(String friendId, int color) {
		NativeImage image = new NativeImage(8, 8, false);
		int dark = 0xFF000000 | (color >> 1 & 0x7F7F7F);
		for (int px = 0; px < 8; px++) {
			for (int py = 0; py < 8; py++) {
				// hair on top and the sides, eyes (white, then the pupil), a mouth
				boolean hair = py < 2 || py == 2 && (px == 0 || px == 7);
				boolean white = py == 4 && (px == 1 || px == 6), pupil = py == 4 && (px == 2 || px == 5);
				boolean mouth = py == 6 && px >= 3 && px <= 4;
				image.setPixel(px, py, white ? 0xFFFFFFFF : pupil ? 0xFF3B2A1A : hair || mouth ? dark : 0xFF000000 | color);
			}
		}
		String key = "test:" + friendId;
		avatars.put(friendId, key);
		asked.put(key, true);
		register(key, image);
	}
}
