package dev.slash3rss.slashclient.hud.skyup;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.BarrelBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.DecoratedPotBlock;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Compat;

/**
 * The dungeon map's rooms, and what is known about each.
 *
 * Rooms come from the map SkyUp builds of each dungeon above it (terracotta at y 37–39, one to one
 * over the rooms): black is a room's walls, the rest its inside, yellow the ways through it; where
 * yellow crosses a wall, that is a door, and rooms do not run together through it. Where there is no
 * such map, from the floor alone: where it is at least five blocks across is the inside of a room,
 * and narrower places (doors, corridors) go to the room nearest along the floor. Each room
 * then counts its chests, barrels, pots and flower pots (opened or broken ones as taken, until they
 * come back) and the deepslate ores in its walls (mined ones as taken),
 * remembers being cleared of mobs (they come back two minutes later) and whether it has a spawner
 * (an armour stand with one on its head).
 *
 * A spawner's hologram (armour stand names, or text displays) tells more, and is believed first:
 * "Pozostałe moby: 4" (mobs left) and "Posiłki za: 68s" (when they come back).
 */
public final class DungeonRooms {
	private DungeonRooms() {}

	/** After the last mob of a room dies, how long until they come back. */
	static final long RESPAWN_MS = 120_000;
	/** How close the player must be to a room to see all of its mobs (the server sends them that far). */
	private static final int NEAR = 28;

	/** A chest, barrel, pot or ore: where it is (in the world), and whether it was taken. */
	private static final class Container {
		final int x, y, z;
		/** Which of LOOT it is. */
		final int cat;
		final boolean ore;
		/** For an ore: which ("diamond", "iron"…), else null. */
		String oreType;
		boolean present = true, opened, broken;

		Container(int x, int y, int z, int cat) {
			this.x = x;
			this.y = y;
			this.z = z;
			this.cat = cat;
			this.ore = cat == ORE;
		}

		boolean taken() {
			return opened || broken;
		}
	}

	private static final class Room {
		long sumX, sumZ;
		int pixels, containers, taken, ores, oresTaken, mobs, spawners;
		/** Its extent on the map, wall to wall. */
		int minX = Integer.MAX_VALUE, minZ = Integer.MAX_VALUE, maxX = Integer.MIN_VALUE, maxZ = Integer.MIN_VALUE;
		boolean visited;
		/** When its mobs come back (0: not cleared), and how many are left (-1: not known). */
		long respawnAt;
		int left = -1;

		int centerX() {
			return (int) (sumX / pixels);
		}

		int centerZ() {
			return (int) (sumZ / pixels);
		}
	}

