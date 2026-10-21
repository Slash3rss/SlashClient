package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.slash3rss.slashclient.hud.mixin.CreateWorldScreenAccessor;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.worldselection.CreateWorldScreen;
import net.minecraft.client.gui.screens.worldselection.WorldCreationUiState;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.tags.StructureTags;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.Vec3;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * The benchmark's own test scene, as in other games: a singleplayer world of its own with a
 * fixed seed, fixed time and weather, no mobs walking about, and a camera flying the same path
 * through several scenes (forest, a wide view, a village, water, many entities, particles, the
 * village at night), each measured on its own. Runs on it are compared only with each other.
 *
 * The places are found once, when the world is made (the nearest village to 0,0 and the forest,
 * water and flat spots around it), and kept in the world's folder, so every run flies exactly
 * the same path. The player stays still in spectator mode above the village, so the server keeps
 * the same chunks loaded; only the camera moves, within that area.
 */
public final class BenchScene {
	private BenchScene() {}

	/** Results with this mark are compared only with each other; a new number when the run changes. */
	public static final String ID = "slashclient-1";
	/** Chosen for a village with a forest, water and hills around it, close to 0,0. */
	static final long SEED = 8091867987493326313L;
	static final String WORLD = "SlashClient Benchmark";
	private static final int PLAN_VERSION = 1;
	private static final String PLAN_FILE = "slashclient-benchmark.json";
	private static final Gson GSON = new GsonBuilder().create();
	/** Seconds at the start of each scene that are not measured: the cut to a new view. */
	static final double INTRO = 0.5;
	private static final String TAG = "slashbench";

	/** Asked for by the launcher: on the title screen, the scene's world is opened (or made). */
	private static boolean requested = Boolean.getBoolean("slashclient.benchmark.scene");

	private enum Stage { NONE, CREATING, JOINING, SETUP, PLANNING, CHUNKS, PREWARM, SETTLE, RUNNING }
	private static Stage stage = Stage.NONE;
	private static int stageTicks;
	private static volatile Plan pendingPlan;
	private static volatile String planError;
	private static Plan plan;
	private static int chunksHave, chunksNeed;
	private static int warmKey, warmFrames;
	private static long warmSince;
	private static CameraType cameraBefore;
	private static int particleTick;
	/** The world written to disk before measuring, so a fresh world's saving does not slow the first run. */
	private static volatile boolean saved;
	private static int settledAt;

	// ---------- the plan: where the camera flies, kept in the world's folder ----------

	/** One scene: the camera's positions and where it looks, flown through evenly in `seconds`. */
	public static final class Shot {
		public String id;
		public double seconds;
		/** x, y, z of each key point. */
		public double[] pos;
		public double[] look;

		Shot() {}

		Shot(String id, double seconds, List<double[]> pos, List<double[]> look) {
			this.id = id;
			this.seconds = seconds;
			this.pos = flat(pos);
			this.look = flat(look);
		}

		int keys() {
			return pos.length / 3;
		}
	}

	public static final class Plan {
		public int version;
		public int cx, cz, ground;
		public boolean village;
		public List<Shot> shots = new ArrayList<>();
		/** Light for the night scene: x, y, z. */
		public List<int[]> lanterns = new ArrayList<>();
		/** The entity scene: x, y, z, kind (index in MOBS). */
		public List<double[]> mobs = new ArrayList<>();
		/** Where the particles go up. */
		public double[] fountain;
		/** How good the places came out (samples of leaves and water near them, the pen's unevenness): for choosing the seed. */
		public int forestHits, waterHits, penBumps;

		public double length() {
			double s = 0;
			for (Shot sh : shots) s += sh.seconds;
			return s;
		}

		/** The scene at `s` seconds into the flight, and how far into it. */
		int shotAt(double s) {
			for (int i = 0; i < shots.size(); i++) {
				if (s < shots.get(i).seconds) return i;
				s -= shots.get(i).seconds;
			}
			return shots.size() - 1;
		}

		double shotStart(int index) {
			double s = 0;
			for (int i = 0; i < index; i++) s += shots.get(i).seconds;
			return s;
		}
	}

	private static final String[] MOBS = { "cow", "sheep", "pig", "chicken", "villager", "iron_golem", "mooshroom", "armor_stand" };

	private static double[] flat(List<double[]> points) {
		double[] out = new double[points.size() * 3];
		for (int i = 0; i < points.size(); i++) System.arraycopy(points.get(i), 0, out, i * 3, 3);
		return out;
	}

