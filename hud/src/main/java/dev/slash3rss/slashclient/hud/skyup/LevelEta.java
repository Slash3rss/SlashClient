package dev.slash3rss.slashclient.hud.skyup;

import dev.slash3rss.slashclient.hud.modules.HudModule;
import dev.slash3rss.slashclient.hud.modules.Modules;
import dev.slash3rss.slashclient.hud.ui.Ui;
import dev.slash3rss.slashclient.hud.world.XpMath;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * About how long until the next level of the player's own XP (the green bar) and of each SkyUp job (its boss bar,
 * "Górnik (poziom 2) 744/3 599 xp"), at the pace the XP came in over the last few minutes. A line shows only while
 * that XP keeps coming, so the module is there while the player is levelling something and gone when they stop.
 */
public final class LevelEta {
	private LevelEta() {}

	/** The pace is the XP got in this long; nothing got in it, and the line goes. */
	static final long WINDOW_MS = 5 * 60_000;
	/** A guess only after watching this long: the first few gains say little about the pace. */
	static final long AFTER_MS = 30_000;

	/** One thing levelled: its XP got lately (when, how much), since when it is watched, its level and the XP to the next. */
	private static final class Track {
		final Deque<double[]> gains = new ArrayDeque<>();
		long since;
		int level;
		double left;
		/** The bar when last read, for what it grew by: level, XP in it, XP the level takes. */
		double[] last;
	}

	private static final Track player = new Track();
	private static final Map<String, Track> jobs = new LinkedHashMap<>();
	private static int playerXpLast = -1;

	public static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null) {
			reset();
			return;
		}
		long now = System.currentTimeMillis();
		// the player's own: only what comes in counts, not what is spent on enchanting
		int total = mc.player.totalExperience;
		if (playerXpLast >= 0 && total > playerXpLast) gain(player, total - playerXpLast, now);
		playerXpLast = total;
		player.level = mc.player.experienceLevel;
		player.left = (1f - mc.player.experienceProgress) * XpMath.toNext(mc.player.experienceLevel);
		for (String bar : DungeonMap.bossBarTexts(mc)) {
			java.util.regex.Matcher m = DungeonRun.JOB_BAR.matcher(bar);
			if (!m.find()) continue;
			double level, have, need;
			try {
				level = Double.parseDouble(m.group(2));
				have = DungeonRun.number(m.group(3));
				need = DungeonRun.number(m.group(4));
			} catch (NumberFormatException e) {
				continue;
			}
			Track t = jobs.computeIfAbsent(m.group(1).strip(), k -> new Track());
			double[] last = t.last;
			if (last != null && level < last[0]) continue;
			t.last = new double[] { level, have, need };
			t.level = (int) level;
			t.left = need - have;
			if (last == null) continue;
			// a level gone up on the way counts the rest of the one before
			double got = level == last[0] ? have - last[1] : Math.max(0, last[2] - last[1]) + have;
			if (got > 0) gain(t, got, now);
		}
	}

	private static void gain(Track t, double xp, long now) {
		// watching starts with the first gain after a quiet spell
		if (t.gains.isEmpty() || now - t.gains.peekLast()[0] > WINDOW_MS) {
			t.gains.clear();
			t.since = now;
		}
		t.gains.addLast(new double[] { now, xp });
	}

	/** Seconds to the next level at the pace of the last few minutes; -1 with no pace (yet, or any more). */
	private static long eta(Track t, long now) {
		while (!t.gains.isEmpty() && now - t.gains.peekFirst()[0] > WINDOW_MS) t.gains.pollFirst();
		if (t.gains.isEmpty() || t.left <= 0) return -1;
		long span = now - Math.max(t.since, now - WINDOW_MS);
		if (span < AFTER_MS) return -1;
		double got = 0;
		for (double[] g : t.gains) got += g[1];
		return Math.round(t.left / (got / (span / 1000.0)));
	}

	/** "<1 min", "~12 min", "~2 h 05 min"; past 99 hours just "99+ h", as a pace that slow says little. */
	public static String duration(long s) {
		if (s < 60) return "<1 min";
		long min = (s + 30) / 60;
		if (min < 60) return "~" + min + " min";
		if (min >= 99 * 60) return "99+ h";
		return "~" + min / 60 + " h " + String.format(java.util.Locale.ROOT, "%02d", min % 60) + " min";
	}

	/** Seconds until `left` more XP comes in at the pace of `got` in `ms`; -1 after too short a while or with none got. */
	public static long etaSeconds(double got, long ms, double left) {
		if (got <= 0 || ms < AFTER_MS || left <= 0) return -1;
		return Math.round(left / (got / (ms / 1000.0)));
	}

	private static void reset() {
		player.gains.clear();
		player.last = null;
		jobs.clear();
		playerXpLast = -1;
	}

	private static List<Component> lines() {
		List<Component> out = new ArrayList<>();
		long now = System.currentTimeMillis();
		long p = eta(player, now);
		if (p >= 0) out.add(Ui.tr("slashclient-hud.levelEta.player", player.level, duration(p)));
		for (var e : jobs.entrySet()) {
			long j = eta(e.getValue(), now);
			if (j >= 0) out.add(Ui.tr("slashclient-hud.levelEta.job", e.getKey(), e.getValue().level, duration(j)));
		}
		return out;
	}

	// ---------- on the HUD ----------

	public static final class Module implements HudModule {
		@Override
		public String id() {
			return "leveleta";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !LevelEta.lines().isEmpty();
		}

		private static List<Component> shown() {
			List<Component> out = new ArrayList<>();
			out.add(Ui.tr("slashclient-hud.levelEta.title"));
			List<Component> real = LevelEta.lines();
			if (real.isEmpty()) {
				// made-up numbers for the editor
				out.add(Ui.tr("slashclient-hud.levelEta.player", 31, "~12 min"));
				out.add(Ui.tr("slashclient-hud.levelEta.job", "Górnik", 3, "~1 h 05 min"));
			} else out.addAll(real);
			return out;
		}

		@Override
		public int width(Minecraft mc) {
			int w = 0;
			for (Component c : shown()) w = Math.max(w, mc.font.width(c));
			return w + Modules.PAD * 2;
		}

		@Override
		public int height(Minecraft mc) {
			return shown().size() * 10 + Modules.PAD * 2 - 1;
		}

		@Override
		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			List<Component> lines = shown();
			for (int i = 0; i < lines.size(); i++) {
				int color = i == 0 ? 0xFF4ADE80 : Modules.textColor();
				Modules.text(g, mc, lines.get(i), x + Modules.PAD, y + Modules.PAD + i * 10, color);
			}
		}
	}

	// ---------- for the tests ----------

	/** For the test: everything watched as if it happened `ms` earlier, for a pace to show. */
	public static void agoForTest(long ms) {
		List<Track> all = new ArrayList<>(jobs.values());
		all.add(player);
		for (Track t : all) {
			t.since -= ms;
			for (double[] g : t.gains) g[0] -= ms;
		}
	}

	/** For the test: the module's lines, one per line. */
	public static String linesForTest() {
		StringBuilder out = new StringBuilder();
		for (Component c : lines()) out.append(c.getString()).append('\n');
		return out.toString();
	}
}
