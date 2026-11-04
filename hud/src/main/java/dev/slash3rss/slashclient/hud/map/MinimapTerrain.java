package dev.slash3rss.slashclient.hud.map;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.MapColor;

import java.util.Arrays;

/**
 * What the minimap knows of the ground: for every column of the loaded chunks around the player
 * its top block's map colour and height, as a map item would draw it. Only terrain: no entities.
 *
 * The columns are kept in a grid of 32×32 chunks that wraps around (a chunk lands in the slot of
 * its coordinates modulo 32), so walking on just fills new slots. Each tick a few chunks are read:
 * those not read yet first, nearest first, then one near chunk and one of the rest again in turn,
 * so blocks placed or broken show within a few seconds and no tick reads much.
 *
 * Where the dimension has a roof (the Nether), and in caves (the player underground, or always,
 * by the setting), a column is read from just above the player's height down to the first floor
 * under open space, not from the top, which would be the roof or the surface far above; a chunk is
 * read again once the player is a few blocks higher or lower. In caves, solid rock is drawn dark,
 * so the tunnels stand out.
 *
 * Every chunk read is also remembered as drawn (its 256 colours, and its biomes) for the full map
 * (WorldMapScreen), per dimension and apart for the caves, while the player stays in the same world:
 * the map shows all that was seen, not only the grid around the player. At most EXPLORED chunks a
 * layer (about 1 MB each 1000): the ones read longest ago go first. Saved on disk (MapStore) for the
 * next time, unless switched off.
 */
public final class MinimapTerrain {
	private MinimapTerrain() {}

	public static final String[] CAVE_MODES = { "auto", "always", "off" };
	public static final String[] SHADINGS = { "relief", "classic" };
	static final int SLOTS = 32, SIZE = SLOTS * 16;
	private static final int MASK = SIZE - 1;
	/** How far around the player chunks are read (fits in the grid with a chunk to spare). */
	static final int RADIUS = 15;
	/** Chunks read a tick when there are unread ones about. */
	private static final int BUDGET = 6;
	/** The ring of near chunks read again in turn (within 2 chunks: the first 25 of RING). */
	private static final int NEAR = 25;
	/** With nothing showing the ground, read chunks are looked at again only every this many ticks. */
	private static final int IDLE = 4;
	private static final long EMPTY = Long.MIN_VALUE;
	/** Water's colour is stored with this alpha: it is drawn flat, its depth already in the colour. */
	static final int FLAT = 0xFE000000;
	/** Solid rock in a cave: dark, drawn flat. */
	private static final int ROCK = FLAT | 0x24262C;
	/** Ticks underground (or back up) before the minimap switches to the caves (or back), so it does not flicker. */
	private static final int CAVE_TICKS = 20;

	/** Per column: 0 when nothing is there (void), else 0xFF/0xFE alpha and the map colour. */
	private static int[] color;
	private static short[] height;
	/** Per column: its colour as drawn (what sample gives), worked out when its chunk or a neighbour is read. */
	private static int[] drawn;
	/** Which chunk each slot holds, and the height a roofed dimension's (or a cave's) chunk was read at. */
	private static long[] slotKey;
	private static int[] slotBase;
	private static ClientLevel level;
	private static int nearTurn, allTurn, idleTurn;
	/** Goes up whenever a column changed, so the view knows to paint itself again. */
	static int version;
	/** The chunks seen in each layer (dimension, its caves apart) of this world, as drawn, the most recently read last. */
	static final int EXPLORED = 20_000;
	static final java.util.Map<String, java.util.LinkedHashMap<Long, Chunk>> explored = new java.util.HashMap<>();
	private static java.util.LinkedHashMap<Long, Chunk> seen = new java.util.LinkedHashMap<>();
	private static String seenWorld = "", seenLayer = "";
	/** Goes up whenever a chunk of the full map changed. */
	static int exploredVersion;
	/** Whether the ground is read as caves now, and how many ticks the player has been underground (or above) for it. */
	static boolean cave;
	private static int caveTicks;
	private static String shading = "";
	/** Chunk offsets around the player, nearest first. */
	private static final int[][] RING = ring();

	/** A chunk as the full map draws it: 256 colours (0xFFRRGGBB, 0 nothing) and its biomes, one each 4×4 columns. */
	record Chunk(int[] cols, short[] biomes) {}

