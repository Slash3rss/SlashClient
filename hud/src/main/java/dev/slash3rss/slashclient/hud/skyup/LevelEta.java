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
 * "Górnik (poziom 2) 744/3 599 xp"), at the pace the XP came in over the last few minutes, counting down every
 * second. A line shows only while that XP keeps coming, so the module is there while the player is levelling
 * something and gone when they stop.
 */
public final class LevelEta {
	private LevelEta() {}

	/** The pace is the XP got in this long; nothing got in it, and the line goes. */
	static final long WINDOW_MS = 5 * 60_000;
	/** XP stopped coming for this many of its usual gaps: the time grows again instead of counting down. */
	static final double STOPPED_GAPS = 3;

	/** One thing levelled: its XP got lately (when, how much), its level and the XP to the next. */
	private static final class Track {
		final Deque<double[]> gains = new ArrayDeque<>();
		int level;
		double left;
		/** The bar when last read, for what it grew by: level, XP in it, XP the level takes. */
		double[] last;
	}

	private static final Track player = new Track(), dungeon = new Track();
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
		t.gains.addLast(new double[] { now, xp });
	}

	/** The dungeon's XP (DungeonRun, from its boss bar): what came in now, and what its level still takes. */
	public static void dungeon(double got, double left) {
		dungeon.left = left;
		if (got > 0) gain(dungeon, got, System.currentTimeMillis());
	}

	/** A new trip: the dungeon's pace starts again. */
	public static void dungeonReset() {
		dungeon.gains.clear();
		dungeon.left = 0;
	}

	/** The time to the dungeon's next level ("~4 min 12 s"), "estimating…" while there is no pace yet, null with none at all. */
	public static String dungeonEta() {
		return shown(dungeon, System.currentTimeMillis());
	}

	/** Seconds to the next level, ticking down between gains; -1 with no pace (yet, or any more). */
	private static long eta(Track t, long now) {
		while (!t.gains.isEmpty() && now - t.gains.peekFirst()[0] > WINDOW_MS) t.gains.pollFirst();
		return eta(t.gains, now, t.left);
	}

	/**
	 * Seconds until `left` more XP comes in, from the gains (when, how much) of the last few minutes: their pace is the
	 * XP that came after the first one over the time from the first to the last, so it is there from the second gain
	 * on and steady between gains, while the time left counts down every second. When the XP has stopped coming (for
	 * a few of its usual gaps), the pace is taken up to now instead, so the time grows rather than running out.
	 */
	static long eta(java.util.Collection<double[]> gains, long now, double left) {
		if (gains.size() < 2 || left <= 0) return -1;
		double first = -1, last = 0, got = 0;
		for (double[] g : gains) {
			if (first < 0) first = g[0];
			else got += g[1];
			last = g[0];
		}
		double span = last - first;
		if (span < 1000 || got <= 0) return -1;
		double gap = span / (gains.size() - 1);
		if (now - last > STOPPED_GAPS * gap) return Math.round(left / (got / ((now - first) / 1000.0)));
		return Math.max(1, Math.round(left / (got / (span / 1000.0)) - (now - last) / 1000.0));
	}

	/** The time as a line shows it, "estimating…" while the first gains came in and there is no pace yet, null with no XP coming. */
	private static String shown(Track t, long now) {
		long s = eta(t, now);
		if (s >= 0) return duration(s);
		return t.gains.isEmpty() || t.left <= 0 ? null : Ui.tr("slashclient-hud.levelEta.counting").getString();
	}

	/** "~45 s", "~4 min 12 s", "~2 h 05 min"; past 99 hours just "99+ h", as a pace that slow says little. */
	public static String duration(long s) {
		if (s < 60) return "~" + Math.max(1, s) + " s";
		if (s < 3600) return "~" + s / 60 + " min " + String.format(java.util.Locale.ROOT, "%02d", s % 60) + " s";
		long min = s / 60;
		if (min >= 99 * 60) return "99+ h";
		return "~" + min / 60 + " h " + String.format(java.util.Locale.ROOT, "%02d", min % 60) + " min";
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
		String p = shown(player, now);
		if (p != null) out.add(Ui.tr("slashclient-hud.levelEta.player", player.level, p));
		for (var e : jobs.entrySet()) {
			String j = shown(e.getValue(), now);
			if (j != null) out.add(Ui.tr("slashclient-hud.levelEta.job", e.getKey(), e.getValue().level, j));
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
				out.add(Ui.tr("slashclient-hud.levelEta.player", 31, "~12 min 30 s"));
				out.add(Ui.tr("slashclient-hud.levelEta.job", "Górnik", 3, "~4 min 12 s"));
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

	/** For the test: the time from gains given as "seconds:xp" (seconds before now), with `left` XP to go. */
	public static long etaForTest(double left, double nowSeconds, String... gains) {
		List<double[]> list = new ArrayList<>();
		for (String g : gains) {
			String[] p = g.split(":");
			list.add(new double[] { Double.parseDouble(p[0]) * 1000, Double.parseDouble(p[1]) });
		}
		return eta(list, Math.round(nowSeconds * 1000), left);
	}

	/** For the test: the module's lines, one per line. */
	public static String linesForTest() {
		StringBuilder out = new StringBuilder();
		for (Component c : lines()) out.append(c.getString()).append('\n');
		return out.toString();
	}
}
