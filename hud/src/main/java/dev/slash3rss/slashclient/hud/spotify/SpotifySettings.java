package dev.slash3rss.slashclient.hud.spotify;

/** The "Spotify" module's own settings (in config/slashclient-hud.json as "spotify"). */
public final class SpotifySettings {
	public static final String[] LAYOUTS = { "card", "line" };
	public static final String[] ACCENTS = { "spotify", "theme" };

	/** "card": the cover by the title, artists, album and the progress below; "line": one line. */
	public String layout = "card";
	/** The album's cover, and its size in the card (GUI pixels; the line has its own small one). */
	public boolean cover = true;
	public int coverSize = 36;
	public boolean title = true;
	public boolean artists = true;
	public boolean album = false;
	public boolean progress = true;
	/** "1:01 / 3:20". */
	public boolean times = true;
	/** "spotify": Spotify's green for the bar and the marks; "theme": the module's text colour. */
	public String accent = "spotify";
	/** A paused track stays (with the pause mark when `pausedMarker`); off: the module hides while paused. */
	public boolean showPaused = true;
	public boolean pausedMarker = true;
	/** Nothing plays (and nothing paused): the module hides; off: it says so. */
	public boolean hideIdle = true;
	/** The widest the module gets (GUI pixels); longer texts slide through (`marquee`) or are cut with "…". */
	public int width = 190;
	public boolean marquee = true;

	/** For Gson, so missing fields keep the defaults above. */
	public SpotifySettings() {}

	/** Values from a hand-edited file or an older version, kept in range. */
	public SpotifySettings checked() {
		layout = oneOf(layout, LAYOUTS);
		accent = oneOf(accent, ACCENTS);
		coverSize = Math.max(16, Math.min(64, coverSize));
		width = Math.max(100, Math.min(320, width));
		return this;
	}

	public SpotifySettings copy() {
		SpotifySettings s = new SpotifySettings();
		s.layout = layout;
		s.cover = cover;
		s.coverSize = coverSize;
		s.title = title;
		s.artists = artists;
		s.album = album;
		s.progress = progress;
		s.times = times;
		s.accent = accent;
		s.showPaused = showPaused;
		s.pausedMarker = pausedMarker;
		s.hideIdle = hideIdle;
		s.width = width;
		s.marquee = marquee;
		return s.checked();
	}

	private static String oneOf(String value, String[] allowed) {
		for (String a : allowed) if (a.equals(value)) return value;
		return allowed[0];
	}
}