	private static int[][] ring() {
		int n = RADIUS * 2 + 1;
		int[][] out = new int[n * n][];
		int i = 0;
		for (int dx = -RADIUS; dx <= RADIUS; dx++) for (int dz = -RADIUS; dz <= RADIUS; dz++) out[i++] = new int[] { dx, dz };
		Arrays.sort(out, (a, b) -> Integer.compare(a[0] * a[0] + a[1] * a[1], b[0] * b[0] + b[1] * b[1]));
		return out;
	}

	static long key(int cx, int cz) {
		return (long) cx << 32 | cz & 0xFFFFFFFFL;
	}

	private static int slot(int cx, int cz) {
		return (cz & SLOTS - 1) * SLOTS + (cx & SLOTS - 1);
	}

	/** Forgets everything (another world or dimension). */
	static void clear() {
		if (slotKey != null) Arrays.fill(slotKey, EMPTY);
		version++;
	}

	/** Whether the maps show the caves now. */
	public static boolean caves() {
		return cave;
	}

	/** The layer the full map shows now: the dimension, or its caves. */
	static String layer(Minecraft mc) {
		return Waypoints.dimension(mc) + (cave ? "#cave" : "");
	}

	/**
	 * `idle`: nothing shows the ground right now (the minimap is off and the full map closed). New
	 * chunks are still read, so the full map keeps all that was seen, but read ones are looked at
	 * again only every IDLE ticks instead of every tick.
	 */
	static void tick(Minecraft mc, boolean idle) {
		if (color == null) {
			color = new int[SIZE * SIZE];
			height = new short[SIZE * SIZE];
			drawn = new int[SIZE * SIZE];
			slotKey = new long[SLOTS * SLOTS];
			slotBase = new int[SLOTS * SLOTS];
			Arrays.fill(slotKey, EMPTY);
		}
		// another world (or another mode of a server network, read from the tab list a moment after
		// joining it) forgets what was seen (saved first); another dimension of the same one keeps it for coming back
		String world = WaypointKeys.terrainKey(mc);
		boolean roof = mc.level.dimensionType().hasCeiling();
		boolean nowCave = !roof && caveWanted(mc);
		if (mc.level != level || !world.equals(seenWorld) || nowCave != cave) {
			level = mc.level;
			cave = nowCave;
			clear();
			if (!world.equals(seenWorld)) {
				MapStore.leave(seenWorld);
				explored.clear();
				MapBiomes.clear();
				MapTrail.clear();
				seenWorld = world;
				MapStore.enter(world);
			}
			seenLayer = layer(mc);
			seen = explored.computeIfAbsent(seenLayer, k -> new java.util.LinkedHashMap<>());
			lastKey = Long.MIN_VALUE;
			exploredVersion++;
		}
		// the look of slopes changed: read again
		String nowShading = SlashHud.config == null ? "relief" : SlashHud.config.mapShading;
		if (!nowShading.equals(shading)) {
			shading = nowShading;
			clear();
		}
		MapStore.tick(mc);
		boolean under = roof || cave;
		int base = mc.player.getBlockY();
		int pcx = mc.player.getBlockX() >> 4, pcz = mc.player.getBlockZ() >> 4;
		// chunks not read yet (or read at another height underground), nearest first
		int budget = BUDGET;
		for (int[] o : RING) {
			int cx = pcx + o[0], cz = pcz + o[1];
			int s = slot(cx, cz);
			if (slotKey[s] == key(cx, cz) && (!under || Math.abs(slotBase[s] - base) < 6)) continue;
			if (!level.hasChunk(cx, cz)) continue;
			read(cx, cz, under, base);
			if (--budget == 0) break;
		}
		// and again in turn, for blocks placed and broken: the near ones every ~1 s, the rest every ~50 s
		if (idle && idleTurn++ % IDLE != 0) return;
		int[] near = RING[nearTurn++ % NEAR];
		if (level.hasChunk(pcx + near[0], pcz + near[1])) read(pcx + near[0], pcz + near[1], under, base);
		int[] far = RING[NEAR + allTurn++ % (RING.length - NEAR)];
		if (level.hasChunk(pcx + far[0], pcz + far[1])) read(pcx + far[0], pcz + far[1], under, base);
	}

