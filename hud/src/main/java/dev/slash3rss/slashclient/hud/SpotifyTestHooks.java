package dev.slash3rss.slashclient.hud;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.spotify.SpotifyNow;
import dev.slash3rss.slashclient.hud.spotify.SpotifySettings;

/**
 * For the in-game test of the "Spotify" module (GameSpotify): answers as the launcher's bridge
 * gives them (/spotify/now) fed in, a made-up cover, the module's settings set, what it shows.
 */
public final class SpotifyTestHooks {
	private SpotifyTestHooks() {}

	public static final String COVER = "ab67616d00004851c0ffee00c0ffee00c0ffee00";

	private static SpotifyModule module() {
		for (HudModule m : SlashHud.MODULES) if (m instanceof SpotifyModule s) return s;
		throw new IllegalStateException("no Spotify module");
	}

	/** An answer of /spotify/now: a track (null: nothing plays), linked or not. */
	public static JsonObject answer(boolean linked, String title, boolean playing, long progressMs, long durationMs, String... artists) {
		JsonObject o = new JsonObject();
		o.addProperty("available", true);
		o.addProperty("linked", linked);
		if (title != null) {
			JsonObject t = new JsonObject();
			t.addProperty("kind", "track");
			t.addProperty("title", title);
			JsonArray a = new JsonArray();
			for (String x : artists) a.add(x);
			t.add("artists", a);
			t.addProperty("album", "Lato na serwerze");
			t.addProperty("cover", COVER);
			t.addProperty("durationMs", durationMs);
			t.addProperty("progressMs", progressMs);
			t.addProperty("isPlaying", playing);
			o.add("playing", t);
		} else o.add("playing", com.google.gson.JsonNull.INSTANCE);
		return o;
	}

	public static void feed(JsonObject answer) {
		SpotifyNow.sampleForTest(answer);
	}

	/** The parser on odd answers: what it keeps, one problem per line ("ok" when right). */
	public static String parser() {
		StringBuilder bad = new StringBuilder();
		JsonObject odd = answer(true, "Tytuł\u0000z\nśmieciami", true, 999_999, 200_000, "A", "B");
		odd.getAsJsonObject("playing").addProperty("cover", "../../etc/passwd");
		SpotifyNow.accept(odd);
		SpotifyNow.Track t = SpotifyNow.state().track();
		if (t == null) bad.append("no track\n");
		else {
			if (!t.title().equals("Tytuł z śmieciami")) bad.append("title ").append(t.title()).append('\n');
			if (!t.cover().isEmpty()) bad.append("cover kept: ").append(t.cover()).append('\n');
			if (t.progressMs() != 200_000) bad.append("progress ").append(t.progressMs()).append('\n');
			if (!t.artistLine().equals("A, B")) bad.append("artists ").append(t.artistLine()).append('\n');
		}
		// the time moves on while it plays, not while it is paused
		SpotifyNow.accept(answer(true, "X", true, 10_000, 200_000));
		SpotifyNow.State s = SpotifyNow.state();
		if (s.progress(s.at() + 2500) != 12_500) bad.append("playing progress ").append(s.progress(s.at() + 2500)).append('\n');
		SpotifyNow.accept(answer(true, "X", false, 10_000, 200_000));
		s = SpotifyNow.state();
		if (s.progress(s.at() + 2500) != 10_000) bad.append("paused progress ").append(s.progress(s.at() + 2500)).append('\n');
		SpotifyNow.accept(answer(true, "X", true, 199_000, 200_000));
		s = SpotifyNow.state();
		if (s.progress(s.at() + 5000) != 200_000) bad.append("past the end ").append(s.progress(s.at() + 5000)).append('\n');
		SpotifyNow.accept(null);
		if (SpotifyNow.state().linked() || SpotifyNow.state().track() != null) bad.append("null answer\n");
		if (!SpotifyModule.time(61_000).equals("1:01") || !SpotifyModule.time(3_725_000).equals("1:02:05")) bad.append("times ").append(SpotifyModule.time(61_000)).append('\n');
		return bad.isEmpty() ? "ok" : bad.toString();
	}

	public static void cover(byte[] png) throws java.io.IOException {
		SpotifyNow.sampleCoverForTest(COVER, png);
	}

	/** The module on, alone on the HUD's right side where the screenshots look, with these settings. */
	public static void configure(String layout, boolean cover, int coverSize, boolean album, boolean progress, boolean times, String accent, int width, boolean marquee) {
		HudConfig cfg = SlashHud.config;
		SpotifySettings s = new SpotifySettings();
		s.layout = layout;
		s.cover = cover;
		s.coverSize = coverSize;
		s.album = album;
		s.progress = progress;
		s.times = times;
		s.accent = accent;
		s.width = width;
		s.marquee = marquee;
		cfg.spotify = s.checked();
		HudConfig.Placement p = cfg.placement("spotify");
		p.enabled = true;
		p.ax = 1;
		p.ay = 0.3f;
		p.dx = -4;
		p.dy = 0;
		p.scale = 1.5f;
	}

	public static void set(java.util.function.Consumer<SpotifySettings> change) {
		change.accept(SlashHud.config.spotify);
	}

	/** What the module shows as text ("" when hidden). */
	public static String shown() {
		return module().shownText(net.minecraft.client.Minecraft.getInstance());
	}

	/** The settings' note on the account. */
	public static String infoKey() {
		return SpotifyModule.infoKey();
	}

	public static void reset() {
		SpotifyNow.sampleForTest(null);
		SlashHud.config.placement("spotify").enabled = false;
		SlashHud.config.placement("spotify").scale = 1f;
		SlashHud.config.spotify = new SpotifySettings();
	}
}
