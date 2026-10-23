package dev.slash3rss.slashclient.hud;

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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Partner servers' animated icons: the owner uploads a GIF or APNG on the website, SlashClient's
 * server turns it into a vertical strip of square frames with a delay for each, and the server list
 * (ours and the game's own) plays it in place of the server's own icon. A strip is fetched and
 * decoded off the render thread the first time its server shows, becomes a texture, and is freed
 * again a little after it stopped showing. Until it is there (or when there is none) the server's
 * own icon shows as always.
 */
public final class PartnerIcons {
	private PartnerIcons() {}

	/** What the partner list says: the strip's address, a frame's side and each frame's time on screen. */
	record Anim(String url, int side, int[] delays) {}

	private record Loaded(Identifier id, int side, int frames) {}

	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
	/** How long a strip stays loaded after it was last drawn. */
	private static final long KEEP_MS = 15_000;
	/** Normalized server address → its animation. */
	private static volatile Map<String, Anim> anims = Map.of();
	/** Strip address → texture, once loaded. */
	private static final Map<String, Loaded> loaded = new ConcurrentHashMap<>();
	private static final Map<String, Boolean> loading = new ConcurrentHashMap<>();
	private static final Map<String, Long> drawn = new ConcurrentHashMap<>();
	private static final long START = System.currentTimeMillis();
	private static int counter;
	private static long sweptAt;

	/** The partner list's animations (a fresh answer replaces them all). */
	static void set(Map<String, Anim> next) {
		anims = Map.copyOf(next);
	}

	/**
	 * Draws a partner's animation `size` pixels big at (x, y); false when it has none or it is not
	 * loaded yet (the caller then draws the server's own icon).
	 */
	public static boolean draw(GuiGraphicsExtractor g, ServerData server, int x, int y, int size) {
		if (server == null || server.ip == null) return false;
		Anim a = anims.get(PartnerServers.normalize(server.ip));
		if (a == null) return false;
		long now = System.currentTimeMillis();
		drawn.put(a.url(), now);
		Loaded l = loaded.get(a.url());
		if (l == null) {
			load(a);
			return false;
		}
		int frame = Math.min(l.frames() - 1, frameAt(a.delays(), now - START));
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, l.id(), x, y, 0, frame * l.side(), size, size, l.side(), l.side(), l.side(), l.side() * l.frames(), 0xFFFFFFFF);
		return true;
	}

	/** Which frame shows `ms` into the animation (it loops). */
	static int frameAt(int[] delays, long ms) {
		if (delays.length <= 1) return 0;
		long total = 0;
		for (int d : delays) total += Math.max(20, d);
		long t = Math.floorMod(ms, total);
		for (int i = 0; i < delays.length; i++) {
			t -= Math.max(20, delays[i]);
			if (t < 0) return i;
		}
		return delays.length - 1;
	}

	/** Fetches and decodes a strip on the network's threads; only making the texture waits for the render thread. */
	private static void load(Anim a) {
		if (loading.putIfAbsent(a.url(), true) != null) return;
		HttpRequest request = HttpRequest.newBuilder(URI.create(a.url())).timeout(Duration.ofSeconds(15)).GET().build();
		HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray()).thenAccept(res -> {
			if (res.statusCode() != 200) {
				loading.remove(a.url());
				return;
			}
			NativeImage image;
			try {
				image = NativeImage.read(res.body());
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient: partner icon {}: {}", a.url(), e.toString());
				loading.remove(a.url());
				return;
			}
			Minecraft.getInstance().execute(() -> register(a.url(), image));
		}).exceptionally(err -> {
			loading.remove(a.url());
			return null;
		});
	}

	/** On the render thread: a strip as a texture of its own (one square column of frames). */
	private static void register(String url, NativeImage image) {
		try {
			int side = image.getWidth(), frames = side <= 0 ? 0 : image.getHeight() / side;
			if (frames < 1 || image.getHeight() % side != 0) {
				image.close();
				return;
			}
			Identifier id = Identifier.fromNamespaceAndPath(SlashHud.ID, "partner_icon/" + counter++);
			Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "SlashClient partner icon", image));
			loaded.put(url, new Loaded(id, side, frames));
		} finally {
			loading.remove(url);
		}
	}

	/** Each tick: strips not drawn for a while are freed. */
	static void tick(Minecraft mc) {
		long now = System.currentTimeMillis();
		if (now - sweptAt < 1000 || loaded.isEmpty()) return;
		sweptAt = now;
		for (var e : Map.copyOf(loaded).entrySet()) {
			Long last = drawn.get(e.getKey());
			if (last == null || now - last > KEEP_MS) {
				loaded.remove(e.getKey());
				drawn.remove(e.getKey());
				mc.getTextureManager().release(e.getValue().id());
			}
		}
	}

	/** Whether this strip is loaded now (for the test). */
	public static boolean loadedForTest(ServerData server) {
		Anim a = server == null ? null : anims.get(PartnerServers.normalize(server.ip));
		return a != null && loaded.containsKey(a.url());
	}

	public static int loadedCountForTest() {
		return loaded.size();
	}

	/**
	 * For the test: a partner with a made-up animation of `frames` frames (each a different colour,
	 * with a white square that moves along), as if the server had sent it; no network.
	 */
	public static void sampleForTest(String address, int frames, int delay) {
		int side = 32;
		NativeImage image = new NativeImage(side, side * frames, false);
		for (int f = 0; f < frames; f++) {
			int hue = 0xFF000000 | java.awt.Color.HSBtoRGB(f / (float) frames, 0.75f, 0.9f);
			for (int px = 0; px < side; px++) for (int py = 0; py < side; py++) {
				boolean dot = px >= 4 + f * 4 && px < 12 + f * 4 && py >= 12 && py < 20;
				int rgb = dot ? 0xFFFFFFFF : hue;
				image.setPixel(px, f * side + py, rgb);
			}
		}
		String url = "test:" + address;
		loaded.remove(url);
		register(url, image);
		int[] delays = new int[frames];
		java.util.Arrays.fill(delays, delay);
		Map<String, Anim> next = new java.util.HashMap<>(anims);
		next.put(PartnerServers.normalize(address), new Anim(url, side, delays));
		anims = Map.copyOf(next);
		drawn.put(url, System.currentTimeMillis());
	}

	/** For the test: the frame drawn now for this partner, or -1. */
	public static int frameForTest(String address) {
		Anim a = anims.get(PartnerServers.normalize(address));
		return a == null ? -1 : frameAt(a.delays(), System.currentTimeMillis() - START);
	}
}
