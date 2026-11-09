package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.TreeMap;

/**
 * How much XP each dungeon level takes, learned while playing instead of trusted to a formula: on SkyUp the
 * damage dealt to the dungeon's mobs is the dungeon XP, so the health the player's hits took off the mobs,
 * set against how far the boss bar moved meanwhile, says how much a whole bar is. A level not measured yet
 * takes SkyUp's formula (DungeonMap.formula), scaled by how far the measured levels are from it, so a changed
 * formula shows right after a few hits. What was learned is kept for the next game (config/slashclient-dungeon-xp.json).
 */
public final class DungeonXp {
	private DungeonXp() {}

	/** Measured enough to be trusted: this many readings, the bar moved at least this much in all. */
	static final int MIN_SAMPLES = 3;
	static final double MIN_PROGRESS = 0.03;
	/** A reading is taken once neither the mobs' health nor the bar has moved for this many ticks. */
	private static final int QUIET_TICKS = 20;
	/** A hit mob is watched this long after the last hit. */
	private static final long WATCH_MS = 10_000;

	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-dungeon-xp.json");
	private static final Gson GSON = new Gson();

	/** Per level: the damage dealt, the part of the bar it filled, the readings. */
	private static Map<Integer, double[]> learned;
	private static boolean dirty;

	/** The mobs hit by the player: their health when last seen and when they were last hit. */
	private record Watched(float health, long hitAt) {}
	private static final Map<Integer, Watched> watched = new HashMap<>();

	/** Since the last reading: the damage dealt, the bar's level and fill where it started and now. */
	private static double damage;
	private static int level = -1;
	private static float from = -1, now = -1;
	private static int quiet;
	private static boolean levelChanged;

	/** The XP a level takes: as learned, else the formula scaled like the levels learned. */
	public static int need(int level) {
		Map<Integer, double[]> all = learned();
		double[] l = all.get(level);
		if (trusted(l)) return (int) Math.max(1, Math.round(l[0] / l[1]));
		double formula = 0, measured = 0;
		for (var e : all.entrySet()) {
			if (!trusted(e.getValue())) continue;
			formula += DungeonMap.formula(e.getKey());
			measured += e.getValue()[0] / e.getValue()[1];
		}
		double scale = formula > 0 ? measured / formula : 1;
		return (int) Math.max(1, Math.round(DungeonMap.formula(level) * scale));
	}

	private static boolean trusted(double[] l) {
		return l != null && l[2] >= MIN_SAMPLES && l[1] >= MIN_PROGRESS && l[0] > 0;
	}

	/** The player hit something: its health from now on is watched, for the damage the hits deal. */
	public static void attacked(Player player, Entity target) {
		Minecraft mc = Minecraft.getInstance();
		if (player != mc.player || !DungeonMap.active() || !(target instanceof LivingEntity living)) return;
		Watched before = watched.get(target.getId());
		watched.put(target.getId(), new Watched(before != null ? before.health() : living.getHealth(), System.currentTimeMillis()));
	}

	/** The dungeon's boss bar, every tick: its level and how full it is. */
	private static void bar(int barLevel, float progress) {
		if (barLevel != level) {
			// a new level on the way: what was gathered spans two levels, so it is not a reading
			if (level >= 0) levelChanged = true;
			level = barLevel;
			from = now = progress;
			return;
		}
		if (progress != now) {
			now = progress;
			quiet = 0;
		}
	}

	public static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null || !DungeonMap.active()) {
			if (!watched.isEmpty() || level >= 0) reset();
			if (dirty) save();
			return;
		}
		float[] read = DungeonMap.barNow(mc);
		if (read != null) bar((int) read[0], read[1]);
		long t = System.currentTimeMillis();
		for (Iterator<Map.Entry<Integer, Watched>> it = watched.entrySet().iterator(); it.hasNext(); ) {
			var e = it.next();
			Entity entity = mc.level.getEntity(e.getKey());
			float before = e.getValue().health();
			if (entity instanceof LivingEntity living) {
				float health = Math.max(0, living.getHealth());
				if (health < before) {
					damage += before - health;
					quiet = 0;
				}
				e.setValue(new Watched(health, e.getValue().hitAt()));
				if (!living.isDeadOrDying() && t - e.getValue().hitAt() <= WATCH_MS) continue;
			}
			it.remove();
		}
		if (++quiet < QUIET_TICKS) return;
		if (levelChanged) {
			levelChanged = false;
			damage = 0;
			from = now;
			return;
		}
		double moved = now - from;
		if (moved > 0.0005 && damage > 0) learn(level, damage, moved);
		// the bar went back (a new trip), or a hit that gave nothing: nothing learned from it
		if (moved != 0 || damage > 0) {
			damage = 0;
			from = now;
		}
	}

	static void learn(int level, double dealt, double moved) {
		if (level < 1) return;
		double[] l = learned().computeIfAbsent(level, k -> new double[3]);
		l[0] += dealt;
		l[1] += moved;
		l[2]++;
		// plenty measured: older readings weigh less, so a formula changed later is learned again
		if (l[2] > 50) {
			l[0] *= 0.9;
			l[1] *= 0.9;
			l[2] *= 0.9;
		}
		dirty = true;
	}

	private static void reset() {
		watched.clear();
		damage = 0;
		level = -1;
		from = now = -1;
		quiet = 0;
		levelChanged = false;
	}

	private static Map<Integer, double[]> learned() {
		if (learned == null) {
			learned = new TreeMap<>();
			try {
				if (Files.exists(FILE)) {
					Map<String, double[]> read = GSON.fromJson(Files.readString(FILE), new TypeToken<Map<String, double[]>>() {}.getType());
					if (read != null) for (var e : read.entrySet()) {
						if (e.getValue() != null && e.getValue().length == 3) learned.put(Integer.parseInt(e.getKey()), e.getValue());
					}
				}
			} catch (Exception e) {
				// an unreadable file: learnt again from the start
			}
		}
		return learned;
	}

	static void save() {
		dirty = false;
		try {
			Map<String, double[]> out = new TreeMap<>();
			for (var e : learned().entrySet()) out.put(String.valueOf(e.getKey()), e.getValue());
			Path tmp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
			Files.writeString(tmp, GSON.toJson(out));
			Files.move(tmp, FILE, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
		} catch (Exception e) {
			// kept for this game only
		}
	}

	/** For the test: nothing learned, nothing kept. */
	public static void clearForTest() {
		learned = new TreeMap<>();
		reset();
		save();
	}

	/** For the test: a level's readings, "damage/progress/readings", or "-". */
	public static String learnedForTest(int level) {
		double[] l = learned().get(level);
		return l == null ? "-" : Math.round(l[0]) + "/" + Math.round(l[1] * 1000) / 1000.0 + "/" + Math.round(l[2]);
	}
}
