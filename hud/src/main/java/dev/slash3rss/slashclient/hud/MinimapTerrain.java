package dev.slash3rss.slashclient.hud;

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
 * Where the dimension has a roof (the Nether), a column is read from just above the player's
 * height down to the first floor under open space, not from the top, which would be the bedrock
 * roof; a chunk is read again once the player is a few blocks higher or lower.
 */
final class MinimapTerrain {
	private MinimapTerrain() {}

	static final int SLOTS = 32, SIZE = SLOTS * 16;
	private static final int MASK = SIZE - 1;
	/** How far around the player chunks are read (fits in the grid with a chunk to spare). */
	static final int RADIUS = 15;
	/** Chunks read a tick when there are unread ones about. */
	private static final int BUDGET = 6;
	/** The ring of near chunks read again in turn (within 2 chunks: the first 25 of RING). */
	private static final int NEAR = 25;
	private static final long EMPTY = Long.MIN_VALUE;
	/** Water's colour is stored with this alpha: it is drawn flat, its depth already in the colour. */
	static final int FLAT = 0xFE000000;

	/** Per column: 0 when nothing is there (void), else 0xFF/0xFE alpha and the map colour. */
	private static int[] color;
	private static short[] height;
	/** Which chunk each slot holds, and the height a roofed dimension's chunk was read at. */
	private static long[] slotKey;
	private static int[] slotBase;
	private static ClientLevel level;
	private static int nearTurn, allTurn;
	/** Goes up whenever a column changed, so the view knows to paint itself again. */
	static int version;
	/** Chunk offsets around the player, nearest first. */
	private static final int[][] RING = ring();

	private static int[][] ring() {
		int n = RADIUS * 2 + 1;
		int[][] out = new int[n * n][];
		int i = 0;
		for (int dx = -RADIUS; dx <= RADIUS; dx++) for (int dz = -RADIUS; dz <= RADIUS; dz++) out[i++] = new int[] { dx, dz };
		Arrays.sort(out, (a, b) -> Integer.compare(a[0] * a[0] + a[1] * a[1], b[0] * b[0] + b[1] * b[1]));
		return out;
	}

