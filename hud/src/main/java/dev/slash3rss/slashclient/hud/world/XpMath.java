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

	public static final String[] GENERATORS = { "8x", "16x" };
	public static final String[] UNBREAKING = { "III", "IV", "V", "VI" };

	/** What a bottle should hold to keep the pickaxe mended (as measured on SkyUp, from the website). */
	public static Mending mending(String generators, String unbreaking) {
		boolean many = "16x".equals(generators);
		return switch (unbreaking) {
			case "IV" -> many ? new Mending(82, 78, 84, 86) : new Mending(42, 38, 42, 44);
			case "V" -> many ? new Mending(68, 64, 70, 72) : new Mending(34, 32, 34, 36);
			case "VI" -> many ? new Mending(58, 56, 60, 62) : new Mending(30, 26, 30, 32);
			default -> many ? new Mending(102, 96, 104, 106) : new Mending(52, 48, 52, 54);
		};
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