	/** Whether the maps show the caves: always, never, or (auto) once the player has been underground for a second. */
	private static boolean caveWanted(Minecraft mc) {
		String mode = SlashHud.config == null ? "auto" : SlashHud.config.mapCave;
		if (mode.equals("off")) return false;
		if (mode.equals("always")) return true;
		boolean under = underground(mc);
		caveTicks = under ? Math.min(CAVE_TICKS, caveTicks + 1) : Math.max(0, caveTicks - 1);
		return cave ? caveTicks > 0 : caveTicks >= CAVE_TICKS;
	}

	/** No sky over the player's head and ground well above it (not just a roof over a house). */
	private static boolean underground(Minecraft mc) {
		var p = mc.player;
		BlockPos head = BlockPos.containing(p.getX(), p.getEyeY(), p.getZ());
		if (mc.level.canSeeSky(head)) return false;
		return mc.level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, head.getX(), head.getZ()) > head.getY() + 6;
	}

	/** One chunk's columns into the grid. */
	private static void read(int cx, int cz, boolean under, int base) {
		LevelChunk chunk = level.getChunk(cx, cz);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int minY = level.dimensionType().minY();
		int maxY = minY + level.dimensionType().height() - 1;
		int s = slot(cx, cz);
		boolean changed = slotKey[s] != key(cx, cz);
		for (int lz = 0; lz < 16; lz++) {
			for (int lx = 0; lx < 16; lx++) {
				int x = cx * 16 + lx, z = cz * 16 + lz;
				int y = under ? underRoof(chunk, pos, x, z, Math.min(maxY, base + 2), minY) : chunk.getHeight(Heightmap.Types.WORLD_SURFACE, x, z);
				int argb, h;
				if (y == Integer.MIN_VALUE) {
					// in a cave, no open space near the player's height: solid rock
					y = Math.min(maxY, base + 2);
					if (cave) {
						argb = ROCK;
						h = y;
						changed |= put(x, z, argb, h);
						continue;
					}
				}
				// down past what a map draws nothing for (air, glass, …)
				MapColor col = MapColor.NONE;
				for (; y >= minY; y--) {
					col = chunk.getBlockState(pos.set(x, y, z)).getMapColor(level, pos);
					if (col != MapColor.NONE) break;
				}
				h = y;
				if (y < minY) {
					argb = 0;
				} else if (col == MapColor.WATER) {
					// water darker the deeper it is, drawn flat
					int depth = 1;
					while (depth < 16 && y - depth >= minY && chunk.getBlockState(pos.set(x, y - depth, z)).getMapColor(level, pos) == MapColor.WATER) depth++;
					argb = FLAT | shade(col.col, 1.08f - Math.min(depth, 12) * 0.035f);
				} else {
					argb = 0xFF000000 | col.col;
				}
				changed |= put(x, z, argb, h);
			}
		}
		slotKey[s] = key(cx, cz);
		slotBase[s] = base;
		for (int lz = 0; lz < 16; lz++) for (int lx = 0; lx < 16; lx++) shadeColumn(cx * 16 + lx, cz * 16 + lz);
		// the first row of the chunk in the slot south of it (and the first column of the one east of it) is
		// shaded against this one (or against nothing, when it is not its neighbour): worked out again
		long south = slotKey[slot(cx, cz + 1)];
		if (south != EMPTY) {
			int sx = (int) (south >> 32), sz = (int) south;
			for (int lx = 0; lx < 16; lx++) shadeColumn(sx * 16 + lx, sz * 16);
		}
		long east = slotKey[slot(cx + 1, cz)];
		if (east != EMPTY) {
			int ex = (int) (east >> 32), ez = (int) east;
			for (int lz = 0; lz < 16; lz++) shadeColumn(ex * 16, ez * 16 + lz);
		}
		if (changed) version++;
		remember(cx, cz, biomes(chunk, cx, cz, under, base));
		// the chunks south and east of it are shaded by this one's last row and column: drawn again for the full map
		if (changed && seen.containsKey(key(cx, cz + 1)) && slotKey[slot(cx, cz + 1)] == key(cx, cz + 1)) remember(cx, cz + 1, null);
		if (changed && seen.containsKey(key(cx + 1, cz)) && slotKey[slot(cx + 1, cz)] == key(cx + 1, cz)) remember(cx + 1, cz, null);
	}

	/** A column's colour and height into the grid: whether it changed. */
	private static boolean put(int x, int z, int argb, int h) {
		int i = (z & MASK) * SIZE + (x & MASK);
		if (color[i] == argb && height[i] == h) return false;
		color[i] = argb;
		height[i] = (short) h;
		return true;
	}

	/** The chunk's biomes, one each 4×4 columns, at the ground's height (or the player's, underground). */
	private static short[] biomes(LevelChunk chunk, int cx, int cz, boolean under, int base) {
		short[] out = new short[16];
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int qz = 0; qz < 4; qz++) {
			for (int qx = 0; qx < 4; qx++) {
				int x = cx * 16 + qx * 4 + 2, z = cz * 16 + qz * 4 + 2;
				int y = under ? base : chunk.getHeight(Heightmap.Types.WORLD_SURFACE, x, z);
				out[qz * 4 + qx] = MapBiomes.number(level.getBiome(pos.set(x, y, z)).getRegisteredName());
			}
		}
		return out;
	}

	/** A chunk as drawn into the full map's memory, now the newest (the oldest go when it is full); `biomes` null: as they were. */
	private static void remember(int cx, int cz, short[] biomes) {
		long k = key(cx, cz);
		Chunk old = seen.remove(k);
		boolean changed = old == null;
		int[] cols = old == null ? new int[256] : old.cols();
		for (int lz = 0; lz < 16; lz++) {
			for (int lx = 0; lx < 16; lx++) {
				int c = sample(cx * 16 + lx, cz * 16 + lz);
				if (cols[lz * 16 + lx] != c) {
					cols[lz * 16 + lx] = c;
					changed = true;
				}
			}
		}
		if (biomes == null) biomes = old == null ? new short[16] : old.biomes();
		else if (old != null && !Arrays.equals(old.biomes(), biomes)) changed = true;
		seen.put(k, new Chunk(cols, biomes));
		while (seen.size() > EXPLORED) {
			var it = seen.keySet().iterator();
			it.next();
			it.remove();
			lastKey = Long.MIN_VALUE;
		}
		if (changed) {
			exploredVersion++;
			MapStore.changed(seenLayer);
		}
	}

	/** The last chunk the full map looked up, so a picture's row does not ask the map each pixel. */
	private static long lastKey = Long.MIN_VALUE;
	private static Chunk lastChunk;

	private static Chunk chunkAt(int x, int z) {
		long k = key(x >> 4, z >> 4);
		if (k != lastKey) {
			lastKey = k;
			lastChunk = seen.get(k);
		}
		return lastChunk;
	}

	/** A column's colour as the full map draws it (0xFFRRGGBB), or 0 where nothing was seen in this layer. */
	public static int explored(int x, int z) {
		Chunk c = chunkAt(x, z);
		return c == null ? 0 : c.cols()[(z & 15) * 16 + (x & 15)];
	}

	/** The biome of a column the full map knows (its id), or null. */
	public static String exploredBiome(int x, int z) {
		Chunk c = chunkAt(x, z);
		return c == null ? null : MapBiomes.id(c.biomes()[(z & 15) / 4 * 4 + (x & 15) / 4]);
	}

	/** Whose explored map is kept now (WaypointKeys.terrainKey). */
	static String exploredWorld() {
		return seenWorld;
	}

	/** How many chunks the full map knows in this layer (for the test and the map's corner). */
	public static int exploredChunks() {
		return seen.size();
	}

	/** Chunks loaded from disk put before those seen now (as older), at most EXPLORED in all. */
	static void merge(String layer, java.util.LinkedHashMap<Long, Chunk> loaded) {
		var now = explored.get(layer);
		java.util.LinkedHashMap<Long, Chunk> all = new java.util.LinkedHashMap<>();
		int room = EXPLORED - (now == null ? 0 : now.size());
		int skip = Math.max(0, loaded.size() - room);
		for (var e : loaded.entrySet()) {
			if (skip > 0) {
				skip--;
				continue;
			}
			if (now == null || !now.containsKey(e.getKey())) all.put(e.getKey(), e.getValue());
		}
		if (now != null) all.putAll(now);
		explored.put(layer, all);
		if (layer.equals(seenLayer)) seen = all;
		lastKey = Long.MIN_VALUE;
		exploredVersion++;
	}

	/**
	 * Underground: where to start looking down in a column, from just above the player. Standing
	 * in rock (or under a low ceiling), first down through it to open space, up to 16 blocks; with
	 * none there, Integer.MIN_VALUE (the rock itself).
	 */
	private static int underRoof(LevelChunk chunk, BlockPos.MutableBlockPos pos, int x, int z, int from, int minY) {
		int y = from;
		for (int k = 0; k < 16 && y > minY; k++, y--) {
			BlockState state = chunk.getBlockState(pos.set(x, y, z));
			if (state.isAir()) return y;
		}
		return Integer.MIN_VALUE;
	}

	/**
	 * The colour of a column as drawn (0xFFRRGGBB), or 0 where nothing is known: lighter where the
	 * ground rises from the columns north (and west) of it and darker where it falls, as on a map item.
	 */
	public static int sample(int x, int z) {
		if (color == null) return 0;
		int cx = x >> 4, cz = z >> 4;
		if (slotKey[slot(cx, cz)] != key(cx, cz)) return 0;
		// worked out once when read: the minimap asks for every pixel of every picture it paints
		return drawn[(z & MASK) * SIZE + (x & MASK)];
	}

	/** The height of a column in the grid, or Integer.MIN_VALUE when it is not known (or nothing is there). */
	private static int knownHeight(int x, int z) {
		int cx = x >> 4, cz = z >> 4;
		if (slotKey[slot(cx, cz)] != key(cx, cz)) return Integer.MIN_VALUE;
		int j = (z & MASK) * SIZE + (x & MASK);
		return color[j] == 0 ? Integer.MIN_VALUE : height[j];
	}

	/**
	 * A column of a chunk in the grid: its colour as drawn, from its own top and the columns next to it. Classic: three
	 * steps against the column north, as on a map item; relief: by how much the ground rises against the columns north
	 * and west, in finer steps, so hills and valleys show their shape.
	 */
	private static void shadeColumn(int x, int z) {
		int i = (z & MASK) * SIZE + (x & MASK);
		int c = color[i];
		if (c == 0) {
			drawn[i] = 0;
			return;
		}
		if ((c & 0xFF000000) == FLAT) {
			drawn[i] = c | 0xFF000000;
			return;
		}
		int h = height[i], north = knownHeight(x, z - 1);
		float f;
		if ("classic".equals(shading)) {
			int rise = north == Integer.MIN_VALUE ? 0 : h - north;
			f = rise > 0 ? 1.08f : rise < 0 ? 0.80f : 0.94f;
		} else {
			int west = knownHeight(x - 1, z);
			int rise = (north == Integer.MIN_VALUE ? 0 : h - north) + (west == Integer.MIN_VALUE ? 0 : h - west);
			f = 0.94f + Math.max(-6, Math.min(6, rise)) * 0.035f;
		}
		drawn[i] = 0xFF000000 | shade(c, f);
	}

	/** The height of a known column, or Integer.MIN_VALUE. */
	public static int heightAt(int x, int z) {
		if (color == null) return Integer.MIN_VALUE;
		return knownHeight(x, z);
	}

	/** How many chunks are known (for the test). */
	static int chunksKnown() {
		if (slotKey == null) return 0;
		int n = 0;
		for (long k : slotKey) if (k != EMPTY) n++;
		return n;
	}

	/**
	 * How bright the maps are drawn now (1 by day): darker at night, by the time of day, where the dimension has a sky
	 * and the setting is on (not in caves, which are dark anyway). In steps of 0.05, so a picture is not painted anew each tick.
	 */
	static float night(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.mapNight || mc.level == null || cave || !mc.level.dimensionType().hasSkyLight()) return 1f;
		long t = mc.level.getOverworldClockTime() % 24000;
		// dusk from 12000 to 13800, dark until 22200, dawn until 24000
		float dark = t < 12000 ? 0 : t < 13800 ? (t - 12000) / 1800f : t < 22200 ? 1 : (24000 - t) / 1800f;
		return Math.round((1f - 0.45f * dark) * 20) / 20f;
	}

	/** A colour (0xAARRGGBB) at `f` of its brightness. */
	static int dim(int argb, float f) {
		if (f >= 1f || argb == 0) return argb;
		return argb & 0xFF000000 | shade(argb & 0xFFFFFF, f);
	}

	static int shade(int rgb, float f) {
		int r = Math.min(255, Math.round((rgb >> 16 & 0xFF) * f));
		int g = Math.min(255, Math.round((rgb >> 8 & 0xFF) * f));
		int b = Math.min(255, Math.round((rgb & 0xFF) * f));
		return r << 16 | g << 8 | b;
	}
}