	private static long key(int cx, int cz) {
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

	static void tick(Minecraft mc) {
		if (color == null) {
			color = new int[SIZE * SIZE];
			height = new short[SIZE * SIZE];
			slotKey = new long[SLOTS * SLOTS];
			slotBase = new int[SLOTS * SLOTS];
			Arrays.fill(slotKey, EMPTY);
		}
		if (mc.level != level) {
			level = mc.level;
			clear();
		}
		boolean roof = level.dimensionType().hasCeiling();
		int base = mc.player.getBlockY();
		int pcx = mc.player.getBlockX() >> 4, pcz = mc.player.getBlockZ() >> 4;
		// chunks not read yet (or read at another height under a roof), nearest first
		int budget = BUDGET;
		for (int[] o : RING) {
			int cx = pcx + o[0], cz = pcz + o[1];
			int s = slot(cx, cz);
			if (slotKey[s] == key(cx, cz) && (!roof || Math.abs(slotBase[s] - base) < 6)) continue;
			if (!level.hasChunk(cx, cz)) continue;
			read(cx, cz, roof, base);
			if (--budget == 0) break;
		}
		// and again in turn, for blocks placed and broken: the near ones every ~1 s, the rest every ~50 s
		int[] near = RING[nearTurn++ % NEAR];
		if (level.hasChunk(pcx + near[0], pcz + near[1])) read(pcx + near[0], pcz + near[1], roof, base);
		int[] far = RING[NEAR + allTurn++ % (RING.length - NEAR)];
		if (level.hasChunk(pcx + far[0], pcz + far[1])) read(pcx + far[0], pcz + far[1], roof, base);
	}

	/** One chunk's columns into the grid. */
	private static void read(int cx, int cz, boolean roof, int base) {
		LevelChunk chunk = level.getChunk(cx, cz);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int minY = level.dimensionType().minY();
		int maxY = minY + level.dimensionType().height() - 1;
		int s = slot(cx, cz);
		boolean changed = slotKey[s] != key(cx, cz);
		for (int lz = 0; lz < 16; lz++) {
			for (int lx = 0; lx < 16; lx++) {
				int x = cx * 16 + lx, z = cz * 16 + lz;
				int y = roof ? underRoof(chunk, pos, x, z, Math.min(maxY, base + 2), minY) : chunk.getHeight(Heightmap.Types.WORLD_SURFACE, x, z);
				// down past what a map draws nothing for (air, glass, …)
				MapColor col = MapColor.NONE;
				for (; y >= minY; y--) {
					col = chunk.getBlockState(pos.set(x, y, z)).getMapColor(level, pos);
					if (col != MapColor.NONE) break;
				}
				int argb, h = y;
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
				int i = (z & MASK) * SIZE + (x & MASK);
				if (color[i] != argb || height[i] != h) {
					color[i] = argb;
					height[i] = (short) h;
					changed = true;
				}
			}
		}
		slotKey[s] = key(cx, cz);
		slotBase[s] = base;
		if (changed) version++;
	}

	/**
	 * Under a roof: where to start looking down in a column, from just above the player. Standing
	 * in rock (or under a low ceiling), first down through it to open space, up to 16 blocks; with
	 * none there, the rock itself.
	 */
	private static int underRoof(LevelChunk chunk, BlockPos.MutableBlockPos pos, int x, int z, int from, int minY) {
		int y = from;
		for (int k = 0; k < 16 && y > minY; k++, y--) {
			BlockState state = chunk.getBlockState(pos.set(x, y, z));
			if (state.isAir()) return y;
		}
		return from;
	}

	/**
	 * The colour of a column as drawn (0xFFRRGGBB), or 0 where nothing is known: lighter where the
	 * ground rises from the column north of it and darker where it falls, as on a map item.
	 */
	static int sample(int x, int z) {
		if (color == null) return 0;
		int cx = x >> 4, cz = z >> 4;
		if (slotKey[slot(cx, cz)] != key(cx, cz)) return 0;
		int i = (z & MASK) * SIZE + (x & MASK);
		int c = color[i];
		if (c == 0) return 0;
		if ((c & 0xFF000000) == FLAT) return c | 0xFF000000;
		int n = z - 1, ncz = n >> 4;
		int rise = 0;
		if (slotKey[slot(cx, ncz)] == key(cx, ncz)) {
			int j = (n & MASK) * SIZE + (x & MASK);
			if (color[j] != 0) rise = height[i] - height[j];
		}
		return 0xFF000000 | shade(c, rise > 0 ? 1.08f : rise < 0 ? 0.80f : 0.94f);
	}

	/** The height of a known column, or Integer.MIN_VALUE. */
	static int heightAt(int x, int z) {
		if (color == null) return Integer.MIN_VALUE;
		int cx = x >> 4, cz = z >> 4;
		if (slotKey[slot(cx, cz)] != key(cx, cz)) return Integer.MIN_VALUE;
		int i = (z & MASK) * SIZE + (x & MASK);
		return color[i] == 0 ? Integer.MIN_VALUE : height[i];
	}

	/** How many chunks are known (for the test). */
	static int chunksKnown() {
		if (slotKey == null) return 0;
		int n = 0;
		for (long k : slotKey) if (k != EMPTY) n++;
		return n;
	}

	static int shade(int rgb, float f) {
		int r = Math.min(255, Math.round((rgb >> 16 & 0xFF) * f));
		int g = Math.min(255, Math.round((rgb >> 8 & 0xFF) * f));
		int b = Math.min(255, Math.round((rgb & 0xFF) * f));
		return r << 16 | g << 8 | b;
	}
}
