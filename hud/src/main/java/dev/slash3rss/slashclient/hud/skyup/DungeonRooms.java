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
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Compat;

/**
 * The dungeon map's rooms, and what is known about each.
 *
 * Rooms come from the map SkyUp builds of each dungeon above it (terracotta at y 37–39, one to one
 * over the rooms): black is a room's walls, the rest its inside, yellow the ways through it; where
 * yellow crosses a wall, that is a door. Where there is no such map, from the floor alone: no floor
 * to stand on is a wall. A gap in a wall up to eleven blocks wide is a doorway, and rooms do not run
 * together through it. Each room
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
		/** Its extent without the doorways that reach into the walls: its tile on the simple map. */
		int coreMinX = Integer.MAX_VALUE, coreMinZ = Integer.MAX_VALUE, coreMaxX = Integer.MIN_VALUE, coreMaxZ = Integer.MIN_VALUE;
		/** A few of the mobs in it now (entity ids), for their heads on its tile. */
		final List<Integer> mobIds = new ArrayList<>();
		/** The kind of loot (of LOOT) still to take in it, a container before an ore; -1 for none. */
		int lootCat = -1;
		boolean visited;
		/** When its mobs come back (0: not cleared), and how many are left (-1: not known). */
		long respawnAt;
		int left = -1;
		/** Each spawner's hologram in it (up to three): where it is, its mobs left (-1) and when they come back (0). */
		final List<long[]> spawnerLabels = new ArrayList<>();

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
	private static boolean[] visited = new boolean[0];
	/** Map pixels in a run of their room at least four across (along x): not a doorway. */
	private static boolean[] wide = new boolean[0];
	/** Map pixels that are doorways (between two rooms' walls). */
	private static boolean[] door = new boolean[0];
	private static final List<Room> rooms = new ArrayList<>();
	/** Where two rooms meet (a door between them): x, z on the map. */
	private static final List<float[]> doors = new ArrayList<>();
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
			door = new boolean[size * size];
			visited = new boolean[size * size];
			wide = new boolean[size * size];
		}
		Arrays.fill(roomOf, -1);
		Arrays.fill(edge, false);
		Arrays.fill(visited, false);
		lastX = lastZ = -1;
		rooms.clear();
		doors.clear();
		signs.clear();
		signText.clear();
		gridTiles.clear();
		gridDoors.clear();
		phaseX = phaseZ = -1;
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
		split(cell, plan, x0, z0, x1, z1);
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
			if (!c.taken() && c.present && (room.lootCat < 0 || room.lootCat == ORE && !c.ore)) room.lootCat = c.cat;
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
				if (r >= 0) {
					Room room = rooms.get(r);
					room.mobs++;
					if (room.mobIds.size() < 4) room.mobIds.add(e.getId());
				}
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
			room.spawnerLabels.add(new long[] { h[0], h[1], h[3] > now ? -1 : h[2], h[3] > now ? h[3] : 0 });
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
		grid(mc, cell, plan, x0, z0, x1, z1);
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

	/** How wide a doorway can be and still part two rooms: up to twice this, plus one. */
	private static final int DOORWAY = 5;

	/** A wall at a map pixel: black on the map above where it is read, else no floor to stand on. */
	private static boolean wallAt(byte[] cell, byte[] plan, int x, int z) {
		if (x < 0 || z < 0 || x >= size || z >= size) return false;
		int i = z * size + x;
		return plan[i] != 0 ? plan[i] == PLAN_WALL : cell[i] == 1;
	}

	/** Inside a room (or a doorway) at a map pixel: from the map above where it is read, else floor seen. */
	private static boolean openAt(byte[] cell, byte[] plan, int x, int z) {
		if (x < 0 || z < 0 || x >= size || z >= size) return false;
		int i = z * size + x;
		return plan[i] != 0 ? plan[i] >= PLAN_INSIDE : cell[i] == 2;
	}

	/**
	 * A doorway: open, with a wall close by on both sides along x (or along z), each the end of a wall
	 * that goes on (three blocks at least), so the gap between two rooms' walls counts and the gap
	 * between a pillar and a wall does not. A room narrower than a doorway is all doorway: it joins
	 * a room next to it.
	 */
	private static boolean doorway(byte[] cell, byte[] plan, int x, int z) {
		return openAt(cell, plan, x, z) && (jambs(cell, plan, x, z, 1, 0) || jambs(cell, plan, x, z, 0, 1));
	}

	private static boolean jambs(byte[] cell, byte[] plan, int x, int z, int dx, int dz) {
		return jamb(cell, plan, x, z, dx, dz) && jamb(cell, plan, x, z, -dx, -dz);
	}

	private static boolean jamb(byte[] cell, byte[] plan, int x, int z, int dx, int dz) {
		for (int k = 1; k <= DOORWAY; k++) {
			int px = x + dx * k, pz = z + dz * k;
			if (wallAt(cell, plan, px, pz)) {
				for (int more = 1; more <= 2; more++) if (!wallAt(cell, plan, px + dx * more, pz + dz * more)) return false;
				return true;
			}
			if (!openAt(cell, plan, px, pz)) return false;
		}
		return false;
	}

	/**
	 * Rooms: what is inside between walls, doorways left out (the map above where it is read, else the
	 * floor seen); doorways and bits too small to be a room then join a room next to them.
	 */
	private static void split(byte[] cell, byte[] plan, int x0, int z0, int x1, int z1) {
		rooms.clear();
		Arrays.fill(roomOf, -1);
		Arrays.fill(edge, false);
		// which pixels are doorways, worked out once (the flood below asks about each a few times)
		for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) door[z * size + x] = doorway(cell, plan, x, z);
		ArrayDeque<Integer> queue = new ArrayDeque<>();
		List<Integer> part = new ArrayList<>();
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				int start = z * size + x;
				if (roomOf[start] != -1 || door[start] || !openAt(cell, plan, x, z)) continue;
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
						if (roomOf[n] == -1 && !door[n] && openAt(cell, plan, nx, nz)) {
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
		// doorways and stray bits: to the room next to them
		for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) if (roomOf[z * size + x] >= 0) queue.add(z * size + x);
		while (!queue.isEmpty()) {
			int i = queue.poll();
			int ix = i % size, iz = i / size;
			for (int[] d : STEPS) {
				int nx = ix + d[0], nz = iz + d[1];
				if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
				int n = nz * size + nx;
				if (roomOf[n] == -1 && openAt(cell, plan, nx, nz)) {
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
		// each room's tile: its pixels in runs at least four long both ways, so a doorway reaching
		// into the wall (a block or three across) does not make the tile lopsided
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1;) {
				int r = roomOf[z * size + x], end = x;
				while (end + 1 <= x1 && roomOf[z * size + end + 1] == r) end++;
				for (int i = x; i <= end; i++) wide[z * size + i] = r >= 0 && end - x + 1 >= 4;
				x = end + 1;
			}
		}
		for (int x = x0; x <= x1; x++) {
			for (int z = z0; z <= z1;) {
				int r = roomOf[z * size + x], end = z;
				while (end + 1 <= z1 && roomOf[(end + 1) * size + x] == r) end++;
				if (r >= 0 && end - z + 1 >= 4) {
					Room room = rooms.get(r);
					for (int i = z; i <= end; i++) {
						if (!wide[i * size + x]) continue;
						room.coreMinX = Math.min(room.coreMinX, x);
						room.coreMaxX = Math.max(room.coreMaxX, x);
						room.coreMinZ = Math.min(room.coreMinZ, i);
						room.coreMaxZ = Math.max(room.coreMaxZ, i);
					}
				}
				z = end + 1;
			}
		}
		// doors: where two rooms touch, the middle of where they do
		doors.clear();
		Map<Long, double[]> touching = new HashMap<>();
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				int r = roomOf[z * size + x];
				if (r < 0) continue;
				for (int[] d : new int[][] { { 1, 0 }, { 0, 1 } }) {
					int nx = x + d[0], nz = z + d[1];
					if (nx > x1 || nz > z1) continue;
					int n = roomOf[nz * size + nx];
					if (n < 0 || n == r) continue;
					double[] t = touching.computeIfAbsent(key(Math.min(r, n), Math.max(r, n)), k -> new double[3]);
					t[0] += x + d[0] / 2.0;
					t[1] += z + d[1] / 2.0;
					t[2]++;
				}
			}
		}
		for (double[] t : touching.values()) doors.add(new float[] { (float) (t[0] / t[2]), (float) (t[1] / t[2]) });
	}

	private static final int[][] STEPS = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } };

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
			// several spawners: each its own smaller time (or mobs left) where it stands
			if (cfg.dungeonCleared && room.spawnerLabels.size() > 1) {
				// spawners close together (or the map zoomed out): the labels one under another, not over each other
				List<int[]> placed = new ArrayList<>();
				for (long[] s : room.spawnerLabels) {
					String text = s[3] > now ? clock((s[3] - now + 999) / 1000) : s[2] > 0 ? "☠" + s[2] : null;
					if (text == null) continue;
					int sx = Math.round((s[0] + 0.5f - viewX) * scale), sz = Math.round((s[1] + 0.5f - viewZ) * scale);
					if (!shown.test(sx, sz)) continue;
					int half = Math.round((mc.font.width(text) + 5) * 0.35f) + 1;
					boolean moved = true;
					while (moved) {
						moved = false;
						for (int[] p : placed) if (Math.abs(p[0] - sx) < half + p[2] && Math.abs(p[1] - sz) < 8) {
							sz = p[1] + 8;
							moved = true;
						}
					}
					placed.add(new int[] { sx, sz, half });
					plate(g, mc, text, ox + sx, oy + sz, s[3] > now ? 0xFF4ADE80 : 0xFFF87171, 0.7f);
				}
				continue;
			}
			List<String> lines = new ArrayList<>();
			List<Integer> colors = new ArrayList<>();
			if (cfg.dungeonCleared && room.respawnAt > now) {
				lines.add(clock((room.respawnAt - now + 999) / 1000));
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
			for (int i = 0; i < lines.size(); i++) plate(g, mc, lines.get(i), ox + sx, top + i * 10 + 4, colors.get(i), 1f);
		}
	}

	// ---------- the simple map: rooms on SkyUp's grid ----------

	/**
	 * SkyUp builds its dungeons of squares 13 blocks across (each room's own wall included, so two
	 * rooms are two blocks of wall apart): a room is 1×1, 1×3, 2×2… of them, the start room 5×5.
	 * Under each room, at y 20 by its first corner, a sign says which it is: "<<DUNGEON_TC>>",
	 * "d-zwykly", "1x3-G-1" (its size, its kind and number; or "5x5-start-1"). SkyUp turns some
	 * rooms, their signs with them (the start room never): which way is worked out from the walls.
	 */
	static final int CELL = 13;
	private static final java.util.regex.Pattern SIGN_SIZE = java.util.regex.Pattern.compile("(\\d+)\\s*x\\s*(\\d+)");

	/** One tile of the simple map: where (map blocks, inclusive) and what is going on in it. */
	private static final class Tile {
		int x0, z0, x1, z1;
		boolean start, current, visited;
		int mobs, left = -1, lootCat = -1;
		long respawnAt;
		final List<Integer> mobIds = new ArrayList<>();
		/** On the grid: its squares (from the grid's first one), and how many. */
		int cx0 = Integer.MAX_VALUE, cz0 = Integer.MAX_VALUE, cx1 = Integer.MIN_VALUE, cz1 = Integer.MIN_VALUE, cells;

		/** What one of the rooms found on the floor tells about it. */
		void add(Room room) {
			mobs += room.mobs;
			for (int id : room.mobIds) if (mobIds.size() < 4) mobIds.add(id);
			if (room.left >= 0) left = Math.max(0, left) + room.left;
			respawnAt = Math.max(respawnAt, room.respawnAt);
			visited |= room.visited;
			if (room.lootCat >= 0 && (lootCat < 0 || lootCat == ORE)) lootCat = room.lootCat;
		}
	}

	/** Signs under the rooms, by their place: map x, z, the size across (x) and down (z), 1 for the start room. */
	private static final Map<Long, int[]> signs = new HashMap<>();
	/** For the debug file: each sign where it is in the world and all its lines. */
	private static final Map<Long, String> signText = new HashMap<>();
	/** For the debug file: how far a sign is from its room's first corner, as found (0–8). */
	private static int signOff = -1;
	/** The grid: where its lines are (map x, z of a square's first block), or -1 while not known. */
	private static int phaseX = -1, phaseZ = -1;
	/** The rooms on the grid and the doors between them; empty when the dungeon is not on SkyUp's grid. */
	private static final List<Tile> gridTiles = new ArrayList<>();
	private static final List<float[]> gridDoors = new ArrayList<>();

	/** The rooms' signs in the chunks around the player (the game has them before the rooms are seen). */
	private static void readSigns(Minecraft mc) {
		ClientLevel world = mc.level;
		int pcx = mc.player.getBlockX() >> 4, pcz = mc.player.getBlockZ() >> 4;
		for (int cx = pcx - 10; cx <= pcx + 10; cx++) {
			for (int cz = pcz - 10; cz <= pcz + 10; cz++) {
				if (!world.hasChunk(cx, cz)) continue;
				for (net.minecraft.world.level.block.entity.BlockEntity be : world.getChunk(cx, cz).getBlockEntities().values()) {
					if (!(be instanceof net.minecraft.world.level.block.entity.SignBlockEntity sign)) continue;
					//#if MC >= 26.3
					List<net.minecraft.network.chat.Component> lines = sign.getText(net.minecraft.world.level.block.entity.SignTextSlot.FRONT).getMessages(false);
					//#else
					//$ List<net.minecraft.network.chat.Component> lines = java.util.Arrays.asList(sign.getFrontText().getMessages(false));
					//#endif
					if (lines.size() < 3 || !lines.get(0).getString().contains("DUNGEON_TC")) continue;
					String kind = lines.get(2).getString();
					java.util.regex.Matcher m = SIGN_SIZE.matcher(kind);
					if (!m.find()) continue;
					BlockPos p = be.getBlockPos();
					int x = p.getX() - originX, z = p.getZ() - originZ;
					if (x < 0 || z < 0 || x >= size || z >= size) continue;
					signs.put(key(x, z), new int[] { x, z, Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), kind.contains("start") ? 1 : 0 });
					StringBuilder all = new StringBuilder();
					for (var line : lines) all.append(all.length() == 0 ? "" : " | ").append(line.getString());
					signText.put(key(x, z), p.getX() + " " + p.getY() + " " + p.getZ() + ": " + all);
				}
			}
		}
	}

	/**
	 * Where the grid's lines are along one way: the two neighbouring places (of 13) with the most wall
	 * (a room's wall and its neighbour's); -1 when walls are not clearly there (not SkyUp's grid).
	 */
	private static int phase(long[] walls) {
		long all = 0, best = -1;
		int at = -1;
		for (long w : walls) all += w;
		for (int p = 0; p < CELL; p++) {
			long w = walls[(p + CELL - 1) % CELL] + walls[p];
			if (w > best) {
				best = w;
				at = p;
			}
		}
		return all > 0 && best >= 1.8 * 2 * all / CELL ? at : -1;
	}

	/** Which square of the grid a map block is in. */
	private static int cellX(int x) {
		return Math.floorDiv(x - phaseX, CELL);
	}

	private static int cellZ(int z) {
		return Math.floorDiv(z - phaseZ, CELL);
	}

	/**
	 * The simple map's rooms: squares of the grid with floor (or a sign saying a room is there), put
	 * together into rooms by the signs, else where nothing walls two squares apart; two squares
	 * with a wall between them and a gap in it have a door there.
	 */
	private static void grid(Minecraft mc, byte[] cell, byte[] plan, int x0, int z0, int x1, int z1) {
		readSigns(mc);
		gridTiles.clear();
		gridDoors.clear();
		long[] wx = new long[CELL], wz = new long[CELL];
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				if (!wallAt(cell, plan, x, z)) continue;
				wx[Math.floorMod(x, CELL)]++;
				wz[Math.floorMod(z, CELL)]++;
			}
		}
		phaseX = phase(wx);
		phaseZ = phase(wz);
		// nothing seen to tell yet: a sign's corner is the last block of its room
		if ((phaseX < 0 || phaseZ < 0) && !signs.isEmpty()) {
			int[] s = signs.values().iterator().next();
			phaseX = Math.floorMod(s[0] + 1, CELL);
			phaseZ = Math.floorMod(s[1] + 1, CELL);
		}
		if (phaseX < 0 || phaseZ < 0) return;
		// a sign's room may reach its size (and a square more) any way from it
		for (int[] s : signs.values()) {
			int reach = (Math.max(s[2], s[3]) + 1) * CELL;
			x0 = Math.min(x0, s[0] - reach);
			z0 = Math.min(z0, s[1] - reach);
			x1 = Math.max(x1, s[0] + reach);
			z1 = Math.max(z1, s[1] + reach);
		}
		int gx = cellX(x0), gz = cellZ(z0), gw = cellX(x1) - gx + 1, gh = cellZ(z1) - gz + 1;
		if (gw <= 0 || gh <= 0 || (long) gw * gh > 10_000) return;
		// squares with floor in them
		boolean[] present = new boolean[gw * gh];
		for (int j = 0; j < gh; j++) {
			for (int i = 0; i < gw; i++) {
				int bx = phaseX + (gx + i) * CELL, bz = phaseZ + (gz + j) * CELL, open = 0;
				for (int z = bz + 1; z < bz + CELL - 1; z++) for (int x = bx + 1; x < bx + CELL - 1; x++) if (openAt(cell, plan, x, z)) open++;
				present[j * gw + i] = open >= 20;
			}
		}
		// the boundary between two squares: 0 open, 1..7 a door (its middle), 8 and more open (one room)
		int[] owner = new int[gw * gh];
		Arrays.fill(owner, -1);
		// first the rooms the signs tell. A sign stands by its room's first corner (top left, the room
		// unturned), maybe a square off; SkyUp turns rooms, and the sign with them, but never the start
		// room. How far off is worked out from all signs at once: the way that fits the walls best
		int off = 4, offScore = Integer.MIN_VALUE;
		for (int o = 0; o < 9; o++) {
			int score = 0;
			for (int[] s : signs.values()) score += placeSign(cell, plan, present, null, gx, gz, gw, gh, s, o)[4];
			if (score > offScore) {
				offScore = score;
				off = o;
			}
		}
		signOff = off;
		// the start room first, then the larger rooms, so a small one does not take a big one's square
		List<int[]> bySize = new ArrayList<>(signs.values());
		bySize.sort((a, b) -> b[4] != a[4] ? b[4] - a[4] : b[2] * b[3] - a[2] * a[3]);
		for (int[] s : bySize) {
			int[] r = placeSign(cell, plan, present, owner, gx, gz, gw, gh, s, off);
			if (r[4] == Integer.MIN_VALUE) continue;
			Tile t = new Tile();
			t.start = s[4] == 1;
			for (int j = r[1]; j <= r[3]; j++) for (int i = r[0]; i <= r[2]; i++) if (owner[j * gw + i] < 0) claim(t, owner, gw, i, j, gridTiles.size());
			if (t.cells > 0) gridTiles.add(t);
		}
		// then squares with floor no sign tells about: together where nothing walls them apart
		ArrayDeque<Integer> queue = new ArrayDeque<>();
		for (int start = 0; start < gw * gh; start++) {
			if (!present[start] || owner[start] >= 0) continue;
			Tile t = new Tile();
			int id = gridTiles.size();
			claim(t, owner, gw, start % gw, start / gw, id);
			queue.add(start);
			while (!queue.isEmpty()) {
				int c = queue.poll(), i = c % gw, j = c / gw;
				int[][] next = { { i + 1, j, i, j, 1 }, { i - 1, j, i - 1, j, 1 }, { i, j + 1, i, j, 0 }, { i, j - 1, i, j - 1, 0 } };
				for (int[] n : next) {
					if (n[0] < 0 || n[1] < 0 || n[0] >= gw || n[1] >= gh) continue;
					int k = n[1] * gw + n[0];
					if (!present[k] || owner[k] >= 0 || openness(cell, plan, gx + n[2], gz + n[3], n[4] == 1) < 8) continue;
					claim(t, owner, gw, n[0], n[1], id);
					queue.add(k);
				}
			}
			gridTiles.add(t);
		}
		// doors: a gap in the wall between two rooms
		for (int j = 0; j < gh; j++) {
			for (int i = 0; i < gw; i++) {
				int here = owner[j * gw + i];
				if (here < 0) continue;
				if (i + 1 < gw && owner[j * gw + i + 1] >= 0 && owner[j * gw + i + 1] != here) door(cell, plan, gx + i, gz + j, true);
				if (j + 1 < gh && owner[(j + 1) * gw + i] >= 0 && owner[(j + 1) * gw + i] != here) door(cell, plan, gx + i, gz + j, false);
			}
		}
		for (Tile t : gridTiles) {
			t.x0 = phaseX + (gx + t.cx0) * CELL;
			t.z0 = phaseZ + (gz + t.cz0) * CELL;
			t.x1 = phaseX + (gx + t.cx1 + 1) * CELL - 1;
			t.z1 = phaseZ + (gz + t.cz1 + 1) * CELL - 1;
		}
		// what is going on in each: the floor's rooms in it, the start, the player
		for (Room room : rooms) {
			if (room.pixels == 0) continue;
			int i = cellX(room.centerX()) - gx, j = cellZ(room.centerZ()) - gz;
			if (i >= 0 && j >= 0 && i < gw && j < gh && owner[j * gw + i] >= 0) gridTiles.get(owner[j * gw + i]).add(room);
		}
		// one start room: where the player came in, when that is known, before what a sign says
		int[] start = start();
		if (start != null) {
			int i = cellX(start[0]) - gx, j = cellZ(start[1]) - gz;
			if (i >= 0 && j >= 0 && i < gw && j < gh && owner[j * gw + i] >= 0) {
				for (Tile t : gridTiles) t.start = false;
				gridTiles.get(owner[j * gw + i]).start = true;
			}
		}
		if (lastX >= 0) {
			int i = cellX(lastX) - gx, j = cellZ(lastZ) - gz;
			if (i >= 0 && j >= 0 && i < gw && j < gh && owner[j * gw + i] >= 0) gridTiles.get(owner[j * gw + i]).current = true;
		}
		// sure it is SkyUp's grid: its signs, or a start room of 5×5 squares; else the floor's own rooms
		boolean sure = !signs.isEmpty();
		for (Tile t : gridTiles) if (t.start && t.cx1 - t.cx0 == 4 && t.cz1 - t.cz0 == 4) sure = true;
		if (!sure) {
			gridTiles.clear();
			gridDoors.clear();
		}
	}

	/**
	 * Where a sign's room lies on the grid (squares x0, z0, x1, z1, and how well that fits the walls):
	 * unturned, its first corner (top left) `off` (0–8) a square from the sign either way; turned a
	 * quarter, a half or three quarters round with its sign, whichever fits best (the start room
	 * never). Its inside open, its edges walled and floor in its squares count for it; squares
	 * another room has (`owner`, when given) against it. MIN_VALUE when it fits on the grid no way.
	 */
	private static int[] placeSign(byte[] cell, byte[] plan, boolean[] present, int[] owner, int gx, int gz, int gw, int gh, int[] s, int off) {
		int si = cellX(s[0]) - gx, sj = cellZ(s[1]) - gz, dx = off % 3 - 1, dz = off / 3 - 1, a = s[2], b = s[3];
		int[] best = { 0, 0, 0, 0, Integer.MIN_VALUE };
		for (int turn = 0; turn < (s[4] == 1 ? 1 : 4); turn++) {
			// the sign's square from the room's first corner, turned with the room (screen: x right, z down)
			int rx = turn == 0 ? dx : turn == 1 ? -dz : turn == 2 ? -dx : dz, rz = turn == 0 ? dz : turn == 1 ? dx : turn == 2 ? -dz : -dx;
			int ox = si - rx, oz = sj - rz;
			int x0 = turn == 0 || turn == 3 ? ox : ox - (turn == 1 ? b : a) + 1, x1 = x0 + (turn % 2 == 0 ? a : b) - 1;
			int z0 = turn <= 1 ? oz : oz - (turn == 2 ? b : a) + 1, z1 = z0 + (turn % 2 == 0 ? b : a) - 1;
			if (x0 < 0 || z0 < 0 || x1 >= gw || z1 >= gh) continue;
			int score = 0;
			for (int j = z0; j <= z1; j++) {
				for (int i = x0; i <= x1; i++) {
					if (owner != null && owner[j * gw + i] >= 0) score -= 10;
					if (present[j * gw + i]) score++;
					// inside: open between its squares; on its edge: a wall to the next square
					if (i < x1) score += openness(cell, plan, gx + i, gz + j, true) >= 8 ? 1 : -2;
					else if (i + 1 < gw && present[j * gw + i + 1]) score += openness(cell, plan, gx + i, gz + j, true) >= 8 ? -2 : 1;
					if (j < z1) score += openness(cell, plan, gx + i, gz + j, false) >= 8 ? 1 : -2;
					else if (j + 1 < gh && present[(j + 1) * gw + i]) score += openness(cell, plan, gx + i, gz + j, false) >= 8 ? -2 : 1;
					if (i == x0 && i > 0 && present[j * gw + i - 1]) score += openness(cell, plan, gx + i - 1, gz + j, true) >= 8 ? -2 : 1;
					if (j == z0 && j > 0 && present[(j - 1) * gw + i]) score += openness(cell, plan, gx + i, gz + j - 1, false) >= 8 ? -2 : 1;
				}
			}
			if (score > best[4]) best = new int[] { x0, z0, x1, z1, score };
		}
		// a sign that fits nowhere counts as badly as can be, but not past adding up
		if (owner == null && best[4] == Integer.MIN_VALUE) best[4] = -1000;
		return best;
	}

	private static void claim(Tile t, int[] owner, int gw, int i, int j, int id) {
		owner[j * gw + i] = id;
		t.cells++;
		t.cx0 = Math.min(t.cx0, i);
		t.cz0 = Math.min(t.cz0, j);
		t.cx1 = Math.max(t.cx1, i);
		t.cz1 = Math.max(t.cz1, j);
	}

	/**
	 * How open the boundary is between grid square (ci, cj) and the next one across (or down): of
	 * the 11 places along it between the corners, how many go through both walls.
	 */
	private static int openness(byte[] cell, byte[] plan, int ci, int cj, boolean across) {
		int open = 0;
		for (int t = 1; t < CELL - 1; t++) {
			if (across) {
				int g = phaseX + (ci + 1) * CELL, z = phaseZ + cj * CELL + t;
				if (openAt(cell, plan, g - 1, z) && openAt(cell, plan, g, z)) open++;
			} else {
				int g = phaseZ + (cj + 1) * CELL, x = phaseX + ci * CELL + t;
				if (openAt(cell, plan, x, g - 1) && openAt(cell, plan, x, g)) open++;
			}
		}
		return open;
	}

	/** A door in the boundary between two rooms' squares, in the middle of its gap, if it has one. */
	private static void door(byte[] cell, byte[] plan, int ci, int cj, boolean across) {
		int open = 0;
		float sum = 0;
		for (int t = 1; t < CELL - 1; t++) {
			if (across) {
				int g = phaseX + (ci + 1) * CELL, z = phaseZ + cj * CELL + t;
				if (openAt(cell, plan, g - 1, z) && openAt(cell, plan, g, z)) {
					open++;
					sum += z;
				}
			} else {
				int g = phaseZ + (cj + 1) * CELL, x = phaseX + ci * CELL + t;
				if (openAt(cell, plan, x, g - 1) && openAt(cell, plan, x, g)) {
					open++;
					sum += x;
				}
			}
		}
		if (open == 0) return;
		// drawn half a block on: here the point between the two walls, and the middle of the gap's blocks
		if (across) gridDoors.add(new float[] { phaseX + (ci + 1) * CELL - 0.5f, sum / open });
		else gridDoors.add(new float[] { sum / open, phaseZ + (cj + 1) * CELL - 0.5f });
	}

	/** The tiles of the floor's own rooms, where the dungeon is not on the grid. */
	private static List<Tile> floorTiles() {
		List<Tile> out = new ArrayList<>();
		int start = startRoom(), current = roomAt(lastX, lastZ);
		for (int r = 0; r < rooms.size(); r++) {
			Room room = rooms.get(r);
			if (room.coreMinX > room.coreMaxX) continue;
			Tile t = new Tile();
			t.x0 = room.coreMinX;
			t.z0 = room.coreMinZ;
			t.x1 = room.coreMaxX;
			t.z1 = room.coreMaxZ;
			t.start = r == start;
			t.current = r == current;
			t.add(room);
			out.add(t);
		}
		return out;
	}

	/**
	 * The simple map: each room a tile in the colour of what is going on in it, with an icon in the
	 * middle, and a small yellow square on each door between two rooms. The start room is dark green
	 * with a campfire, the room the player is in light green, a room with mobs dark red with their
	 * heads, a cleared one green with the time until its mobs come back, the rest light red (dimmer
	 * when not visited yet) with the loot still to take in it.
	 */
	static void drawTiles(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy, int w, int h, float viewX, float viewZ, float scale) {
		long now = System.currentTimeMillis();
		boolean onGrid = !gridTiles.isEmpty();
		int[] you = { ox + Math.round((float) (mc.player.getX() - originX - viewX) * scale), oy + Math.round((float) (mc.player.getZ() - originZ - viewZ) * scale) };
		for (Tile t : onGrid ? gridTiles : floorTiles()) {
			int x0 = ox + Math.round((t.x0 - viewX) * scale) + 1, z0 = oy + Math.round((t.z0 - viewZ) * scale) + 1;
			int x1 = ox + Math.round((t.x1 + 1 - viewX) * scale) - 1, z1 = oy + Math.round((t.z1 + 1 - viewZ) * scale) - 1;
			if (x1 - x0 < 2 || z1 - z0 < 2) continue;
			boolean mobs = t.mobs > 0 || t.left > 0, cleared = t.respawnAt > now;
			int color = t.start ? 0xFF0EA30E : t.current ? 0xFF6EE86E : mobs ? 0xFFA30E0E : cleared ? 0xFF3E9E5A : t.visited ? 0xFFF06B6B : 0xFFB45656;
			// a rim a shade darker, as on a tile; zoomed in, cut at the map's edge
			box(g, x0, z0, x1, z1, ox, oy, w, h, mix(color, 0x000000, 0.3f));
			box(g, x0 + 1, z0 + 1, x1 - 1, z1 - 1, ox, oy, w, h, color);
			int cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, side = Math.min(x1 - x0, z1 - z0);
			int icon = Math.min(16, side * 3 / 5);
			if (icon < 6 || cx - icon / 2 < ox || cz - icon / 2 < oy || cx + icon / 2 > ox + w || cz + icon / 2 > oy + h) continue;
			// items are drawn over everything else: none where it would hide the player's own mark
			if (Math.abs(you[0] - cx) < icon / 2 + 5 && Math.abs(you[1] - cz) < icon / 2 + 5) continue;
			if (t.start) {
				DungeonMap.item(g, new net.minecraft.world.item.ItemStack(Items.CAMPFIRE), cx, cz, icon);
				continue;
			}
			if (mobs) {
				// up to four heads, two to a row; a mob out of sight (only the hologram's count): a skull
				List<net.minecraft.world.entity.LivingEntity> seen = new ArrayList<>();
				for (int id : t.mobIds) if (mc.level.getEntity(id) instanceof net.minecraft.world.entity.LivingEntity e && e.isAlive()) seen.add(e);
				// heads smaller than the other icons, so a few fit side by side with room around them
				int head = Math.max(6, Math.min(icon * 2 / 3, seen.size() > 1 ? side / 2 - 3 : icon));
				if (seen.isEmpty()) DungeonMap.item(g, new net.minecraft.world.item.ItemStack(Items.SKELETON_SKULL), cx, cz, head);
				for (int i = 0; i < seen.size(); i++) {
					int cols = Math.min(2, seen.size() - i / 2 * 2), rows = (seen.size() + 1) / 2;
					int hx = cx + Math.round((i % 2 - (cols - 1) / 2f) * (head + 2)), hz = cz + Math.round((i / 2 - (rows - 1) / 2f) * (head + 2));
					DungeonMap.tileMob(g, seen.get(i), hx, hz, head);
				}
				continue;
			}
			if (cleared) {
				if (SlashHud.config.dungeonCleared) plate(g, mc, clock((t.respawnAt - now + 999) / 1000), cx, cz, 0xFF4ADE80, Math.min(1f, side / 30f));
				continue;
			}
			if (t.lootCat >= 0) {
				net.minecraft.world.item.ItemStack loot = dev.slash3rss.slashclient.hud.ui.Ui.stack(LOOT_ICONS[t.lootCat]);
				if (loot != null) DungeonMap.item(g, loot, cx, cz, icon);
			}
		}
		int door = Math.max(2, Math.min(4, Math.round(scale * 1.5f)));
		for (float[] d : onGrid ? gridDoors : doors) {
			int x = ox + Math.round((d[0] + 0.5f - viewX) * scale) - door / 2, z = oy + Math.round((d[1] + 0.5f - viewZ) * scale) - door / 2;
			box(g, x, z, x + door, z + door, ox, oy, w, h, 0xFFFDE047);
		}
	}

	/** Debug, on the full map: the grid's lines, and each sign as a magenta dot with its size. */
	static void drawDebug(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy, int w, int h, float viewX, float viewZ, float scale) {
		if (phaseX >= 0 && scale * CELL >= 4) {
			int first = (int) Math.floor((viewX - phaseX) / CELL);
			for (int i = first; phaseX + i * CELL <= viewX + w / scale; i++) {
				int x = ox + Math.round((phaseX + i * CELL - viewX) * scale);
				box(g, x, oy, x + 1, oy + h, ox, oy, w, h, 0x50FFFFFF);
			}
			first = (int) Math.floor((viewZ - phaseZ) / CELL);
			for (int j = first; phaseZ + j * CELL <= viewZ + h / scale; j++) {
				int z = oy + Math.round((phaseZ + j * CELL - viewZ) * scale);
				box(g, ox, z, ox + w, z + 1, ox, oy, w, h, 0x50FFFFFF);
			}
		}
		for (int[] s : signs.values()) {
			int x = ox + Math.round((s[0] + 0.5f - viewX) * scale), z = oy + Math.round((s[1] + 0.5f - viewZ) * scale);
			if (x < ox || z < oy || x >= ox + w || z >= oy + h) continue;
			g.fill(x - 2, z - 2, x + 3, z + 3, 0xFF000000);
			g.fill(x - 1, z - 1, x + 2, z + 2, 0xFFFF00FF);
			g.text(mc.font, s[2] + "x" + s[3] + (s[4] == 1 ? "S" : ""), x + 4, z - 4, 0xFFFF80FF, true);
		}
	}

	/**
	 * Debug: what the map knows, as a text file (in the game's folder, slashclient-dungeon): the
	 * grid, the signs as read, the rooms worked out, and the dungeon block by block (the floor as
	 * seen and the map above it), to build the same dungeon in a test.
	 */
	static java.nio.file.Path dump(Minecraft mc, byte[] cell, byte[] plan, int x0, int z0, int x1, int z1, String level) throws java.io.IOException {
		StringBuilder out = new StringBuilder();
		out.append("SlashClient dungeon debug ").append(java.time.LocalDateTime.now()).append(", level ").append(level).append('\n');
		out.append("map origin (world) ").append(originX).append(' ').append(originZ).append(", seen map x ").append(x0).append("..").append(x1).append(" z ").append(z0).append("..").append(z1).append('\n');
		int[] st = start();
		out.append("start point ").append(st == null ? "-" : st[0] + " " + st[1]).append(", player in room at ").append(lastX).append(' ').append(lastZ).append('\n');
		out.append("grid phase x ").append(phaseX).append(" z ").append(phaseZ).append(", sign offset ").append(signOff).append('\n');
		out.append(summary()).append('\n');
		out.append("\nsigns (world x y z: lines):\n");
		for (String s : signText.values()) out.append(s).append('\n');
		out.append("\ntiles (map blocks x0 z0 x1 z1):\n");
		for (Tile t : gridTiles) out.append(t.x0).append(' ').append(t.z0).append(' ').append(t.x1).append(' ').append(t.z1).append(t.start ? " start" : "").append(t.current ? " current" : "").append('\n');
		out.append("\nfloor, from map x ").append(x0).append(" z ").append(z0).append(" (# wall, . floor, space not seen):\n");
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				byte c = cell[z * size + x];
				out.append(c == 1 ? '#' : c == 2 ? '.' : ' ');
			}
			out.append('\n');
		}
		out.append("\nmap above (y 37), from map x ").append(x0).append(" z ").append(z0).append(" (# black, . inside, y yellow, g green, space none):\n");
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				byte p = plan[z * size + x];
				out.append(p == PLAN_WALL ? '#' : p == PLAN_INSIDE ? '.' : p == PLAN_WAY ? 'y' : p == PLAN_START ? 'g' : ' ');
			}
			out.append('\n');
		}
		java.nio.file.Path dir = mc.gameDirectory.toPath().resolve("slashclient-dungeon");
		java.nio.file.Files.createDirectories(dir);
		java.nio.file.Path file = dir.resolve("dungeon-" + java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".txt");
		java.nio.file.Files.writeString(file, out.toString());
		return file;
	}

	/** A filled box, only the part of it within w×h at (ox, oy). */
	private static void box(GuiGraphicsExtractor g, int x0, int z0, int x1, int z1, int ox, int oy, int w, int h, int color) {
		x0 = Math.max(x0, ox);
		z0 = Math.max(z0, oy);
		x1 = Math.min(x1, ox + w);
		z1 = Math.min(z1, oy + h);
		if (x0 < x1 && z0 < z1) g.fill(x0, z0, x1, z1, color);
	}

	/** "1:05" for 65 seconds. */
	private static String clock(long seconds) {
		return seconds / 60 + ":" + String.format("%02d", seconds % 60);
	}

	/** A text centred on (cx, cy) on a dark plate with a rim, at `size` of the font's own. */
	private static void plate(GuiGraphicsExtractor g, Minecraft mc, String s, int cx, int cy, int color, float size) {
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(cx, cy);
		pose.scale(size, size);
		int w = mc.font.width(s), lx = -w / 2, ly = -4;
		g.fill(lx - 3, ly - 2, lx + w + 2, ly + 9, 0xFF000000);
		g.fill(lx - 2, ly - 1, lx + w + 1, ly + 8, 0xFF1F2937);
		g.text(mc.font, s, lx, ly, color, true);
		pose.popMatrix();
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
		return rooms.size() + " rooms, containers " + containerCount(false) + ", ores " + containerCount(true) + ", cleared " + clearedRooms + ", without spawner " + noSpawner + ", doors " + doors.size() + ", tiles " + gridTiles.size() + ", tile doors " + gridDoors.size() + ", starts " + gridTiles.stream().filter(t -> t.start).count();
	}
}
