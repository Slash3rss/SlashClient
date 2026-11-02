package dev.slash3rss.slashclient.hud.world;

/**
 * Experience as the game counts it (the same sums as the XP calculator on slash3rss.dev): the
 * points a level takes from zero, the points the next level costs, and the level some points make.
 * SkyUp's part (bottling with its 50% tax, the mending assistant) is there too, the window only on 26.3.
 */
public final class XpMath {
	private XpMath() {}

	/** All the points it takes to reach `level` from zero. */
	public static long total(int level) {
		long l = Math.max(0, level);
		if (l <= 16) return l * l + 6 * l;
		if (l <= 31) return (long) Math.floor(2.5 * l * l - 40.5 * l + 360);
		return (long) Math.floor(4.5 * l * l - 162.5 * l + 2220);
	}

	/** The points from `level` to the next one. */
	public static long toNext(int level) {
		if (level < 0) return 0;
		if (level <= 15) return 2L * level + 7;
		if (level <= 30) return 5L * level - 38;
		return 9L * level - 158;
	}

	/** A level reached with some points: the level, the points into it, what the next costs, and how far (0..1). */
	public record Level(int level, long into, long next, float progress) {}

	public static Level level(long points) {
		if (points <= 0) return new Level(0, 0, 7, 0);
		int l = 0;
		// a couple of thousand steps at most for any number a player types
		while (l < 100_000 && total(l + 1) <= points) l++;
		long into = points - total(l), next = toNext(l);
		return new Level(l, into, next, next > 0 ? Math.min(1f, into / (float) next) : 0);
	}

	// ---------- SkyUp ----------

	/** A bottle XP suggestion for mending a pickaxe by a stone generator: safe, the usual range, and the most. */
	public record Mending(int safe, int low, int high, int max) {}

	/** The usual choices, offered next to the boxes. */
	public static final int[] GENERATORS = { 8, 16 }, UNBREAKING = { 3, 4, 5, 6 };

	/**
	 * XP a generator wears off a pickaxe between two throws of a 12 s clock, without Unbreaking: the
	 * low end, safe, the high end and the most. Fitted to what was measured on SkyUp (8 and 16
	 * generators, Unbreaking III–VI, the website's table): safe and the high end give exactly its numbers.
	 */
	private static final double LOW = 24.1, SAFE = 25.7, HIGH = 26, MAX = 27.1;

	/**
	 * What a bottle should hold to keep the pickaxe mended: the wear grows with the generators and the
	 * clock between throws, and Unbreaking n lets only one use in n + 1 cost durability. Even numbers,
	 * as the measurements were.
	 */
	public static Mending mending(int generators, int unbreaking, int clock) {
		double per = Math.max(1, generators) * Math.max(1, clock) / 12.0 / (Math.max(0, unbreaking) + 1);
		return new Mending(even(per * SAFE), even(per * LOW), even(per * HIGH), even(per * MAX));
	}

	private static int even(double xp) {
		return (int) Math.max(2, Math.min(1_000_000, 2 * Math.round(xp / 2)));
	}

	/** "VI" for 6; plain digits past 10 or below 1. */
	public static String roman(int n) {
		String[] r = { "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X" };
		return n >= 1 && n <= 10 ? r[n - 1] : String.valueOf(n);
	}

	/**
	 * Bottling on SkyUp ("/schowajexp <xp> <bottles>"): each bottle takes twice the XP it holds (half is
	 * the tax). From a level: how many bottles it makes, what is left (and the level that is) and what the tax took.
	 */
	public record Bottling(int bottles, long cost, long left, Level leftLevel, long tax) {}

	public static Bottling bottling(int level, int perBottle) {
		long cost = Math.max(1, perBottle) * 2L;
		long points = total(level);
		int bottles = (int) Math.min(Integer.MAX_VALUE, points / cost);
		long left = points - bottles * cost;
		return new Bottling(bottles, cost, left, level(left), bottles * cost / 2);
	}

	/** "00:02:36". */
	public static String clock(long seconds) {
		long s = Math.max(0, seconds);
		return String.format(java.util.Locale.ROOT, "%02d:%02d:%02d", s / 3600, s % 3600 / 60, s % 60);
	}
}
