package dev.slash3rss.slashclient.hud;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.nowplaying.NowPlaying;
import dev.slash3rss.slashclient.hud.nowplaying.NowPlayingSettings;

/**
 * For the in-game test of the "Now playing" module (GameNowPlaying): answers as the launcher's bridge
 * gives them (/spotify/now) fed in, a made-up cover, the module's settings set, what it shows.
 */
public final class NowPlayingTestHooks {
	private NowPlayingTestHooks() {}

	public static final String COVER = "ab67616d00004851c0ffee00c0ffee00c0ffee00";

	private static NowPlayingModule module() {
		for (HudModule m : SlashHud.MODULES) if (m instanceof NowPlayingModule s) return s;
		throw new IllegalStateException("no Spotify module");
	}

	/** An answer of /spotify/now: a track from Spotify (null: nothing plays); `linked` false as older launchers said without a Spotify account. */
	public static JsonObject answer(boolean linked, String title, boolean playing, long progressMs, long durationMs, String... artists) {
		return answer(linked, "spotify", title, playing, progressMs, durationMs, artists);
	}

	/** The same from a given source ("spotify", "browser", "other"; "" as older launchers). */
	public static JsonObject answer(boolean linked, String source, String title, boolean playing, long progressMs, long durationMs, String... artists) {
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
			if (!source.isEmpty()) t.addProperty("source", source);
			o.add("playing", t);
		} else o.add("playing", com.google.gson.JsonNull.INSTANCE);
		return o;
	}

	public static void feed(JsonObject answer) {
		NowPlaying.sampleForTest(answer);
	}

	/** The parser on odd answers: what it keeps, one problem per line ("ok" when right). */
	public static String parser() {
		StringBuilder bad = new StringBuilder();
		JsonObject odd = answer(true, "Tytuł\u0000z\nśmieciami", true, 999_999, 200_000, "A", "B");
		odd.getAsJsonObject("playing").addProperty("cover", "../../etc/passwd");
		NowPlaying.accept(odd);
		NowPlaying.Track t = NowPlaying.state().track();
		if (t == null) bad.append("no track\n");
		else {
			if (!t.title().equals("Tytuł z śmieciami")) bad.append("title ").append(t.title()).append('\n');
			if (!t.cover().isEmpty()) bad.append("cover kept: ").append(t.cover()).append('\n');
			if (t.progressMs() != 200_000) bad.append("progress ").append(t.progressMs()).append('\n');
			if (!t.artistLine().equals("A, B")) bad.append("artists ").append(t.artistLine()).append('\n');
		}
		// the time moves on while it plays, not while it is paused
		NowPlaying.accept(answer(true, "X", true, 10_000, 200_000));
		NowPlaying.State s = NowPlaying.state();
		if (s.progress(s.at() + 2500) != 12_500) bad.append("playing progress ").append(s.progress(s.at() + 2500)).append('\n');
		NowPlaying.accept(answer(true, "X", false, 10_000, 200_000));
		s = NowPlaying.state();
		if (s.progress(s.at() + 2500) != 10_000) bad.append("paused progress ").append(s.progress(s.at() + 2500)).append('\n');
		NowPlaying.accept(answer(true, "X", true, 199_000, 200_000));
		s = NowPlaying.state();
		if (s.progress(s.at() + 5000) != 200_000) bad.append("past the end ").append(s.progress(s.at() + 5000)).append('\n');
		NowPlaying.accept(null);
		if (NowPlaying.state().linked() || NowPlaying.state().track() != null) bad.append("null answer\n");
		// where it plays: kept when known, "" from older launchers (counted as Spotify), odd ones dropped
		NowPlaying.accept(answer(true, "browser", "X", true, 0, 0));
		if (!"browser".equals(NowPlaying.state().track().source()) || NowPlaying.state().track().fromSpotify()) bad.append("browser source\n");
		NowPlaying.accept(answer(true, "", "X", true, 0, 0));
		if (!NowPlaying.state().track().fromSpotify()) bad.append("older launcher not Spotify\n");
		NowPlaying.accept(answer(true, "<script>", "X", true, 0, 0));
		if (!NowPlaying.state().track().source().isEmpty()) bad.append("odd source kept\n");
		if (!NowPlayingModule.time(61_000).equals("1:01") || !NowPlayingModule.time(3_725_000).equals("1:02:05")) bad.append("times ").append(NowPlayingModule.time(61_000)).append('\n');
		return bad.isEmpty() ? "ok" : bad.toString();
	}

	public static void cover(byte[] png) throws java.io.IOException {
		NowPlaying.sampleCoverForTest(COVER, png);
	}

	/** The module on, alone on the HUD's right side where the screenshots look, with these settings. */
	public static void configure(String layout, boolean cover, int coverSize, boolean album, boolean progress, boolean times, String accent, int width, boolean marquee) {
		HudConfig cfg = SlashHud.config;
		NowPlayingSettings s = new NowPlayingSettings();
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

	public static void set(java.util.function.Consumer<NowPlayingSettings> change) {
		change.accept(SlashHud.config.spotify);
	}

	/** What the module shows as text ("" when hidden). */
	public static String shown() {
		return module().shownText(net.minecraft.client.Minecraft.getInstance());
	}

	/** The settings' note on where it reads from. */
	public static String infoKey() {
		return NowPlayingModule.infoKey();
	}

	public static void reset() {
		NowPlaying.sampleForTest(null);
		SlashHud.config.placement("spotify").enabled = false;
		SlashHud.config.placement("spotify").scale = 1f;
		SlashHud.config.spotify = new NowPlayingSettings();
	}
}