	/** Finds the places, on the server's thread (it may generate chunks). */
	static Plan compute(ServerLevel level) {
		Plan p = new Plan();
		p.version = PLAN_VERSION;
		BlockPos v = level.findNearestMapStructure(StructureTags.VILLAGE, new BlockPos(0, 64, 0), 40, false);
		p.village = v != null;
		p.cx = v != null ? v.getX() : 0;
		p.cz = v != null ? v.getZ() : 0;
		// everything within about 70 blocks of the player waiting over the village: what the camera sees stays loaded
		Terrain t = new Terrain(level, p.cx, p.cz, 52, 4);
		p.ground = t.ground(p.cx, p.cz);
		int cx = p.cx, cz = p.cz, g = p.ground;

		// (a) low over the most wooded line near the village
		int[] forest = t.pull(t.densest(true), 44);
		p.forestHits = forest[2];
		double forestDir = t.bestLine(forest, true);
		p.shots.add(t.line("forest", 10, forest[0], forest[1], forestDir, 26, 7, -7));

		// (b) high up, turning slowly and looking far out over the land
		List<double[]> pos = new ArrayList<>(), look = new ArrayList<>();
		double high = Math.max(g + 55, t.maxTop(cx, cz, 40) + 25);
		for (int i = 0; i <= 4; i++) {
			double a = Math.toRadians(-20 + i * 32);
			pos.add(new double[] { cx + Math.cos(a) * 24, high, cz + Math.sin(a) * 24 });
			look.add(new double[] { cx + Math.cos(a + 0.35) * 220, g - 4, cz + Math.sin(a + 0.35) * 220 });
		}
		p.shots.add(new Shot("panorama", 12, pos, look));

		// (c) around the village, looking at its middle
		p.shots.add(t.orbit("village", 11, cx, cz, 28, Math.max(g + 12, t.maxTop(cx, cz, 32) + 6), g + 2, 30, 230));

		// (d) just over the water
		int[] water = t.pull(t.densest(false), 44);
		p.waterHits = water[2];
		double waterDir = t.bestLine(water, false);
		p.shots.add(t.line("water", 10, water[0], water[1], waterDir, 26, 2.5, -4));

		// (e) many entities standing still on the flattest spot nearby
		int[] pen = t.flattest(cx, cz, Integer.MIN_VALUE, Integer.MIN_VALUE);
		int pg = t.ground(pen[0], pen[1]);
		p.penBumps = pen[2];
		int n = 0;
		for (int i = 0; i < 8; i++) {
			for (int j = 0; j < 8; j++) {
				double x = pen[0] - 8.75 + i * 2.5 + 0.5, z = pen[1] - 8.75 + j * 2.5 + 0.5;
				p.mobs.add(new double[] { x, t.ground((int) Math.floor(x), (int) Math.floor(z)), z, n++ % (MOBS.length - 1) });
			}
		}
		for (int i = 0; i < 16; i++) {
			double a = Math.PI * 2 * i / 16;
			double x = pen[0] + 0.5 + Math.cos(a) * 11, z = pen[1] + 0.5 + Math.sin(a) * 11;
			p.mobs.add(new double[] { x, t.ground((int) Math.floor(x), (int) Math.floor(z)), z, MOBS.length - 1 });
		}
		p.shots.add(t.orbit("entities", 10, pen[0] + 0.5, pen[1] + 0.5, 14, Math.max(pg + 6, t.maxTop(pen[0], pen[1], 18) + 3), pg + 1, 200, 300));

		// (f) particles going up from another flat spot
		int[] spot = t.flattest(cx, cz, pen[0], pen[1]);
		int sg = t.ground(spot[0], spot[1]);
		p.fountain = new double[] { spot[0] + 0.5, sg, spot[1] + 0.5 };
		p.shots.add(t.orbit("particles", 10, spot[0] + 0.5, spot[1] + 0.5, 11, Math.max(sg + 6, t.maxTop(spot[0], spot[1], 13) + 3), sg + 3, 90, 270));

		// (g) the village at night, lit by lanterns
		for (int x = cx - 30; x <= cx + 30; x += 6) {
			for (int z = cz - 30; z <= cz + 30; z += 6) {
				if ((x - cx) * (x - cx) + (z - cz) * (z - cz) > 30 * 30 || p.lanterns.size() >= 48) continue;
				int y = t.ground(x, z);
				BlockPos at = new BlockPos(x, y, z), below = at.below();
				if (t.top(x, z) != y || !level.getBlockState(at).isAir() || !level.getFluidState(below).isEmpty()
					|| !level.getBlockState(below).isFaceSturdy(level, below, Direction.UP)) continue;
				p.lanterns.add(new int[] { x, y, z });
			}
		}
		p.shots.add(t.line("night", 11, cx, cz, Math.toRadians(45), 34, 10, -9));
		return p;
	}

