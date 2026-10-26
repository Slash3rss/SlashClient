package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.nowplaying.NowPlaying;
import dev.slash3rss.slashclient.hud.nowplaying.NowPlayingSettings;
import dev.slash3rss.slashclient.hud.ui.Catalog;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * "Now playing" (id "spotify"): what plays on this computer (Spotify, a browser, another player; read
 * by the launcher from the system), as a card (the cover by the title, the artists, the album and
 * the track's progress) or as one line.
 * What shows is up to the player: the cover and its size, each text, the bar, the times, Spotify's
 * green or the module's own colour, a paused track (with a pause mark) or none, nothing at all
 * while nothing plays, and the widest the module gets: longer texts slide through. The data comes
 * through the launcher (spotify/NowPlaying); between its answers the time moves on here. The editor
 * shows a made-up track until a real one plays.
 */
public final class NowPlayingModule implements HudModule {
	public static final int GREEN = 0xFF1ED760;
	private static final int ARTIST = 0xFFC8CDD5, ALBUM = 0xFF9AA1AD, MUTED = 0xFF8B93A1, TRACK = 0x55FFFFFF;
	private static final int ROW = 10;

	/** A made-up track for the editor (and the settings' preview) before a real one plays. */
	static final NowPlaying.Track SAMPLE = new NowPlaying.Track("track", "Nocna jazda przez neonowe miasto (Remix)", List.of("SlashBand", "DJ Kubełek"), "Neonowe miasto", "", 221_000, 83_000, true, "spotify");

	@Override
	public String id() {
		return "spotify";
	}

	private static NowPlayingSettings s() {
		return Modules.cfg.spotify;
	}

	private static boolean editor(Minecraft mc) {
		return Compat.screen(mc) instanceof HudEditScreen;
	}

	/** From the game's tick: the launcher is asked only while the module is on. */
	static void tick(Minecraft mc) {
		if (Modules.cfg != null) NowPlaying.tick(Modules.cfg.placement("spotify").enabled, Modules.cfg.spotify.onlySpotify);
	}

	// ---------- what shows ----------

	/** One frame's content: a track with where it is now, or a status line. */
	private record View(NowPlaying.Track track, long progress, Component status, boolean sample) {}

	private View view;
	private long viewAt;
	private boolean viewEditor;

	private View view(Minecraft mc) {
		boolean editor = editor(mc);
		long now = System.currentTimeMillis();
		if (view != null && now - viewAt < 15 && editor == viewEditor) return view;
		viewAt = now;
		viewEditor = editor;
		view = compute(editor, now);
		return view;
	}

	/** What to show now; null hides the module. */
	static View compute(boolean editor, long now) {
		NowPlayingSettings s = s();
		NowPlaying.State st = NowPlaying.state();
		NowPlaying.Track t = st.track();
		// "Only Spotify": a browser or another player counts as nothing (also from a launcher that did not leave them out)
		if (t != null && s.onlySpotify && !t.fromSpotify()) t = null;
		if (editor && t == null) {
			// the editor: a made-up track that moves, so every setting shows
			long p = SAMPLE.progressMs() + (now / 1000 % 60) * 1000;
			return new View(SAMPLE, Math.min(p, SAMPLE.durationMs()), null, true);
		}
		// no launcher or no answer yet: nothing to show
		if (!st.known() || !st.available()) return null;
		// an older launcher with no Spotify linked counts as nothing playing
		if (t == null || !st.linked()) return s.hideIdle ? null : new View(null, 0, Component.translatable("slashclient-hud.spotify.status.idle"), false);
		if (!t.playing() && !s.showPaused) return null;
		return new View(t, st.progress(now), null, false);
	}

	// ---------- sizes ----------

	private static int font(Minecraft mc, String text) {
		return mc.font.width(text);
	}

	/** Text lines of the card, in order: title, artists, album (those switched on and known). */
	private static List<String[]> lines(NowPlaying.Track t, NowPlayingSettings s) {
		List<String[]> out = new ArrayList<>();
		if (s.title) out.add(new String[] { "title", t.title() });
		if (s.artists && !t.artists().isEmpty()) out.add(new String[] { "artists", t.artistLine() });
		if (s.album && !t.album().isEmpty()) out.add(new String[] { "album", t.album() });
		return out;
	}

	static String time(long ms) {
		long sec = Math.max(0, ms / 1000);
		return sec >= 3600 ? String.format(Locale.ROOT, "%d:%02d:%02d", sec / 3600, sec / 60 % 60, sec % 60) : String.format(Locale.ROOT, "%d:%02d", sec / 60, sec % 60);
	}

	private static String times(View v) {
		// a browser's live stream (or a player that does not say) has no length: only the time so far
		if (v.track().durationMs() <= 0) return time(v.progress());
		return time(v.progress()) + " / " + time(v.track().durationMs());
	}

	private static boolean paused(View v) {
		return v.track() != null && !v.track().playing();
	}

	/** The pause mark's room before a text (two bars and a gap). */
	private static final int MARK = 8;

	private static int coverSize(NowPlayingSettings s) {
		return "line".equals(s.layout) ? ROW : s.coverSize;
	}

	private static boolean bottomRow(NowPlayingSettings s) {
		return s.progress || s.times;
	}

	@Override
	public boolean visible(Minecraft mc) {
		return view(mc) != null;
	}

	@Override
	public int width(Minecraft mc) {
		View v = view(mc);
		NowPlayingSettings s = s();
		int pad = Modules.PAD;
		if (v == null) return 40;
		if (v.track() == null) return Math.min(s.width, pad * 2 + 12 + mc.font.width(v.status()));
		NowPlaying.Track t = v.track();
		boolean mark = paused(v) && s.pausedMarker;
		int cover = s.cover ? coverSize(s) + 4 : 0;
		if ("line".equals(s.layout)) {
			int text = font(mc, lineText(t, s)) + (mark ? MARK : 0);
			int extra = s.times ? 6 + font(mc, times(v)) : 0;
			return Math.max(pad * 2 + cover + 30, Math.min(s.width, pad * 2 + cover + text + extra));
		}
		int text = 0;
		List<String[]> lines = lines(t, s);
		for (int i = 0; i < lines.size(); i++) text = Math.max(text, font(mc, lines.get(i)[1]) + (i == 0 && mark ? MARK : 0));
		if (bottomRow(s)) text = Math.max(text, s.times ? font(mc, times(v)) + (s.progress ? 40 : 0) : 80);
		if (text == 0) return pad * 2 + Math.max(cover - 4, mark ? 8 : 0);
		return Math.max(pad * 2 + cover + 40, Math.min(s.width, pad * 2 + cover + text));
	}

	@Override
	public int height(Minecraft mc) {
		View v = view(mc);
		NowPlayingSettings s = s();
		int pad = Modules.PAD;
		if (v == null || v.track() == null) return ROW - 1 + pad * 2;
		if ("line".equals(s.layout)) return ROW - 1 + (s.progress ? 3 : 0) + pad * 2;
		return Math.max(s.cover ? s.coverSize : 0, textHeight(v.track(), s)) + pad * 2;
	}

	private static int textHeight(NowPlaying.Track t, NowPlayingSettings s) {
		int n = lines(t, s).size();
		int h = n * ROW - (n > 0 ? 1 : 0);
		if (bottomRow(s)) h += (n > 0 ? 3 : 0) + (s.times ? 8 : 2);
		return h;
	}

	/** The line layout's text: "Title – Artist, Artist" (what is switched on). */
	private static String lineText(NowPlaying.Track t, NowPlayingSettings s) {
		List<String> parts = new ArrayList<>();
		if (s.title) parts.add(t.title());
		if (s.artists && !t.artists().isEmpty()) parts.add(t.artistLine());
		if (s.album && !t.album().isEmpty()) parts.add(t.album());
		return parts.isEmpty() ? t.title() : String.join(" – ", parts);
	}

	// ---------- drawing ----------

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		View v = view(mc);
		if (v == null) return;
		NowPlayingSettings s = s();
		HudConfig.Placement p = Modules.drawing;
		int base = 0xFF000000 | ((p != null ? p.textColor(Modules.cfg) : Modules.cfg.textColor) & 0xFFFFFF);
		boolean shadow = p != null ? p.shadow(Modules.cfg) : Modules.cfg.textShadow;
		int accent = "theme".equals(s.accent) ? base : GREEN;
		int pad = Modules.PAD;
		int w = width(mc), h = height(mc);
		if (v.track() == null) {
			// a status: a note and that nothing plays
			Ui.icon(g, "m-music", x + pad, y + pad, 9, accent);
			g.text(mc.font, Ui.fit(v.status(), w - pad * 2 - 12), x + pad + 12, y + pad + 1, MUTED, shadow);
			return;
		}
		NowPlaying.Track t = v.track();
		boolean mark = paused(v) && s.pausedMarker;
		// a paused track a little dimmer
		int dim = paused(v) ? 0xC0 : 0xFF;
		if ("line".equals(s.layout)) {
			int tx = x + pad;
			if (s.cover) {
				cover(g, t, v.sample(), tx, y + pad, ROW, accent, false);
				tx += ROW + 4;
			}
			int right = x + w - pad;
			if (s.times) {
				String tm = times(v);
				g.text(mc.font, tm, right - font(mc, tm), y + pad + 1, alpha(MUTED, dim), shadow);
				right -= font(mc, tm) + 6;
			}
			if (mark) {
				pauseMark(g, tx, y + pad + 1, accent);
				tx += MARK;
			}
			text(g, mc, "line", lineText(t, s), tx, y + pad + 1, right - tx, alpha(base, dim), shadow, s.marquee);
			if (s.progress) bar(g, x + pad, y + pad + ROW + 1, w - pad * 2, v, accent);
			return;
		}
		int cs = s.cover ? s.coverSize : 0;
		int tx = x + pad + (cs > 0 ? cs + 4 : 0);
		int tw = x + w - pad - tx;
		int th = textHeight(t, s);
		int content = Math.max(cs, th);
		if (cs > 0) cover(g, t, v.sample(), x + pad, y + pad + (content - cs) / 2, cs, accent, mark && !s.title);
		if (tw <= 0 || th <= 0) return;
		int ty = y + pad + (content - th) / 2;
		List<String[]> lines = lines(t, s);
		for (int i = 0; i < lines.size(); i++) {
			String kind = lines.get(i)[0];
			int lx = tx;
			if (i == 0 && mark && s.title) {
				pauseMark(g, lx, ty + 1, accent);
				lx += MARK;
			}
			int color = switch (kind) {
				case "title" -> base;
				case "artists" -> ARTIST;
				default -> ALBUM;
			};
			text(g, mc, kind, lines.get(i)[1], lx, ty + 1, tx + tw - lx, alpha(color, dim), shadow, s.marquee);
			ty += ROW;
		}
		if (bottomRow(s)) {
			if (!lines.isEmpty()) ty += 2;
			int bx = tx, bw = tw;
			if (s.times) {
				String tm = times(v);
				int tmw = font(mc, tm);
				if (s.progress) {
					g.text(mc.font, tm, tx + tw - tmw, ty, alpha(MUTED, dim), shadow);
					bw = tw - tmw - 5;
					bar(g, bx, ty + 3, bw, v, accent);
				} else g.text(mc.font, tm, tx, ty, alpha(MUTED, dim), shadow);
			} else bar(g, bx, ty, bw, v, accent);
		}
	}

	private static int alpha(int color, int a) {
		return (a & 0xFF) << 24 | (color & 0xFFFFFF);
	}

	/** Where it plays: Spotify's mark, or a note for a browser and other players. */
	private static String sourceIcon(NowPlaying.Track t) {
		return t.fromSpotify() ? "m-spotify" : "m-music";
	}

	/** The cover, or where it plays (big, on dark) while it loads, when there is none, and in the editor's made-up track. */
	private static void cover(GuiGraphicsExtractor g, NowPlaying.Track t, boolean sample, int x, int y, int size, int accent, boolean mark) {
		Identifier id = sample ? null : NowPlaying.cover(t.cover());
		if (id != null) {
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, id, x, y, 0, 0, size, size, 64, 64, 64, 64, 0xFFFFFFFF);
			// a small mark of where it plays in the corner (not on the small cover of the line)
			if (s().sourceIcon && size >= 20) {
				int b = Math.max(7, size / 4);
				g.fill(x + size - b - 2, y + size - b - 2, x + size, y + size, 0xC0000000);
				Ui.icon(g, sourceIcon(t), x + size - b - 1, y + size - b - 1, b, t.fromSpotify() ? GREEN : 0xFFFFFFFF);
			}
		} else {
			g.fill(x, y, x + size, y + size, 0xFF121212);
			int icon = Math.max(6, size * 5 / 8);
			Ui.icon(g, sourceIcon(t), x + (size - icon) / 2, y + (size - icon) / 2, icon, t.fromSpotify() ? GREEN : accent);
		}
		// paused without a title to put the mark by: it goes on the cover
		if (mark) {
			g.fill(x, y, x + size, y + size, 0x88000000);
			pauseMark(g, x + size / 2 - 2, y + size / 2 - 3, 0xFFFFFFFF);
		}
	}

	private static void pauseMark(GuiGraphicsExtractor g, int x, int y, int color) {
		g.fill(x, y, x + 2, y + 7, color);
		g.fill(x + 3, y, x + 5, y + 7, color);
	}

	/** The track's progress: a thin bar, the part played in the accent. */
	private static void bar(GuiGraphicsExtractor g, int x, int y, int w, View v, int accent) {
		if (w <= 0) return;
		g.fill(x, y, x + w, y + 2, TRACK);
		long d = v.track().durationMs();
		int done = d > 0 ? (int) Math.round(w * Math.min(1.0, (double) v.progress() / d)) : 0;
		if (done > 0) g.fill(x, y, x + done, y + 2, accent);
	}

	/** The last text shown per line, so a new one starts its slide from the beginning. */
	private static final java.util.Map<String, String> shownText = new java.util.HashMap<>();

	/** A text in `w` pixels: whole when it fits, else sliding through (or cut with "…"). */
	private static void text(GuiGraphicsExtractor g, Minecraft mc, String key, String text, int x, int y, int w, int color, boolean shadow, boolean marquee) {
		if (w <= 4) return;
		int tw = mc.font.width(text);
		String mk = "spotify:" + key;
		if (!text.equals(shownText.put(mk, text))) Ui.marqueeShift(mk, 0);
		if (tw <= w) {
			g.text(mc.font, text, x, y, color, shadow);
			return;
		}
		if (!marquee) {
			g.text(mc.font, Ui.fit(Component.literal(text), w), x, y, color, shadow);
			return;
		}
		slide(g, mc, text, x, y, w, color, shadow, Ui.marqueeShift(mk, tw - w));
	}

	/**
	 * Text moved left by `shift` and shown only within `w` pixels: letter by letter, those at the
	 * edges fading (no scissor, which older game versions would not move with the HUD's scale).
	 */
	static void slide(GuiGraphicsExtractor g, Minecraft mc, String text, int x, int y, int w, int color, boolean shadow, int shift) {
		int cx = x - shift;
		int a = color >>> 24;
		for (int i = 0; i < text.length(); ) {
			int cp = text.codePointAt(i);
			String ch = new String(Character.toChars(cp));
			i += Character.charCount(cp);
			int cw = mc.font.width(ch);
			if (cx + cw > x && cx < x + w) {
				float shown = (Math.min(cx + cw, x + w) - Math.max(cx, x)) / (float) Math.max(1, cw);
				// a letter mostly out of the box is left out; one partly in is fainter
				if (shown >= 0.6f) g.text(mc.font, ch, cx, y, alpha(color, shown >= 0.99f ? a : Math.max(8, Math.round(a * (shown - 0.5f) * 2))), shadow);
			}
			cx += cw;
			if (cx >= x + w + 8) break;
		}
	}

	// ---------- the settings card ----------

	/** The module's own settings, after the usual ones; first a line on where it reads from. */
	public static void settings(List<Catalog.Setting> settings, java.util.function.Supplier<NowPlayingSettings> s) {
		// read through `s` each time: pasting a share code or a server's layout puts new settings in place
		settings.add(0, new Catalog.Info("slashclient-hud.spotify.info", NowPlayingModule::infoKey));
		settings.add(new Catalog.Choice("slashclient-hud.spotify.layout", NowPlayingSettings.LAYOUTS, "slashclient-hud.spotify.layout.", () -> s.get().layout, v -> s.get().layout = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.cover", () -> s.get().cover, v -> s.get().cover = v));
		settings.add(new Catalog.Slider("slashclient-hud.spotify.coverSize", 16f, 64f, 2f, "%.0f px", () -> (float) s.get().coverSize, v -> s.get().coverSize = Math.round(v)));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.title", () -> s.get().title, v -> s.get().title = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.artists", () -> s.get().artists, v -> s.get().artists = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.album", () -> s.get().album, v -> s.get().album = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.progress", () -> s.get().progress, v -> s.get().progress = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.times", () -> s.get().times, v -> s.get().times = v));
		settings.add(new Catalog.Choice("slashclient-hud.spotify.accent", NowPlayingSettings.ACCENTS, "slashclient-hud.spotify.accent.", () -> s.get().accent, v -> s.get().accent = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.showPaused", () -> s.get().showPaused, v -> s.get().showPaused = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.pausedMarker", () -> s.get().pausedMarker, v -> s.get().pausedMarker = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.hideIdle", () -> s.get().hideIdle, v -> s.get().hideIdle = v));
		settings.add(new Catalog.Slider("slashclient-hud.spotify.width", 100f, 320f, 10f, "%.0f px", () -> (float) s.get().width, v -> s.get().width = Math.round(v)));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.marquee", () -> s.get().marquee, v -> s.get().marquee = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.sourceIcon", () -> s.get().sourceIcon, v -> s.get().sourceIcon = v));
		settings.add(new Catalog.Toggle("slashclient-hud.spotify.onlySpotify", () -> s.get().onlySpotify, v -> s.get().onlySpotify = v));
	}

	/** What the settings say: what it reads (on this computer), or that it needs the launcher. */
	static String infoKey() {
		NowPlaying.State st = NowPlaying.state();
		if (!NowPlaying.bridged() && !st.known()) return "slashclient-hud.spotify.info.noLauncher";
		return "slashclient-hud.spotify.info.local";
	}

	// ---------- for the in-game tests ----------

	/** What the module shows now, as text ("" when hidden). */
	String shownText(Minecraft mc) {
		viewAt = 0;
		View v = view(mc);
		if (v == null) return "";
		if (v.track() == null) return "status: " + v.status().getString();
		NowPlayingSettings s = s();
		String out = ("line".equals(s.layout) ? lineText(v.track(), s) : String.join(" | ", lines(v.track(), s).stream().map(l -> l[1]).toList()));
		if (s.times) out += " [" + times(v) + "]";
		if (paused(v)) out += " (paused)";
		if (!v.track().source().isEmpty()) out += " {" + v.track().source() + "}";
		return out;
	}
}