	private static int size;
	/** Each map pixel's room (-1: none), and whether it is on a room's edge. */
	private static int[] roomOf = new int[0];
	private static boolean[] edge = new boolean[0];
	private static int[] dist = new int[0];
	private static boolean[] visited = new boolean[0];
	private static final List<Room> rooms = new ArrayList<>();
	/** The map's corner in the world, and where the player last stood in a room. */
	private static int originX, originZ, lastX = -1, lastZ = -1;
	private static final Map<Long, Container> containers = new HashMap<>();
	/** Spawners seen, by their place on the map (x, z). */
	private static final Map<Long, int[]> spawners = new HashMap<>();
	/** Rooms that had mobs (a point in each), and rooms cleared (a point and when). */
	private static final List<int[]> infested = new ArrayList<>();
	private static final List<long[]> cleared = new ArrayList<>();
	/** What spawner holograms said, by their place: x, z, mobs left (-1), respawn time (0), when read. */
	private static final Map<Long, long[]> holograms = new HashMap<>();
	private static final java.util.regex.Pattern LEFT = java.util.regex.Pattern.compile("Pozosta\\S*\\s+moby:?\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE);
	private static final java.util.regex.Pattern BACK = java.util.regex.Pattern.compile("Posi\\S*\\s+za:?\\s*(\\d+)\\s*s", java.util.regex.Pattern.CASE_INSENSITIVE);

	/**
	 * The start room, where the player stands when the dungeon's boss bar shows: no loot, mobs or
	 * timers are kept there. When the rooms are known, the room that point is in (walls included);
	 * before that, SkyUp's start room size around it, 65 by 65 blocks.
	 */
	static final int START_HALF = 32;
	private static int startX = -1, startZ = -1;

	static void setStart(int x, int z) {
		startX = x;
		startZ = z;
	}

	/** The start room's point on the map (x, z), or null while not known. */
	static int[] start() {
		return startX < 0 ? null : new int[] { startX, startZ };
	}

	/** Whether a map point (x, z) is in the start room. */
	static boolean inStart(int x, int z) {
		if (startX < 0) return false;
		int start = startRoom();
		if (start >= 0) return roomAt(x, z, 1) == start;
		return Math.abs(x - startX) <= START_HALF && Math.abs(z - startZ) <= START_HALF;
	}

	/** The room the start point is in, or -1 while not known. */
	private static int startRoom() {
		return startX < 0 || rooms.isEmpty() ? -1 : roomAt(startX, startZ, 2);
	}

	static void reset(int mapSize, int mapX, int mapZ) {
		size = mapSize;
		originX = mapX;
		originZ = mapZ;
		startX = startZ = -1;
		if (roomOf.length != size * size) {
			roomOf = new int[size * size];
			edge = new boolean[size * size];
			dist = new int[size * size];
			visited = new boolean[size * size];
		}
		Arrays.fill(roomOf, -1);
		Arrays.fill(edge, false);
		Arrays.fill(visited, false);
		lastX = lastZ = -1;
		rooms.clear();
		containers.clear();
		spawners.clear();
		spawnerBlocks.clear();
		infested.clear();
		cleared.clear();
		holograms.clear();
	}

	/** The kinds of loot, each counted on its own: their names (for the settings) and icons. */
	static final String[] LOOT = { "chest", "barrel", "pot", "flowerPot", "ore" };
	static final net.minecraft.world.item.Item[] LOOT_ICONS = { Items.CHEST, Items.BARREL, Items.DECORATED_POT, Items.FLOWER_POT, Items.DEEPSLATE_IRON_ORE };
	static final int ORE = 4;

	/** Whether a kind of loot is shown (switched on in the map's settings). */
	static boolean shown(int cat) {
		HudConfig cfg = SlashHud.config;
		return switch (cat) {
			case 0 -> cfg.dungeonChests;
			case 1 -> cfg.dungeonBarrels;
			case 2 -> cfg.dungeonPots;
			case 3 -> cfg.dungeonFlowerPots;
			default -> cfg.dungeonOres;
		};
	}

	/** The deepslate ores there are (and ancient debris), to pick which are counted. */
	public static final String[] ORES = { "coal", "iron", "copper", "gold", "redstone", "lapis", "emerald", "diamond", "debris" };

	/** "deepslate_diamond_ore" → "diamond", "ancient_debris" → "debris". */
	private static String oreType(Block block) {
		String id = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(block).getPath();
		if (id.equals("ancient_debris")) return "debris";
		return id.substring("deepslate_".length(), id.length() - "_ore".length());
	}

	/** Whether this one is counted: its kind switched on and, for an ore, that ore too. */
	private static boolean shown(Container c) {
		return shown(c.cat) && (!c.ore || oreCounted(c.oreType));
	}

	public static boolean oreCounted(String type) {
		return !(("," + SlashHud.config.dungeonOresOff + ",").contains("," + type + ","));
	}

	/** Switches one ore on or off for counting. */
	public static void countOre(String type, boolean on) {
		java.util.Set<String> off = new java.util.LinkedHashSet<>(java.util.Arrays.asList(SlashHud.config.dungeonOresOff.split(",")));
		off.remove("");
		if (on) off.remove(type);
		else off.add(type);
		SlashHud.config.dungeonOresOff = String.join(",", off);
	}

	/** One piece of loot: where it is and which kind (an index of LOOT). */
	interface LootVisitor {
		void loot(int x, int y, int z, int cat);
	}

	/**
	 * The loot still there and not taken yet (a double chest once, by its left half), for the
	 * highlight in the world (LootHighlight); ores only of the kinds counted on the map.
	 */
	static void untaken(LootVisitor out) {
		for (Container c : containers.values()) {
			if (!c.present || c.taken() || c.ore && !oreCounted(c.oreType)) continue;
			out.loot(c.x, c.y, c.z, c.cat);
		}
	}

	/** Which kind of loot a block is (an index of LOOT), or -1. */
	static int kind(Block block) {
		if (block instanceof ChestBlock) return 0;
		if (block instanceof BarrelBlock) return 1;
		if (block instanceof DecoratedPotBlock) return 2;
		if (block instanceof net.minecraft.world.level.block.FlowerPotBlock) return 3;
		String id = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(block).getPath();
		return id.startsWith("deepslate_") && id.endsWith("_ore") || id.equals("ancient_debris") ? ORE : -1;
	}

	/** The containers in one column: found ones are new or back, missing ones were broken. */
	static void scanColumn(ClientLevel world, BlockPos.MutableBlockPos pos, int x, int low, int high, int z) {
		// the start room has nothing to take
		if (inStart(x - originX, z - originZ)) {
			for (int y = low; y <= high; y++) containers.remove(BlockPos.asLong(x, y, z));
			return;
		}
		// all of a room's levels, up to the top of its walls for the ores in them
		boolean spawner = false;
		for (int y = low; y <= high; y++) {
			net.minecraft.world.level.block.state.BlockState state = world.getBlockState(pos.set(x, y, z));
			Block block = state.getBlock();
			// a spawner block anywhere in the column, on a ledge or in a pit too
			if (block instanceof net.minecraft.world.level.block.SpawnerBlock) spawner = true;
			int kind = kind(block);
			// a double chest is one chest: its right half is not counted
			if (block instanceof ChestBlock && state.hasProperty(ChestBlock.TYPE) && state.getValue(ChestBlock.TYPE) == net.minecraft.world.level.block.state.properties.ChestType.RIGHT) kind = -1;
			long key = BlockPos.asLong(x, y, z);
			Container c = containers.get(key);
			boolean is = kind >= 0;
			if (is) {
				if (c == null || c.cat != kind) {
					c = new Container(x, y, z, kind);
					if (kind == ORE) c.oreType = oreType(block);
					containers.put(key, c);
				}
				else if (!c.present) {
					// it grew back: full again
					c.present = true;
					c.opened = c.broken = false;
				}
			} else if (c != null && c.present) {
				// gone (broken, or a mined ore the server turned into stone): taken until it comes back
				c.present = false;
				c.broken = true;
			}
		}
		if (spawner) spawnerBlocks.add(key(x, z));
		else spawnerBlocks.remove(key(x, z));
	}

	/** Columns with a spawner block in them (world x, z). */
	private static final java.util.Set<Long> spawnerBlocks = java.util.concurrent.ConcurrentHashMap.newKeySet();

	/** Each tick: a container's screen open on a container block means it was opened. */
	static void watchOpening(Minecraft mc) {
		if (!(Compat.screen(mc) instanceof AbstractContainerScreen<?>) || !(mc.hitResult instanceof BlockHitResult hit) || hit.getType() != HitResult.Type.BLOCK) return;
		BlockPos p = hit.getBlockPos();
		Container c = containers.get(p.asLong());
		// the right half of a double chest is not counted: its left half is
		for (int[] d : new int[][] { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) {
			if (c != null) break;
			c = containers.get(BlockPos.asLong(p.getX() + d[0], p.getY(), p.getZ() + d[1]));
		}
		if (c == null || c.opened) return;
		c.opened = true;
		// the other half of a double chest
		for (int[] d : new int[][] { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) {
			Container n = containers.get(BlockPos.asLong(p.getX() + d[0], p.getY(), p.getZ() + d[1]));
			if (n != null && n.present) n.opened = true;
		}
	}

	/**
	 * After a scan: the rooms anew from the floor (cells: 0 unknown, 1 wall, 2 floor, within the
	 * box seen), then what is in each.
	 */
	static void update(Minecraft mc, byte[] cell, byte[] plan, int x0, int z0, int x1, int z1, int originX, int originZ) {
		if (x0 > x1) return;
		if (hasPlan(plan, x0, z0, x1, z1)) splitPlan(plan, x0, z0, x1, z1);
		else split(cell, x0, z0, x1, z1);
		int px = mc.player.getBlockX() - originX, pz = mc.player.getBlockZ() - originZ;
		DungeonRooms.originX = originX;
		DungeonRooms.originZ = originZ;
		// the room the player is in; in a doorway, still the one they came from
		if (roomAt(px, pz) >= 0) {
			lastX = px;
			lastZ = pz;
		}
		if (px >= 0 && pz >= 0 && px < size && pz < size) visited[pz * size + px] = true;
		for (int i = 0; i < roomOf.length; i++) if (visited[i] && roomOf[i] >= 0) rooms.get(roomOf[i]).visited = true;

		for (Container c : containers.values()) {
			int r = roomAt(c.x - originX, c.z - originZ);
			if (r < 0) continue;
			Room room = rooms.get(r);
			if (!shown(c)) continue;
			if (c.ore) {
				room.ores++;
				if (c.taken()) room.oresTaken++;
			} else {
				room.containers++;
				if (c.taken()) room.taken++;
			}
		}

		// spawners and mobs about now
		Map<Long, int[]> seenSpawners = new HashMap<>();
		for (Entity e : mc.level.entitiesForRendering()) {
			if (!e.isAlive()) continue;
			int ex = e.getBlockX() - originX, ez = e.getBlockZ() - originZ;
			String text = label(e);
			if (text != null) hologram(text, ex, ez);
			if (spawnerLabel(e)) seenSpawners.put(key(ex, ez), new int[] { ex, ez });
			else if (e instanceof ArmorStand stand) {
				if (stand.getItemBySlot(EquipmentSlot.HEAD).is(Items.SPAWNER)) seenSpawners.put(key(ex, ez), new int[] { ex, ez });
			} else if (e instanceof Mob && !inStart(ex, ez)) {
				// on a ledge or in a pit its column may be no floor where the map was read: a room a few blocks off
				int r = roomAt(ex, ez, 8);
				if (r >= 0) rooms.get(r).mobs++;
			}
		}
		// spawners near the player that are gone now were destroyed
		spawners.values().removeIf(s -> Math.abs(s[0] - px) < NEAR && Math.abs(s[1] - pz) < NEAR && !seenSpawners.containsKey(key(s[0], s[1])));
		spawners.putAll(seenSpawners);
		// spawners as entities (an armour stand's head, a hologram) and as blocks; one room counts each place once
		java.util.Set<Long> counted = new java.util.HashSet<>();
		for (int[] s : spawners.values()) countSpawner(s[0], s[1], counted);
		for (long k : spawnerBlocks) countSpawner((int) (k >> 32) - originX, (int) k - originZ, counted);

		// rooms that had mobs and have none now, seen from close: cleared
		long now = System.currentTimeMillis();
		// the holograms first: what the server says; one read half a minute ago is old for the count
		holograms.values().removeIf(h -> h[3] > 0 ? h[3] < now : now - h[4] > 30_000);
		for (long[] h : holograms.values()) {
			// a spawner's hologram floats over it, maybe up on a ledge: its room may be a few blocks off
			int r = roomAt((int) h[0], (int) h[1], 12);
			if (r < 0 || r == startRoom()) continue;
			Room room = rooms.get(r);
			// a room can have up to three spawners: the first to send reinforcements is when the room fills again
			if (h[3] > now) room.respawnAt = room.respawnAt == 0 ? h[3] : Math.min(room.respawnAt, h[3]);
			else if (h[2] >= 0) room.left = room.left < 0 ? (int) h[2] : room.left + (int) h[2];
		}
		// and it is cleared only once none of them has mobs left
		for (Room room : rooms) if (room.left > 0) room.respawnAt = 0;
		boolean[] hadMobs = new boolean[rooms.size()];
		List<int[]> stillInfested = new ArrayList<>();
		for (int[] p : infested) {
			int r = roomAt(p[0], p[1]);
			if (r < 0 || hadMobs[r] || r == startRoom()) continue;
			hadMobs[r] = true;
			Room room = rooms.get(r);
			boolean near = Math.abs(room.centerX() - px) < NEAR && Math.abs(room.centerZ() - pz) < NEAR;
			// mobs come back only from a spawner: a room without one has no time to count down
			if (room.mobs == 0 && near && room.spawners > 0) cleared.add(new long[] { room.centerX(), room.centerZ(), now + RESPAWN_MS });
			else if (room.mobs == 0) stillInfested.add(p);
		}
		infested.clear();
		infested.addAll(stillInfested);
		for (int r = 0; r < rooms.size(); r++) {
			Room room = rooms.get(r);
			if (r == startRoom()) {
				room.respawnAt = 0;
				room.left = -1;
				continue;
			}
			if (room.mobs > 0) infested.add(new int[] { room.centerX(), room.centerZ() });
		}
		for (Iterator<long[]> it = cleared.iterator(); it.hasNext();) {
			long[] c = it.next();
			int r = roomAt((int) c[0], (int) c[1]);
			// over, or the mobs are back
			if (now > c[2] || r < 0 || rooms.get(r).mobs > 0) {
				it.remove();
				continue;
			}
			// a hologram's time, when there is one, stands; a room found to have no spawner after all, none
			if (rooms.get(r).spawners == 0) {
				it.remove();
				continue;
			}
			if (rooms.get(r).respawnAt == 0 && rooms.get(r).left <= 0) rooms.get(r).respawnAt = c[2];
		}
	}

	/** A hologram's text: an armour stand's name or a text display's text, without colour codes; null for neither. */
	static String label(Entity e) {
		String text = e instanceof net.minecraft.world.entity.Display.TextDisplay display && display.textRenderState() != null ? display.textRenderState().text().getString()
			: e instanceof Mob || e instanceof net.minecraft.world.entity.player.Player || !e.hasCustomName() ? null : e.getCustomName().getString();
		return text == null ? null : text.replaceAll("§.", "");
	}

	/** The "Spawner" line of a spawner's hologram (the first line of a text display, or a name of its own). */
	public static boolean spawnerLabel(Entity e) {
		String text = label(e);
		return text != null && SPAWNER_LINE.matcher(text).find();
	}

	private static final java.util.regex.Pattern SPAWNER_LINE = java.util.regex.Pattern.compile("^[^\\p{L}\\d]*Spawner[^\\p{L}\\d]*$", java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.MULTILINE);

	/** One hologram line (or a few, in a text display): mobs left, or when they come back. */
	private static void hologram(String text, int x, int z) {
		java.util.regex.Matcher left = LEFT.matcher(text), back = BACK.matcher(text);
		boolean isLeft = left.find(), isBack = back.find();
		if (!isLeft && !isBack) return;
		long now = System.currentTimeMillis();
		long[] h = holograms.computeIfAbsent(key(x, z), k -> new long[] { x, z, -1, 0, now });
		h[4] = now;
		if (isLeft) {
			h[2] = Integer.parseInt(left.group(1));
			h[3] = 0;
		}
		if (isBack) {
			h[3] = now + Integer.parseInt(back.group(1)) * 1000L;
			h[2] = -1;
		}
	}

	private static long key(int x, int z) {
		return (long) x << 32 | (z & 0xFFFFFFFFL);
	}

	/** The room at a map pixel, or the nearest one within two pixels (a chest's column may be no floor). */
	/** A spawner at a map pixel: its room counts one more (several things at one spot are one spawner). */
	private static void countSpawner(int x, int z, java.util.Set<Long> counted) {
		// a spawner stands on a ledge or by a wall: its room may be a few blocks off
		int r = roomAt(x, z, 12);
		if (r >= 0 && counted.add(key(x >> 1, z >> 1))) rooms.get(r).spawners++;
	}

	private static int roomAt(int x, int z) {
		return roomAt(x, z, 2);
	}

	/**
	 * The room at a map pixel, or the nearest within `reach` whose extent (wall to wall) holds the
	 * point: a ledge or a pit inside a room is found, the room behind a wall is not.
	 */
	private static int roomAt(int x, int z, int reach) {
		if (x >= 0 && z >= 0 && x < size && z < size && roomOf[z * size + x] >= 0) return roomOf[z * size + x];
		for (int d = 1; d <= reach; d++) {
			for (int dz = -d; dz <= d; dz++) {
				for (int dx = -d; dx <= d; dx++) {
					int ix = x + dx, iz = z + dz;
					if (ix < 0 || iz < 0 || ix >= size || iz >= size) continue;
					int r = roomOf[iz * size + ix];
					if (r < 0 || r >= rooms.size()) continue;
					Room room = rooms.get(r);
					// close by (ores in a wall): the nearest room; further: only one whose extent holds the point
					if (reach <= 2 || x >= room.minX - 1 && x <= room.maxX + 1 && z >= room.minZ - 1 && z <= room.maxZ + 1) return r;
				}
			}
		}
		return -1;
	}

	// the map above: 0 nothing, 1 wall (black), 2 inside, 3 a way (yellow), 4 the start room's mark (green)
	static final byte PLAN_WALL = 1, PLAN_INSIDE = 2, PLAN_WAY = 3, PLAN_START = 4;

	private static boolean hasPlan(byte[] plan, int x0, int z0, int x1, int z1) {
		int n = 0;
		for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) if (plan[z * size + x] >= PLAN_INSIDE && ++n > 50) return true;
		return false;
	}

	private static boolean planWall(byte[] plan, int x, int z) {
		return x >= 0 && z >= 0 && x < size && z < size && plan[z * size + x] == PLAN_WALL;
	}

	/** Inside a room on the map, not a wall nor nothing. */
	private static boolean planOpen(byte[] plan, int x, int z) {
		return x >= 0 && z >= 0 && x < size && z < size && plan[z * size + x] >= PLAN_INSIDE;
	}

	/** A way through a wall: an open block with wall on both sides along it. */
	private static boolean planDoor(byte[] plan, int x, int z) {
		return planOpen(plan, x, z) && (planWall(plan, x - 1, z) && planWall(plan, x + 1, z) || planWall(plan, x, z - 1) && planWall(plan, x, z + 1));
	}

	/** Rooms from the map above: the insides between black walls, doors left out; doors then join a room next to them. */
	private static void splitPlan(byte[] plan, int x0, int z0, int x1, int z1) {
		rooms.clear();
		Arrays.fill(roomOf, -1);
		Arrays.fill(edge, false);
		ArrayDeque<Integer> queue = new ArrayDeque<>();
		List<Integer> part = new ArrayList<>();
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				int start = z * size + x;
				if (roomOf[start] != -1 || !planOpen(plan, x, z) || planDoor(plan, x, z)) continue;
				part.clear();
				roomOf[start] = -2;
				queue.add(start);
				while (!queue.isEmpty()) {
					int i = queue.poll();
					part.add(i);
					int ix = i % size, iz = i / size;
					for (int[] d : STEPS) {
						int nx = ix + d[0], nz = iz + d[1];
						if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
						int n = nz * size + nx;
						if (roomOf[n] == -1 && planOpen(plan, nx, nz) && !planDoor(plan, nx, nz)) {
							roomOf[n] = -2;
							queue.add(n);
						}
					}
				}
				// a few blocks alone are bits of a way, not a room
				int id = part.size() >= 9 ? rooms.size() : -3;
				if (id >= 0) rooms.add(new Room());
				for (int i : part) roomOf[i] = id;
			}
		}
		for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) if (roomOf[z * size + x] == -3) roomOf[z * size + x] = -1;
		// doors and stray bits: to the room next to them
		for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) if (roomOf[z * size + x] >= 0) queue.add(z * size + x);
		while (!queue.isEmpty()) {
			int i = queue.poll();
			int ix = i % size, iz = i / size;
			for (int[] d : STEPS) {
				int nx = ix + d[0], nz = iz + d[1];
				if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
				int n = nz * size + nx;
				if (roomOf[n] == -1 && planOpen(plan, nx, nz)) {
					roomOf[n] = roomOf[i];
					queue.add(n);
				}
			}
		}
		finish(x0, z0, x1, z1);
	}

	/** Floor at least five across: room cores; the rest of the floor joins the nearest core. */
	private static void split(byte[] cell, int x0, int z0, int x1, int z1) {
		rooms.clear();
		Arrays.fill(roomOf, -1);
		Arrays.fill(edge, false);
		// how far each floor pixel is from anything not floor (8 ways round), in two passes
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				int i = z * size + x;
				if (cell[i] != 2) {
					dist[i] = 0;
					continue;
				}
				int d = Math.min(at(x - 1, z, x0, z0, x1, z1), Math.min(at(x, z - 1, x0, z0, x1, z1), Math.min(at(x - 1, z - 1, x0, z0, x1, z1), at(x + 1, z - 1, x0, z0, x1, z1))));
				dist[i] = d + 1;
			}
		}
		for (int z = z1; z >= z0; z--) {
			for (int x = x1; x >= x0; x--) {
				int i = z * size + x;
				if (cell[i] != 2) continue;
				int d = Math.min(at(x + 1, z, x0, z0, x1, z1), Math.min(at(x, z + 1, x0, z0, x1, z1), Math.min(at(x + 1, z + 1, x0, z0, x1, z1), at(x - 1, z + 1, x0, z0, x1, z1))));
				dist[i] = Math.min(dist[i], d + 1);
			}
		}
		// the cores, each one room (tiny ones are nooks, not rooms)
		ArrayDeque<Integer> queue = new ArrayDeque<>();
		List<Integer> part = new ArrayList<>();
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				int start = z * size + x;
				if (dist[start] < 3 || roomOf[start] != -1) continue;
				part.clear();
				roomOf[start] = -2;
				queue.add(start);
				while (!queue.isEmpty()) {
					int i = queue.poll();
					part.add(i);
					int ix = i % size, iz = i / size;
					for (int[] d : STEPS) {
						int nx = ix + d[0], nz = iz + d[1];
						if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
						int n = nz * size + nx;
						if (dist[n] >= 3 && roomOf[n] == -1) {
							roomOf[n] = -2;
							queue.add(n);
						}
					}
				}
				int id = part.size() >= 6 ? rooms.size() : -3;
				if (id >= 0) rooms.add(new Room());
				for (int i : part) roomOf[i] = id;
			}
		}
		// the rest of the floor: to the nearest room along it
		for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) if (roomOf[z * size + x] >= 0) queue.add(z * size + x);
		for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) if (roomOf[z * size + x] == -3) roomOf[z * size + x] = -1;
		while (!queue.isEmpty()) {
			int i = queue.poll();
			int ix = i % size, iz = i / size;
			for (int[] d : STEPS) {
				int nx = ix + d[0], nz = iz + d[1];
				if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
				int n = nz * size + nx;
				if (cell[n] == 2 && roomOf[n] == -1) {
					roomOf[n] = roomOf[i];
					queue.add(n);
				}
			}
		}
		finish(x0, z0, x1, z1);
	}

	/** Each room's middle and size, and its edge pixels. */
	private static void finish(int x0, int z0, int x1, int z1) {
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				int i = z * size + x, r = roomOf[i];
				if (r < 0) continue;
				Room room = rooms.get(r);
				room.sumX += x;
				room.sumZ += z;
				room.pixels++;
				room.minX = Math.min(room.minX, x);
				room.minZ = Math.min(room.minZ, z);
				room.maxX = Math.max(room.maxX, x);
				room.maxZ = Math.max(room.maxZ, z);
				for (int[] d : STEPS) {
					int nx = x + d[0], nz = z + d[1];
					if (nx < 0 || nz < 0 || nx >= size || nz >= size || roomOf[nz * size + nx] != r) {
						edge[i] = true;
						break;
					}
				}
			}
		}
	}

	private static final int[][] STEPS = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } };

	private static int at(int x, int z, int x0, int z0, int x1, int z1) {
		if (x < x0 || z < z0 || x > x1 || z > z1) return 0;
		return dist[z * size + x];
	}

	// ---------- on the map ----------

	/** A floor pixel's colour with its room's marks: green while cleared, a blue edge when it has no spawner. */
	static int tint(int x, int z, int color) {
		int r = roomOf[z * size + x];
		if (r < 0 || r >= rooms.size()) return color;
		Room room = rooms.get(r);
		HudConfig cfg = SlashHud.config;
		if (cfg.dungeonNoSpawner && edge[z * size + x] && room.visited && room.spawners == 0 && r != startRoom()) return 0xFF60A5FA;
		if (cfg.dungeonCleared && room.respawnAt > System.currentTimeMillis()) return mix(color, 0x22C55E, 0.45f);
		return color;
	}

	private static int mix(int argb, int rgb, float t) {
		int r = Math.round((argb >> 16 & 0xFF) * (1 - t) + (rgb >> 16 & 0xFF) * t);
		int g = Math.round((argb >> 8 & 0xFF) * (1 - t) + (rgb >> 8 & 0xFF) * t);
		int b = Math.round((argb & 0xFF) * (1 - t) + (rgb & 0xFF) * t);
		return argb & 0xFF000000 | r << 16 | g << 8 | b;
	}

	/** Containers as dots, and over each room its count of taken containers and the time until its mobs come back. */
	static void draw(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy, float viewX, float viewZ, float scale, int originX, int originZ,
			java.util.function.BiPredicate<Integer, Integer> shown) {
		HudConfig cfg = SlashHud.config;
		if (cfg.dungeonContainers) {
			for (Container c : containers.values()) {
				if (!shown(c)) continue;
				int sx = Math.round((c.x - originX + 0.5f - viewX) * scale), sz = Math.round((c.z - originZ + 0.5f - viewZ) * scale);
				if (!shown.test(sx, sz)) continue;
				// a dot with a dark rim, so it shows on any floor
				g.fill(ox + sx - 2, oy + sz - 2, ox + sx + 2, oy + sz + 2, 0xFF000000);
				// ores cyan, ancient debris its own brown, the rest yellow; taken ones grey
				int dot = c.taken() ? 0xFF6B7280 : "debris".equals(c.oreType) ? 0xFFB0703F : c.ore ? 0xFF22D3EE : 0xFFFACC15;
				g.fill(ox + sx - 1, oy + sz - 1, ox + sx + 1, oy + sz + 1, dot);
			}
		}
		long now = System.currentTimeMillis();
		for (Room room : rooms) {
			if (room.pixels == 0) continue;
			List<String> lines = new ArrayList<>();
			List<Integer> colors = new ArrayList<>();
			if (cfg.dungeonCleared && room.respawnAt > now) {
				long left = (room.respawnAt - now + 999) / 1000;
				lines.add(left / 60 + ":" + String.format("%02d", left % 60));
				colors.add(0xFF4ADE80);
			} else if (cfg.dungeonCleared && room.left > 0) {
				// mobs left, as the spawner's hologram says
				lines.add("☠" + room.left);
				colors.add(0xFFF87171);
			}
			if (lines.isEmpty()) continue;
			int sx = Math.round((room.centerX() + 0.5f - viewX) * scale), sz = Math.round((room.centerZ() + 0.5f - viewZ) * scale);
			if (!shown.test(sx, sz)) continue;
			// the font's own size, on a dark plate with a rim, so it reads on any floor
			int top = oy + sz - lines.size() * 5;
			for (int i = 0; i < lines.size(); i++) {
				String s = lines.get(i);
				int w = mc.font.width(s), lx = ox + sx - w / 2, ly = top + i * 10;
				g.fill(lx - 3, ly - 2, lx + w + 2, ly + 9, 0xFF000000);
				g.fill(lx - 2, ly - 1, lx + w + 1, ly + 8, 0xFF1F2937);
				g.text(mc.font, s, lx, ly, colors.get(i), true);
			}
		}
	}

	/** One kind of loot in the room the player is in (or was in last): taken, and all found. */
	static int[] count(int cat) {
		int[] n = new int[2];
		int room = roomAt(lastX, lastZ);
		if (room < 0) return n;
		for (Container c : containers.values()) {
			if (c.cat != cat || !shown(c) || roomAt(c.x - originX, c.z - originZ) != room) continue;
			n[1]++;
			if (c.taken()) n[0]++;
		}
		return n;
	}

	/** One kind of loot over the whole dungeon: taken, and all found. */
	static int[] countAll(int cat) {
		int[] n = new int[2];
		for (Container c : containers.values()) {
			if (c.cat != cat || !shown(c)) continue;
			n[1]++;
			if (c.taken()) n[0]++;
		}
		return n;
	}

	/** All containers (or ores) taken of all found ("4/12"), or empty when none were found. */
	static String containerCount(boolean ores) {
		int all = 0, taken = 0;
		for (Container c : containers.values()) {
			if (c.ore != ores) continue;
			all++;
			if (c.taken()) taken++;
		}
		return all == 0 ? "" : taken + "/" + all;
	}

	/** For the test. */
	public static String summary() {
		int clearedRooms = 0, noSpawner = 0;
		for (Room r : rooms) {
			if (r.respawnAt > 0) clearedRooms++;
			if (r.visited && r.spawners == 0 && rooms.indexOf(r) != startRoom()) noSpawner++;
		}
		return rooms.size() + " rooms, containers " + containerCount(false) + ", ores " + containerCount(true) + ", cleared " + clearedRooms + ", without spawner " + noSpawner;
	}
}