	/** Heights and what is on top, around the village. */
	private static final class Terrain {
		final ServerLevel level;
		final int cx, cz, r, step;

		Terrain(ServerLevel level, int cx, int cz, int r, int step) {
			this.level = level;
			this.cx = cx;
			this.cz = cz;
			this.r = r;
			this.step = step;
		}

		/** The first free block above the ground (leaves do not count). */
		int ground(int x, int z) {
			load(x, z);
			return level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
		}

		/** The first free block above everything: leaves and water too. */
		int top(int x, int z) {
			load(x, z);
			return level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
		}

		/** The height maps answer only for loaded chunks: this loads (or makes) it. */
		private void load(int x, int z) {
			level.getChunk(x >> 4, z >> 4);
		}

		boolean leaves(int x, int z) {
			return level.getBlockState(new BlockPos(x, top(x, z) - 1, z)).is(BlockTags.LEAVES);
		}

		boolean water(int x, int z) {
			return level.getFluidState(new BlockPos(x, top(x, z) - 1, z)).is(FluidTags.WATER);
		}

		boolean is(int x, int z, boolean forest) {
			return forest ? leaves(x, z) : water(x, z);
		}

		int maxTop(double x, double z, int radius) {
			int max = Integer.MIN_VALUE;
			for (int dx = -radius; dx <= radius; dx += 4) {
				for (int dz = -radius; dz <= radius; dz += 4) {
					if (dx * dx + dz * dz <= radius * radius) max = Math.max(max, top((int) Math.floor(x) + dx, (int) Math.floor(z) + dz));
				}
			}
			return max;
		}

		/** The spot with the most leaves (or water) around it; a point to one side when there is none. */
		int[] densest(boolean forest) {
			int n = r * 2 / step + 1;
			boolean[][] hit = new boolean[n][n];
			for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) hit[i][j] = is(cx - r + i * step, cz - r + j * step, forest);
			int best = 0;
			int[] at = forest ? new int[] { cx + 48, cz, 0 } : new int[] { cx - 48, cz, 0 };
			// within 12 blocks (3 samples) of each other; the closer to the village the better on a tie
			for (int i = 3; i < n - 3; i++) {
				for (int j = 3; j < n - 3; j++) {
					if (!hit[i][j]) continue;
					int c = 0;
					for (int a = -3; a <= 3; a++) for (int b = -3; b <= 3; b++) if (hit[i + a][j + b]) c++;
					int x = cx - r + i * step, z = cz - r + j * step;
					if (c > best || c == best && c > 0 && dist(x, z) < dist(at[0], at[1])) {
						best = c;
						at = new int[] { x, z, c };
					}
				}
			}
			return at;
		}

		/** The point moved towards the village until it is at most `max` blocks from its middle. */
		int[] pull(int[] at, double max) {
			double d = dist(at[0], at[1]);
			if (d <= max) return at;
			double k = max / d;
			return new int[] { cx + (int) Math.round((at[0] - cx) * k), cz + (int) Math.round((at[1] - cz) * k), at[2] };
		}

		private double dist(int x, int z) {
			return Math.hypot(x - cx, z - cz);
		}

		/** Of eight directions, the one along which the line through `at` crosses the most leaves (or water). */
		double bestLine(int[] at, boolean forest) {
			double best = 0;
			int most = -1;
			for (int k = 0; k < 8; k++) {
				double a = Math.PI * k / 8;
				int c = 0;
				for (int j = -8; j <= 8; j++) if (is(at[0] + (int) Math.round(Math.cos(a) * j * 4), at[1] + (int) Math.round(Math.sin(a) * j * 4), forest)) c++;
				if (c > most) {
					most = c;
					best = a;
				}
			}
			return best;
		}

