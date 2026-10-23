package dev.slash3rss.slashclient.hud.spotify;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What plays on this computer, for the "Now playing" module (id "spotify"): asked of the launcher's
 * bridge (/spotify/now) on a thread of its own, only while the module is on (the launcher reads it
 * from the system: Spotify, a browser, another player). Between the answers the track's time moves
 * on here. Covers come through the launcher too (/spotify/cover/<id>, as a 64×64 PNG), once per
 * track; the last few stay as textures. Launchers 0.9.36–0.9.38 asked a linked Spotify account
 * instead: their answers read the same, without `source`.
 */
public final class SpotifyNow {
	private SpotifyNow() {}

	/** A track (or a podcast's episode) as the launcher passes it on; `source`: "spotify", "browser", "other" ("" from older launchers). */
	public record Track(String kind, String title, List<String> artists, String album, String cover, long durationMs, long progressMs, boolean playing, String source) {
		public boolean fromSpotify() {
			return source.isEmpty() || "spotify".equals(source);
		}

		public String artistLine() {
			return String.join(", ", artists);
		}
	}

	/**
	 * The last answer: `known` once the launcher answered; `available` and `linked` are always true
	 * from launchers that read the system (older ones asked a linked Spotify account); `track` null
	 * when nothing plays. `at`: when it came (System.currentTimeMillis), to move the time on.
	 */
	public record State(boolean known, boolean available, boolean linked, Track track, String error, long at) {
		/** Where the track is now: its time when it came plus what passed since, while it plays. */
		public long progress(long now) {
			if (track == null) return 0;
			long p = track.progressMs() + (track.playing() ? Math.max(0, now - at) : 0);
			return track.durationMs() > 0 ? Math.min(track.durationMs(), p) : p;
		}
	}

	private static final State UNKNOWN = new State(false, false, false, null, "", 0);
	private static volatile State state = UNKNOWN;