		/**
		 * A straight flight through x, z along `dir`, `half` blocks each way, `above` blocks over the
		 * highest thing near each point, looking ahead and `down` blocks lower.
		 */
		Shot line(String id, double seconds, double x, double z, double dir, int half, double above, double down) {
			List<double[]> pos = new ArrayList<>(), look = new ArrayList<>();
			double dx = Math.cos(dir), dz = Math.sin(dir);
			for (int i = 0; i <= 4; i++) {
				double s = -half + i * half / 2.0;
				double px = x + dx * s, pz = z + dz * s;
				// the highest thing near this point, along the way and a little to the sides
				int max = Integer.MIN_VALUE;
				for (int a = -12; a <= 12; a += 3) for (int b = -4; b <= 4; b += 4) max = Math.max(max, top((int) Math.floor(px + dx * a - dz * b), (int) Math.floor(pz + dz * a + dx * b)));
				double y = max + above;
				pos.add(new double[] { px, y, pz });
				look.add(new double[] { px + dx * 24, y + down, pz + dz * 24 });
			}
			return new Shot(id, seconds, pos, look);
		}

		/** Around x, z at `radius`, from angle `from` (degrees) through `turn` degrees, looking at the middle. */
		Shot orbit(String id, double seconds, double x, double z, double radius, double y, double lookY, double from, double turn) {
			List<double[]> pos = new ArrayList<>(), look = new ArrayList<>();
			int keys = Math.max(4, (int) Math.ceil(turn / 40));
			for (int i = 0; i <= keys; i++) {
				double a = Math.toRadians(from + turn * i / keys);
				pos.add(new double[] { x + Math.cos(a) * radius, y, z + Math.sin(a) * radius });
				look.add(new double[] { x, lookY, z });
			}
			return new Shot(id, seconds, pos, look);
		}

		/**
		 * The flattest dry, open 16×16 spot within 52 blocks of the village, at least 18 from its middle
		 * and, when `ax` is given, 32 from that spot.
		 */
		int[] flattest(int cx, int cz, int ax, int az) {
			int[] best = { cx + 24, cz + 24, -1 };
			int bestScore = Integer.MAX_VALUE;
			double bestDist = Double.MAX_VALUE;
			for (int x = cx - 56; x <= cx + 56; x += 8) {
				for (int z = cz - 56; z <= cz + 56; z += 8) {
					double d = Math.hypot(x - cx, z - cz);
					if (d > 52 || d < 18) continue;
					if (ax != Integer.MIN_VALUE && Math.hypot(x - ax, z - az) < 32) continue;
					int min = Integer.MAX_VALUE, max = Integer.MIN_VALUE;
					boolean ok = true;
					for (int a = -8; a <= 8 && ok; a += 4) {
						for (int b = -8; b <= 8 && ok; b += 4) {
							int gx = x + a, gz = z + b, gy = ground(gx, gz);
							if (top(gx, gz) != gy || water(gx, gz)) ok = false;
							min = Math.min(min, gy);
							max = Math.max(max, gy);
						}
					}
					if (!ok) continue;
					int score = max - min;
					if (score < bestScore || score == bestScore && d < bestDist) {
						bestScore = score;
						bestDist = d;
						best = new int[] { x, z, score };
					}
				}
			}
			return best;
		}
	}

	// ---------- opening the world ----------

	/** Whether this is the scene's world (its name and seed), so a benchmark here flies the scene. */
	public static boolean isSceneWorld(Minecraft mc) {
		MinecraftServer server = mc.getSingleplayerServer();
		return server != null && WORLD.equals(server.getWorldData().getLevelName()) && server.overworld().getSeed() == SEED;
	}

	/** Opens the scene's world from the menu (or makes it the first time); the run starts once in. */
	public static void open(Minecraft mc) {
		if (mc.level != null || stage != Stage.NONE) return;
		requested = false;
		if (mc.getLevelSource().levelExists(WORLD)) {
			stage = Stage.JOINING;
			stageTicks = 0;
			//#if MC >= 1.21.1
			mc.createWorldOpenFlows().openWorld(WORLD, () -> {
				stage = Stage.NONE;
				mc.setScreenAndShow(new TitleScreen());
			});
			//#else
			//$ mc.createWorldOpenFlows().loadLevel(Compat.screen(mc), WORLD);
			//#endif
			return;
		}
		stage = Stage.CREATING;
		stageTicks = 0;
		//#if MC >= 1.21.9
		CreateWorldScreen.openFresh(mc, () -> mc.setScreenAndShow(new TitleScreen()));
		//#else
		//$ CreateWorldScreen.openFresh(mc, Compat.screen(mc));
		//#endif
	}

	public static boolean busy() {
		return stage != Stage.NONE;
	}

	/** Getting ready in the world (not yet measuring). */
	public static boolean preparing() {
		return stage.ordinal() >= Stage.SETUP.ordinal() && stage != Stage.RUNNING;
	}

	/** The run is over, measured or not: the camera, the time and the weather are the player's again. */
	static void stopped(Minecraft mc) {
		if (stage == Stage.NONE) return;
		stage = Stage.NONE;
		if (cameraBefore != null) mc.options.setCameraType(cameraBefore);
		cameraBefore = null;
	}

	/** Called by Benchmark.start in the scene's world. */
	static void prepare(Minecraft mc) {
		if (stage.ordinal() >= Stage.SETUP.ordinal()) return;
		stage = Stage.SETUP;
		stageTicks = 0;
		cameraBefore = mc.options.getCameraType();
		mc.options.setCameraType(CameraType.FIRST_PERSON);
		if (Compat.screen(mc) != null) mc.setScreenAndShow(null);
	}

	static void tick(Minecraft mc) {
		var screen = Compat.screen(mc);
		//#if MC >= 26.2
		boolean loading = mc.gui.overlay() != null;
		//#else
		//$ boolean loading = mc.getOverlay() != null;
		//#endif
		if (mc.level == null && stage == Stage.NONE) plan = null;
		if (requested && stage == Stage.NONE && mc.level == null && !loading
			// the menu, or the accessibility questions a game shows on its very first start
			&& (screen instanceof TitleScreen || screen instanceof dev.slash3rss.slashclient.hud.ui.SlashTitleScreen
				|| screen instanceof net.minecraft.client.gui.screens.AccessibilityOnboardingScreen)) {
			open(mc);
			return;
		}
		if (stage == Stage.NONE) return;
		stageTicks++;
		switch (stage) {
			case CREATING -> {
				if (screen instanceof CreateWorldScreen create) {
					WorldCreationUiState ui = create.getUiState();
					ui.setName(WORLD);
					ui.setSeed(String.valueOf(SEED));
					ui.setGameMode(WorldCreationUiState.SelectedGameMode.CREATIVE);
					ui.setDifficulty(Difficulty.PEACEFUL);
					ui.setGenerateStructures(true);
					ui.setBonusChest(false);
					stage = Stage.JOINING;
					stageTicks = 0;
					((CreateWorldScreenAccessor) create).slashclient$create();
				} else if (stageTicks > 20 * 120) stage = Stage.NONE;
			}
			case JOINING -> {
				if (mc.player != null && mc.level != null && screen == null && stageTicks > 10) {
					stage = Stage.NONE;
					// in the world: Benchmark.start goes on to prepare() here, or to the usual spin elsewhere
					Benchmark.start(mc);
				} else if (mc.level == null && stageTicks > 20 * 300) stage = Stage.NONE;
			}
			default -> prepTick(mc, screen);
		}
	}

	private static void prepTick(Minecraft mc, net.minecraft.client.gui.screens.Screen screen) {
		MinecraftServer server = mc.getSingleplayerServer();
		if (mc.player == null || mc.level == null || server == null) {
			stopped(mc);
			return;
		}
		// a menu over the game (the window lost focus, Esc) pauses the getting ready; Benchmark cancels a run
		if (screen != null && stage != Stage.RUNNING) {
			stageTicks--;
			return;
		}
		if (plan != null && stage.ordinal() > Stage.PLANNING.ordinal()) hold(mc);
		switch (stage) {
			case SETUP -> {
				server.execute(() -> {
					for (var player : server.getPlayerList().getPlayers()) player.setGameMode(net.minecraft.world.level.GameType.SPECTATOR);
				});
				run(server, "difficulty peaceful", "time set 6000", "weather clear 1000000",
					// the rules by their names before 1.21.11 and after
					"gamerule doDaylightCycle false", "gamerule advance_time false",
					"gamerule doWeatherCycle false", "gamerule advance_weather false",
					"gamerule doMobSpawning false", "gamerule spawn_mobs false",
					"gamerule doPatrolSpawning false", "gamerule spawn_patrols false",
					"gamerule doTraderSpawning false", "gamerule spawn_wandering_traders false",
					"gamerule randomTickSpeed 0", "gamerule random_tick_speed 0",
					"gamerule doMobLoot false", "gamerule mob_drops false",
					"gamerule doFireTick false", "gamerule fire_spread_radius_around_player 0");
				pendingPlan = null;
				planError = null;
				if (plan == null) {
					Path file = server.getWorldPath(LevelResource.ROOT).resolve(PLAN_FILE);
					server.execute(() -> {
						try {
							Plan p = read(file);
							if (p == null) {
								p = compute(server.overworld());
								Files.writeString(file, GSON.toJson(p));
							}
							pendingPlan = p;
						} catch (Exception e) {
							SlashHud.LOG.warn("Could not prepare the benchmark scene", e);
							planError = String.valueOf(e);
						}
					});
				}
				stage = Stage.PLANNING;
				stageTicks = 0;
			}
			case PLANNING -> {
				if (plan == null) plan = pendingPlan;
				if (planError != null) {
					Compat.overlay(mc, Component.translatable("slashclient-hud.benchmark.scene.failed"));
					stopped(mc);
					return;
				}
				if (plan == null) return;
				placeScene(server);
				stage = Stage.CHUNKS;
				stageTicks = 0;
			}
			case CHUNKS -> {
				// everything the camera can see is loaded (and on the first run generated) before measuring
				int r = Math.max(1, mc.options.renderDistance().get() - 1), ccx = plan.cx >> 4, ccz = plan.cz >> 4;
				chunksHave = chunksNeed = 0;
				for (int x = -r; x <= r; x++) {
					for (int z = -r; z <= r; z++) {
						if (x * x + z * z > r * r) continue;
						chunksNeed++;
						if (mc.level.getChunkSource().hasChunk(ccx + x, ccz + z)) chunksHave++;
					}
				}
				if (chunksHave >= chunksNeed && stageTicks > 20 || stageTicks > 20 * 240) {
					stage = Stage.PREWARM;
					stageTicks = 0;
					warmKey = 0;
					warmFrames = 0;
					warmSince = System.nanoTime();
					// the animals that were in the loaded chunks; ours are summoned again with the mark
					run(server, "kill @e[type=!minecraft:player,tag=!" + TAG + "]");
				}
			}
			case PREWARM -> {
				// the camera stops at each scene's key points until the chunks seen from there are built
				if (warmKey >= warmKeys()) {
					saved = false;
					settledAt = -1;
					run(server, "kill @e[type=!minecraft:player,tag=!" + TAG + "]", "save-all flush");
					server.execute(() -> saved = true);
					stage = Stage.SETTLE;
					stageTicks = 0;
				}
			}
			case SETTLE -> {
				if (!saved && stageTicks < 20 * 60) return;
				if (settledAt < 0) {
					// the garbage from loading (and the first time from making) the world, not collected mid-run
					System.gc();
					settledAt = stageTicks;
				}
				if (stageTicks - settledAt >= 20) {
					stage = Stage.RUNNING;
					Benchmark.begin(mc, plan);
				}
			}
			case RUNNING -> {
				if (!Benchmark.running()) {
					stopped(mc);
					return;
				}
				particles(mc);
			}
			default -> {}
		}
	}

	/** Every scene's first, middle and last key points: the frames there build what is seen. */
	private static int warmKeys() {
		return plan.shots.size() * 3;
	}

	private static double[] warmCamera(int index) {
		Shot s = plan.shots.get(Math.min(plan.shots.size() - 1, index / 3));
		int k = switch (index % 3) {
			case 0 -> 0;
			case 1 -> s.keys() / 2;
			default -> s.keys() - 1;
		};
		return new double[] { s.pos[k * 3], s.pos[k * 3 + 1], s.pos[k * 3 + 2], s.look[k * 3], s.look[k * 3 + 1], s.look[k * 3 + 2] };
	}

	/** The player waits still, high over the village, so the server keeps the same chunks. */
	private static void hold(Minecraft mc) {
		var p = mc.player;
		p.setPos(plan.cx + 0.5, plan.ground + 30, plan.cz + 0.5);
		p.setDeltaMovement(Vec3.ZERO);
	}

	/** Lanterns, the entities and the player in place. Done on every run: the same each time. */
	private static void placeScene(MinecraftServer server) {
		List<String> cmds = new ArrayList<>();
		cmds.add("kill @e[type=!minecraft:player]");
		cmds.add(String.format(Locale.ROOT, "tp @a %d %d %d", plan.cx, plan.ground + 30, plan.cz));
		for (int[] l : plan.lanterns) cmds.add(String.format(Locale.ROOT, "setblock %d %d %d minecraft:lantern", l[0], l[1], l[2]));
		int i = 0;
		for (double[] m : plan.mobs) {
			String kind = MOBS[(int) m[3]];
			String nbt = "armor_stand".equals(kind) ? String.format(Locale.ROOT, "{Tags:[\"%s\"],Invulnerable:1b,ShowArms:1b,Rotation:[%df,0f]}", TAG, i * 23 % 360)
				: String.format(Locale.ROOT, "{Tags:[\"%s\"],NoAI:1b,Silent:1b,Invulnerable:1b,PersistenceRequired:1b,Rotation:[%df,0f]%s}", TAG, i * 37 % 360,
					"sheep".equals(kind) ? ",Color:" + (i % 16) + "b" : "");
			cmds.add(String.format(Locale.ROOT, "summon minecraft:%s %.2f %.2f %.2f %s", kind, m[0], m[1], m[2], nbt));
			i++;
		}
		run(server, cmds.toArray(new String[0]));
	}

	private static void run(MinecraftServer server, String... commands) {
		server.execute(() -> {
			var source = server.createCommandSourceStack().withSuppressedOutput();
			for (String c : commands) {
				try {
					server.getCommands().performPrefixedCommand(source, c);
				} catch (RuntimeException e) {
					// a rule this version does not have: the other name does it
				}
			}
		});
	}

	private static Plan read(Path file) {
		try {
			if (!Files.exists(file)) return null;
			Plan p = GSON.fromJson(Files.readString(file), Plan.class);
			return p != null && p.version == PLAN_VERSION && p.shots != null && !p.shots.isEmpty() ? p : null;
		} catch (Exception e) {
			return null;
		}
	}

	// ---------- the camera ----------

	/**
	 * Where the camera is this frame (x, y, z, yaw, pitch), or null when the scene does not move it.
	 * Called by the camera mixin every frame.
	 */
	public static double[] camera() {
		if (plan == null || stage.ordinal() < Stage.PREWARM.ordinal()) return null;
		double[] at;
		if (stage == Stage.PREWARM || stage == Stage.SETTLE) {
			at = warmCamera(stage == Stage.SETTLE ? 0 : warmKey);
			if (stage == Stage.PREWARM) warmStep();
		} else {
			double s = Benchmark.flightTime();
			if (s < 0) at = warmCamera(0);
			else {
				int i = plan.shotAt(s);
				Shot sh = plan.shots.get(i);
				double u = Math.min(1, (s - plan.shotStart(i)) / sh.seconds);
				double[] p = spline(sh.pos, u), l = spline(sh.look, u);
				at = new double[] { p[0], p[1], p[2], l[0], l[1], l[2] };
			}
		}
		double dx = at[3] - at[0], dy = at[4] - at[1], dz = at[5] - at[2];
		double yaw = Math.toDegrees(Math.atan2(-dx, dz));
		double pitch = -Math.toDegrees(Math.atan2(dy, Math.hypot(dx, dz)));
		return new double[] { at[0], at[1], at[2], yaw, pitch };
	}

	/** One more frame at this key point; on to the next once it is built (or after 1.5 s). */
	private static void warmStep() {
		warmFrames++;
		long now = System.nanoTime();
		Minecraft mc = Minecraft.getInstance();
		if (warmFrames >= 6 && (allBuilt(mc) || now - warmSince > 1_500_000_000L)) {
			warmKey++;
			warmFrames = 0;
			warmSince = now;
		}
	}

	private static boolean allBuilt(Minecraft mc) {
		//#if MC >= 1.20.2
		return mc.levelRenderer.hasRenderedAllSections();
		//#else
		//$ return mc.levelRenderer.hasRenderedAllChunks();
		//#endif
	}

	/** A smooth curve through the key points (Catmull-Rom), u from 0 to 1. */
	static double[] spline(double[] keys, double u) {
		int n = keys.length / 3;
		if (n == 1) return new double[] { keys[0], keys[1], keys[2] };
		double f = u * (n - 1);
		int i = Math.min(n - 2, (int) Math.floor(f));
		double t = f - i;
		int i0 = Math.max(0, i - 1), i2 = i + 1, i3 = Math.min(n - 1, i + 2);
		double[] out = new double[3];
		for (int c = 0; c < 3; c++) {
			double p0 = keys[i0 * 3 + c], p1 = keys[i * 3 + c], p2 = keys[i2 * 3 + c], p3 = keys[i3 * 3 + c];
			out[c] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
		}
		return out;
	}

	/** The scene's fixed time of day (night in the last scene), or -1 when the scene is not on. */
	public static long time() {
		if (plan == null || stage.ordinal() < Stage.PLANNING.ordinal()) return -1;
		if (stage == Stage.RUNNING) {
			double s = Benchmark.flightTime();
			if (s >= 0 && "night".equals(plan.shots.get(plan.shotAt(s)).id)) return 18000;
		}
		if (stage == Stage.PREWARM && warmKey / 3 < plan.shots.size() && "night".equals(plan.shots.get(warmKey / 3).id)) return 18000;
		return 6000;
	}

	/** No rain while the scene is on, whatever the server's weather. */
	public static boolean active() {
		return stage.ordinal() >= Stage.SETUP.ordinal();
	}

	private static final SimpleParticleType[] PARTICLES = { ParticleTypes.FLAME, ParticleTypes.END_ROD, ParticleTypes.HAPPY_VILLAGER, ParticleTypes.CLOUD,
		ParticleTypes.CRIT, ParticleTypes.SOUL_FIRE_FLAME, ParticleTypes.ELECTRIC_SPARK, ParticleTypes.FIREWORK };

	/** The particle scene: the same 80 particles every tick, from a fixed sequence. */
	private static void particles(Minecraft mc) {
		double s = Benchmark.flightTime();
		if (s < 0 || plan.fountain == null || !"particles".equals(plan.shots.get(plan.shotAt(s)).id)) {
			particleTick = 0;
			return;
		}
		Random r = new Random(particleTick++ * 7919L);
		double fx = plan.fountain[0], fy = plan.fountain[1], fz = plan.fountain[2];
		for (int i = 0; i < 80; i++) {
			double a = r.nextDouble() * Math.PI * 2, d = 0.5 + r.nextDouble() * 5;
			double x = fx + Math.cos(a) * d, y = fy + 0.2 + r.nextDouble() * 2.5, z = fz + Math.sin(a) * d;
			mc.level.addParticle(PARTICLES[i % PARTICLES.length], x, y, z, (r.nextDouble() - 0.5) * 0.1, 0.05 + r.nextDouble() * 0.2, (r.nextDouble() - 0.5) * 0.1);
		}
	}

	// ---------- what the player sees while it gets ready, and the scene's name during the run ----------

	static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		if (!preparing() || Compat.screen(mc) != null) return;
		String key;
		double done;
		switch (stage) {
			case SETUP, PLANNING -> {
				key = "slashclient-hud.benchmark.scene.places";
				done = 0.02;
			}
			case CHUNKS -> {
				key = chunksNeed == 0 ? "slashclient-hud.benchmark.scene.places" : "slashclient-hud.benchmark.scene.chunks";
				done = 0.05 + 0.6 * (chunksNeed == 0 ? 0 : (double) chunksHave / chunksNeed);
			}
			default -> {
				key = "slashclient-hud.benchmark.scene.build";
				done = 0.65 + 0.35 * Math.min(1, (double) warmKey / Math.max(1, plan == null ? 1 : warmKeys()));
			}
		}
		Component label = Ui.trBold("slashclient-hud.benchmark.scene.preparing");
		Component sub = stage == Stage.CHUNKS && chunksNeed > 0 ? Ui.tr(key, chunksHave, chunksNeed) : Ui.tr(key);
		// like a loading screen: the camera jumps between the scenes while their chunks are built
		g.fill(0, 0, g.guiWidth(), g.guiHeight(), 0xE80A0D14);
		int w = Math.min(g.guiWidth() - 12, Math.max(220, Math.max(Ui.width(label), Ui.width(sub)) + 20)), x = (g.guiWidth() - w) / 2, y = g.guiHeight() / 2 - 18;
		Ui.round(g, x, y, w, 36, 6, 0xC0111622);
		Ui.draw(g, Ui.fit(label, w - 16), x + 8, y + 5, Ui.TEXT);
		Ui.draw(g, Ui.fit(sub, w - 16), x + 8, y + 16, Ui.TEXT_2);
		Ui.round(g, x + 8, y + 28, w - 16, 3, 1, 0xFF2A3142);
		Ui.round(g, x + 8, y + 28, Math.max(2, (int) ((w - 16) * Math.min(1, done))), 3, 1, Ui.ACCENT);
	}

	/** The scene's name as the player reads it. */
	public static Component name(String id) {
		return Component.translatable("slashclient-hud.benchmark.scene." + id);
	}

	/** For the test: the stage and the scene now. */
	public static String state() {
		String shot = "";
		if (stage == Stage.RUNNING && plan != null) {
			double s = Benchmark.flightTime();
			if (s >= 0) shot = plan.shots.get(plan.shotAt(s)).id;
		}
		return stage.name().toLowerCase(Locale.ROOT) + " " + shot;
	}
}