	private static final String URL = System.getProperty("slashclient.bridge", "");
	private static final String KEY = System.getProperty("slashclient.bridgeKey", "");
	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(3)).build();
	private static final Gson GSON = new Gson();
	private static final java.util.regex.Pattern COVER_ID = java.util.regex.Pattern.compile("[0-9a-f]{16,64}");
	/** A cover the launcher sends is 64×64; anything much bigger is not one. */
	private static final int MAX_COVER_BYTES = 256 * 1024;

	/** Made-up answers for the in-game test: no launcher asked. */
	private static volatile boolean sample;
	/** The module is on (from the game's tick); the thread asks only while it is. */
	private static volatile boolean wanted;
	private static volatile long wantedAt;
	private static Thread thread;
	/** Ask only for Spotify (the module's "Only Spotify"): browsers and other players are left out. */
	private static volatile boolean onlySpotify;

	public static State state() {
		return state;
	}

	/** A launcher gave the game its bridge. */
	public static boolean bridged() {
		return !URL.isEmpty() && !KEY.isEmpty();
	}

	/** From the game's tick: asks the launcher while the module is on, stops when it is switched off. */
	public static void tick(boolean on, boolean onlySpotify) {
		SpotifyNow.onlySpotify = onlySpotify;
		if (sample || !bridged()) return;
		wanted = on;
		if (on) wantedAt = System.currentTimeMillis();
		if (on) start();
	}

	private static synchronized void start() {
		if (thread != null && thread.isAlive()) return;
		thread = new Thread(SpotifyNow::run, "SlashClient Spotify");
		thread.setDaemon(true);
		thread.start();
	}

	private static void run() {
		int failures = 0;
		// the tick stops calling when the game is paused in a menu: the module counts as off a little later
		while (wanted && System.currentTimeMillis() - wantedAt < 3000 && !sample) {
			long wait;
			try {
				accept(fetchNow());
				failures = 0;
				State s = state;
				// playing: often enough for a new track to show soon; else less often
				wait = !s.available() ? 15_000 : s.track() != null && s.track().playing() ? 3000 : 5000;
			} catch (InterruptedException e) {
				return;
			} catch (Exception e) {
				failures++;
				SlashHud.LOG.debug("SlashClient: Spotify: {}", e.toString());
				wait = Math.min(30_000, 3000L * failures);
			}
			try {
				Thread.sleep(wait);
			} catch (InterruptedException e) {
				return;
			}
		}
	}

	private static JsonObject fetchNow() throws Exception {
		HttpResponse<String> res = get(onlySpotify ? "/spotify/now?only=spotify" : "/spotify/now");
		// a launcher before "Now playing" knows only the plain address (and only Spotify then)
		if (res.statusCode() != 200 && onlySpotify) res = get("/spotify/now");
		if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
		return GSON.fromJson(res.body(), JsonObject.class);
	}

	private static HttpResponse<String> get(String path) throws Exception {
		HttpRequest req = HttpRequest.newBuilder(URI.create(URL + path)).timeout(Duration.ofSeconds(15)).header("Authorization", "Bearer " + KEY).GET().build();
		return HTTP.send(req, HttpResponse.BodyHandlers.ofString());
	}

	// ---------- the launcher's answer ----------

	private static String str(JsonObject o, String key, int max) {
		JsonElement e = o == null ? null : o.get(key);
		if (e == null || !e.isJsonPrimitive()) return "";
		String s = e.getAsString().replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
		return s.length() > max ? s.substring(0, max) : s;
	}

	private static long num(JsonObject o, String key) {
		JsonElement e = o == null ? null : o.get(key);
		try {
			return e != null && e.isJsonPrimitive() ? Math.max(0, Math.min(24 * 3600_000L, e.getAsLong())) : 0;
		} catch (NumberFormatException ex) {
			return 0;
		}
	}

	private static boolean bool(JsonObject o, String key) {
		JsonElement e = o == null ? null : o.get(key);
		return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isBoolean() && e.getAsBoolean();
	}

	/** Takes an answer of /spotify/now (also what the in-game test feeds in). */
	public static void accept(JsonObject o) {
		Track track = null;
		JsonElement p = o == null ? null : o.get("playing");
		if (p != null && p.isJsonObject()) {
			JsonObject t = p.getAsJsonObject();
			String title = str(t, "title", 200);
			if (!title.isEmpty()) {
				List<String> artists = new ArrayList<>();
				JsonElement a = t.get("artists");
				if (a != null && a.isJsonArray()) for (JsonElement x : (JsonArray) a) {
					if (x.isJsonPrimitive() && artists.size() < 8) {
						String name = x.getAsString().replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
						if (!name.isEmpty()) artists.add(name.length() > 100 ? name.substring(0, 100) : name);
					}
				}
				String cover = str(t, "cover", 64);
				long duration = num(t, "durationMs");
				long progress = num(t, "progressMs");
				String source = str(t, "source", 10);
				track = new Track("episode".equals(str(t, "kind", 10)) ? "episode" : "track", title, List.copyOf(artists), str(t, "album", 200),
					COVER_ID.matcher(cover).matches() ? cover : "", duration, duration > 0 ? Math.min(duration, progress) : progress, bool(t, "isPlaying"),
					source.equals("spotify") || source.equals("browser") || source.equals("other") ? source : "");
			}
		}
		state = new State(true, bool(o, "available"), bool(o, "linked"), track, str(o, "error", 40), System.currentTimeMillis());
	}

	// ---------- covers ----------

	/** A cover as a texture: `id` null while it loads (or when it failed: `failed`). */
	private record Cover(Identifier id, boolean failed) {}

	private static final int KEEP = 4;
	/** By the cover's id on i.scdn.co, the newest last. */
	private static final Map<String, Cover> covers = new LinkedHashMap<>(8, 0.75f, true);
	private static int next;

	/** The cover's texture, or null while it loads, when it failed, or without a launcher. */
	public static synchronized Identifier cover(String coverId) {
		if (coverId == null || coverId.isEmpty()) return null;
		Cover c = covers.get(coverId);
		if (c == null) {
			if (!bridged() || !COVER_ID.matcher(coverId).matches()) return null;
			covers.put(coverId, new Cover(null, false));
			Thread.ofVirtual().start(() -> load(coverId));
			return null;
		}
		return c.id();
	}

	private static void load(String coverId) {
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create(URL + "/spotify/cover/" + coverId)).timeout(Duration.ofSeconds(20)).header("Authorization", "Bearer " + KEY).GET().build();
			HttpResponse<byte[]> res = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
			if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
			if (res.body().length > MAX_COVER_BYTES) throw new IllegalStateException("too big");
			NativeImage img;
			try (InputStream in = new ByteArrayInputStream(res.body())) {
				img = NativeImage.read(in);
			}
			if (img.getWidth() > 256 || img.getHeight() > 256) {
				img.close();
				throw new IllegalStateException("too big");
			}
			Minecraft.getInstance().execute(() -> {
				synchronized (SpotifyNow.class) {
					register(coverId, img);
				}
			});
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: Spotify cover {}: {}", coverId, e.toString());
			synchronized (SpotifyNow.class) {
				covers.put(coverId, new Cover(null, true));
			}
		}
	}

	/** On the game's thread: the picture as a texture; the oldest beyond a few go. */
	private static void register(String coverId, NativeImage img) {
		Minecraft mc = Minecraft.getInstance();
		Identifier id = Identifier.fromNamespaceAndPath("slashclient-hud", "spotify_cover/" + next++);
		mc.getTextureManager().register(id, new DynamicTexture(() -> "SlashClient Spotify cover", img));
		Cover before = covers.put(coverId, new Cover(id, false));
		if (before != null && before.id() != null) mc.getTextureManager().release(before.id());
		var it = covers.entrySet().iterator();
		while (covers.size() > KEEP && it.hasNext()) {
			var e = it.next();
			if (e.getKey().equals(coverId)) continue;
			it.remove();
			if (e.getValue().id() != null) mc.getTextureManager().release(e.getValue().id());
		}
	}

	// ---------- for the in-game test ----------

	/** Made-up answers from now on (no launcher asked); null goes back to the launcher's. */
	public static void sampleForTest(JsonObject answer) {
		sample = answer != null;
		if (answer != null) accept(answer);
		else state = UNKNOWN;
	}

	/** A made-up cover (PNG bytes) for that id; on the game's thread. */
	public static synchronized void sampleCoverForTest(String coverId, byte[] png) throws java.io.IOException {
		try (InputStream in = new ByteArrayInputStream(png)) {
			register(coverId, NativeImage.read(in));
		}
	}
}
