package dev.slash3rss.slashclient.hud.skyup;

import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.state.BlockState;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
import dev.slash3rss.slashclient.hud.modules.HudModule;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.modules.Modules;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.map.MobHeads;
import dev.slash3rss.slashclient.hud.map.WorldMapScreen;

/**
 * A map of a dungeon (SkyUp.pl's dungeon sector, where every dungeon is laid out at random): from
 * above, what has been seen of the floor at the player's height, walkable floor in its own block's
 * colour (the start room's green shows green), walls dark, the player as an arrow and others as
 * dots.
 *
 * In a dungeon the server shows a boss bar ("Dungeon poz. 2"): the map is on while it is there.
 * The hint on entering ("Dungeon » Czy wiesz że…") comes still in the lobby, just before the
 * teleport: it starts the map too, and a jump far from where it started begins it anew there.
 * Leaving ("Dungeon » Opuszczono Dungeon…", the boss bar gone) ends it.
 *
 * What is shown is drawn into a picture of its own each tick: all that was seen, or a part of it
 * around the player (zoomed in, or following them), square or round.
 */
public final class DungeonMap implements HudModule {
	/** The blocks the map can hold, around where the dungeon was entered (a big dungeon fits whole: 512 each way). */
	private static final int SIZE = 1024;
	/**
	 * The floor is read in two rings: close by (NEAR) all of it every half second, so a broken pot or
	 * a mined ore shows at once; further out, as far as RANGE (the map fills in as far as the game has
	 * the dungeon loaded), a few hundred columns each tick.
	 */
	private static final int NEAR = 36, NEAR_TICKS = 10;
	private static final int RANGE = 128;
	private static final int FAR_COLUMNS_PER_TICK = 320;
	private static final int UNKNOWN = 0, WALL = 0xFF0E131C;
	private static final Pattern LEVEL = Pattern.compile("Dungeon\\s+poz\\.?\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
	/** Compiled once: every chat line and every name on the map goes through these. */
	private static final Pattern COLOR_CODE = Pattern.compile("§."), DUNGEON_PREFIX = Pattern.compile("^Dungeon\\s*(»|>>)\\s*");

	/** A text without its colour codes; most have none, and those cost nothing. */
	static String uncoloured(String text) {
		return text.indexOf('§') < 0 ? text : COLOR_CODE.matcher(text).replaceAll("");
	}

	private static boolean active;
	private static ClientLevel level;
	/** The map's corner in the world (x, z) and the part of it seen so far. */
	private static int originX, originZ;
	private static int minX = Integer.MAX_VALUE, minZ = Integer.MAX_VALUE, maxX = Integer.MIN_VALUE, maxZ = Integer.MIN_VALUE;
	private static NativeImage image;
	/** Each map pixel: 0 not seen, 1 wall, 2 floor (for the rooms). */
	private static final byte[] cell = new byte[SIZE * SIZE];
	/** The map SkyUp builds above each dungeon, read block for block (see DungeonRooms.PLAN_*). */
	private static final byte[] plan = new byte[SIZE * SIZE];
	/** Where that map is (y), and how far around the player it is read. */
	private static final int PLAN_LOW = 35, PLAN_HIGH = 41, PLAN_Y = 37, PLAN_RADIUS = 160;
	/**
	 * The map above is read a few thousand columns a tick, so no tick takes long; as far out as the
	 * rooms' signs are read, so a room known from its sign has its walls and doors too.
	 */
	private static final int PLAN_COLUMNS_PER_TICK = 2600;
	/**
	 * The places around the player (dx, dz packed), nearest first, out to PLAN_RADIUS: the order the
	 * map above and the far floor are read in, so the map grows from the player evenly every way.
	 */
	private static final long[] AROUND = around(PLAN_RADIUS);
	/** Where in AROUND the map above and the far floor read next. */
	private static int planAt, farAt;

	private static long[] around(int r) {
		java.util.List<Long> out = new java.util.ArrayList<>();
		for (int dx = -r; dx <= r; dx++) {
			for (int dz = -r; dz <= r; dz++) {
				long d = (long) dx * dx + (long) dz * dz;
				if (d <= (long) r * r) out.add(d << 32 | (long) (dx + 1024) << 16 | dz + 1024);
			}
		}
		long[] sorted = out.stream().mapToLong(Long::longValue).toArray();
		java.util.Arrays.sort(sorted);
		return sorted;
	}

	private static int aroundDx(long p) {
		return (int) (p >> 16 & 0xFFFF) - 1024;
	}

	private static int aroundDz(long p) {
		return (int) (p & 0xFFFF) - 1024;
	}

	private static long aroundDist(long p) {
		return p >>> 32;
	}
	/** The dungeon's ground (y), and how far its rooms reach below and above it. */
	private static int groundY;
	private static boolean grounded;
	private static final int BELOW = 21, ABOVE = 14;
	/** Which slice of rows the near ring reads next. */
	private static int scanRow;
	private static int tick;
	private static String dungeonLevel = "";
	/** The dungeon's boss bar was on screen at the last look. */
	private static boolean bossBar;
	/** Started by the entering hint (no boss bar seen yet): it may still be the lobby. */
	private static long hintedAt;
	/** The height the map was read at: a fixed one, or MIN_VALUE for the player's feet. */
	private static int readAt = Integer.MIN_VALUE;
	/** The picture on screen, and where it is in the map: its corner and pixels per block. */
	private static NativeImage view;
	private static DynamicTexture viewTexture;
	private static Identifier viewId;
	private static float viewX, viewZ, viewScale = 1f;
	public static net.minecraft.client.KeyMapping zoomInKey, zoomOutKey, fullKey, styleKey;

	public String id() {
		return "dungeonmap";
	}

	@Override
	public boolean framed() {
		// a round map has no square box or frame around it
		return !round();
	}

	/** The simple map: rooms as tiles instead of the floor as seen. */
	static boolean simple() {
		return "simple".equals(SlashHud.config.dungeonStyle);
	}

	/** A round map (the simple one is always square: its tiles are). */
	private static boolean round() {
		return "circle".equals(SlashHud.config.dungeonShape) && !simple();
	}

	// ---------- in and out of a dungeon ----------

	/** The server's lines: the hint on entering starts a map, leaving ends it. */
	public static void onChat(String line) {
		String plain = uncoloured(line).trim();
		if (!plain.startsWith("Dungeon")) return;
		String rest = DUNGEON_PREFIX.matcher(plain).replaceFirst("");
		if (rest.startsWith("Opuszczono Dungeon") || rest.startsWith("Opuściłeś")) {
			stop();
			hintedAt = 0;
		} else if (rest.startsWith("Czy wiesz")) {
			hintedAt = System.currentTimeMillis();
			start();
		}
	}

	/** A new dungeon: an empty map around where the player is now. */
	static void start() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return;
		active = true;
		level = mc.level;
		originX = mc.player.getBlockX() - SIZE / 2;
		originZ = mc.player.getBlockZ() - SIZE / 2;
		// entering, the player stands on the dungeon's ground; sure only once the boss bar is there
		groundY = mc.player.getBlockY();
		grounded = bossBar;
		minX = minZ = Integer.MAX_VALUE;
		maxX = maxZ = Integer.MIN_VALUE;
		if (image == null) {
			image = new NativeImage(SIZE, SIZE, true);
		}
		DungeonRooms.reset(SIZE, originX, originZ);
		// already in the dungeon (the boss bar is up): the player is in its start room
		if (bossBar) DungeonRooms.setStart(SIZE / 2, SIZE / 2);
		java.util.Arrays.fill(plan, (byte) 0);
		if (view == null) {
			view = new NativeImage(W, H, true);
			viewTexture = new DynamicTexture(() -> "SlashClient dungeon map view", view);
			viewId = Identifier.fromNamespaceAndPath(SlashHud.ID, "dungeon_map_view");
			mc.getTextureManager().register(viewId, viewTexture);
		}
		clear();
	}

	/** Nothing seen yet (a new dungeon, or the map read at another height). */
	private static void clear() {
		minX = minZ = Integer.MAX_VALUE;
		maxX = maxZ = Integer.MIN_VALUE;
		for (int y = 0; y < SIZE; y++) for (int x = 0; x < SIZE; x++) image.setPixel(x, y, UNKNOWN);
		java.util.Arrays.fill(cell, (byte) 0);
		changes++;
	}

	public static void stop() {
		active = false;
		level = null;
		dungeonLevel = "";
		hintedAt = 0;
		// the trip is over: its summary (out of a world, none)
		DungeonRun.end(Minecraft.getInstance().level != null);
	}

	/** True while there is a dungeon to show. */
	public static boolean active() {
		return active;
	}

	/** For the test: as if in a dungeon (or not). */
	static void activeForTest(boolean on) {
		active = on;
	}

	/** When the last tick ran (ns): how far between two ticks a frame is, for the player's smooth place. */
	private static long tickAt = System.nanoTime();

	/** The player's place now, between the last two ticks (x, z), so a map following them glides instead of stepping 20 times a second. */
	private static double[] smooth(Minecraft mc) {
		double f = Math.min(1.0, (System.nanoTime() - tickAt) / 50_000_000.0);
		var p = mc.player;
		return new double[] { p.xo + (p.getX() - p.xo) * f, p.zo + (p.getZ() - p.zo) * f };
	}

	/** The map follows the player (round, or set so, or zoomed in): drawn again each frame. */
	private static boolean following() {
		HudConfig cfg = SlashHud.config;
		return round() || cfg.dungeonFollow || cfg.dungeonZoom > 1.001f;
	}

	public static void tick(Minecraft mc) {
		tickAt = System.nanoTime();
		looks.clear();
		if (mc.level == null || mc.player == null) {
			if (active) stop();
			return;
		}
		if (++tick % 10 == 0) {
			bossBar = readLevel(mc);
			// the boss bar: in a dungeon (a map starts, or goes on); gone: out, unless the hint just came
			if (bossBar && !active) start();
			if (bossBar) DungeonRun.begin();
			if (bossBar) DungeonRun.sample(mc, bossBarTexts(mc));
			// the boss bar shows once the player is in the start room: its floor is the ground the
			// rooms' heights count from (a map started by the hint was still in the lobby)
			if (bossBar && active && !grounded) {
				groundY = mc.player.getBlockY();
				grounded = true;
				clear();
				// and where the start room is: nothing to take or clear there
				DungeonRooms.setStart(mc.player.getBlockX() - originX, mc.player.getBlockZ() - originZ);
			}
			boolean hinted = hintedAt > 0 && System.currentTimeMillis() - hintedAt < 20_000;
			if (!bossBar && active && !hinted) {
				stop();
				return;
			}
		}
		// M: the whole map on the screen; outside a dungeon the map of the world (WorldMapScreen)
		if (fullKey != null) {
			while (fullKey.consumeClick()) {
				if (Compat.screen(mc) != null || mc.player == null) continue;
				if (active && minX <= maxX) mc.setScreenAndShow(new DungeonMapScreen(fullKey));
				else if (WorldMapScreen.on()) mc.setScreenAndShow(new WorldMapScreen(fullKey));
			}
		}
		if (!active) return;
		zoomKeys();
		// another world, or a jump far away (the teleport into the dungeon): the map begins there
		int px = mc.player.getBlockX() - originX, pz = mc.player.getBlockZ() - originZ;
		if (mc.level != level || px < -64 || pz < -64 || px > SIZE + 64 || pz > SIZE + 64) start();
		DungeonRooms.watchOpening(mc);
		// the map above the dungeon: a few rows each tick, all of it about once a second (no stutter)
		scanPlan(mc);
		scan(mc);
		if (tick % 10 == 0) {
			DungeonRooms.update(mc, cell, plan, minX, minZ, maxX, maxZ, originX, originZ);
			// the rooms anew: their tints (no spawner, cleared) may have changed
			changes++;
		}
		// a map following the player is drawn each frame anyway (draw)
		if (!following()) render(mc);
	}

	/** = and - zoom the map in and out, a quarter at a time. */
	private static void zoomKeys() {
		// H: the other look of the map (detailed or simple), as Tab in the full map
		if (styleKey != null) {
			boolean flip = false;
			while (styleKey.consumeClick()) flip = !flip;
			if (flip) {
				SlashHud.config.dungeonStyle = simple() ? "detailed" : "simple";
				SlashHud.config.save();
			}
		}
		if (zoomInKey == null) return;
		float zoom = SlashHud.config.dungeonZoom;
		while (zoomInKey.consumeClick()) zoom += 0.25f;
		while (zoomOutKey.consumeClick()) zoom -= 0.25f;
		zoom = Math.max(1f, Math.min(4f, zoom));
		if (zoom != SlashHud.config.dungeonZoom) {
			SlashHud.config.dungeonZoom = zoom;
			SlashHud.config.save();
		}
	}

	/** The picture on screen: the part of the map shown, in its shape. */
	private static void render(Minecraft mc) {
		resize();
		if (minX > maxX) return;
		HudConfig cfg = SlashHud.config;
		boolean circle = round();
		int mx0 = Math.max(0, minX - 2), mz0 = Math.max(0, minZ - 2);
		int mw = Math.min(SIZE, maxX + 3) - mx0, mh = Math.min(SIZE, maxZ + 3) - mz0;
		if (!circle && !cfg.dungeonFollow && cfg.dungeonZoom <= 1.001f) {
			// all that was seen, as large as fits
			viewScale = Math.min((float) W / mw, (float) H / mh);
			viewX = mx0 - (W / viewScale - mw) / 2f;
			viewZ = mz0 - (H / viewScale - mh) / 2f;
		} else {
			// around the player: the whole of it at 1×, closer as it zooms in
			float span = Math.max(12f, Math.max(mw, mh) / Math.max(1f, cfg.dungeonZoom));
			viewScale = W / span;
			double[] at = smooth(mc);
			viewX = (float) (at[0] - originX) - span / 2f;
			viewZ = (float) (at[1] - originZ) - span / 2f;
		}
		// the simple map draws its tiles straight on screen: no picture
		if (simple()) return;
		// following the player, the picture is placed to a whole pixel: it moves only when they have
		// moved a pixel's worth (the marks over it stay where the player is exactly)
		float px = viewX, pz = viewZ;
		if (following()) {
			px = Math.round(viewX * viewScale) / viewScale;
			pz = Math.round(viewZ * viewScale) / viewScale;
		}
		// painting up to 400×400 pixels and sending them to the graphics card costs frames: only when
		// something in it changed (the map read, the place or size shown, the look set, a room's tint)
		int flags = (circle ? 1 : 0) | (cfg.dungeonBlockColors ? 2 : 0) | (cfg.dungeonPlan ? 4 : 0);
		long key = (long) Float.floatToIntBits(px) << 32 | Float.floatToIntBits(pz) & 0xFFFFFFFFL;
		int tints = DungeonRooms.tintKey();
		if (view == paintedView && key == paintedAt && Float.floatToIntBits(viewScale) == paintedScale && flags == paintedFlags
				&& changes == paintedChanges && tints == paintedTints) return;
		paint(view, W, H, px, pz, viewScale, circle);
		viewTexture.upload();
		paintedView = view;
		paintedAt = key;
		paintedScale = Float.floatToIntBits(viewScale);
		paintedFlags = flags;
		paintedChanges = changes;
		paintedTints = tints;
	}

	/** Counts each change to what the map has read (floor, walls, the map above, the rooms). */
	private static int changes;
	/** What the picture on screen was last painted from (render): the same again needs no painting. */
	private static NativeImage paintedView;
	private static long paintedAt;
	private static int paintedScale, paintedFlags, paintedChanges, paintedTints;

	/** The map into a picture: `w`×`h` pixels from (vx, vz) on the map, `scale` pixels per block. */
	static void paint(NativeImage view, int w, int h, float vx, float vz, float scale, boolean circle) {
		HudConfig cfg = SlashHud.config;
		float r = w / 2f;
		for (int py = 0; py < h; py++) {
			for (int px = 0; px < w; px++) {
				int color = UNKNOWN;
				float dx = px + 0.5f - r, dz = py + 0.5f - r;
				if (!circle || dx * dx + dz * dz <= r * r) {
					int ix = (int) Math.floor(vx + (px + 0.5f) / scale), iz = (int) Math.floor(vz + (py + 0.5f) / scale);
					if (ix >= 0 && iz >= 0 && ix < SIZE && iz < SIZE) {
						color = image.getPixel(ix, iz);
						byte c = cell[iz * SIZE + ix];
						// plain: one grey for the floor (green where the start room's is green), walls near black
						// a single block to stand on out in the rock (a sign on a ledge): not a room, not drawn
						if (c == 2 && lone(ix, iz)) color = UNKNOWN;
						else if (c == 2) color = DungeonRooms.tint(ix, iz, cfg.dungeonBlockColors ? color : plain(color));
						// a wall one block thick, along the floor: the rock behind it is left out
						else if (c == 1 && !byFloor(ix, iz)) color = UNKNOWN;
						else if (c == 1 && !cfg.dungeonBlockColors) color = 0xFF0B0F17;
						// not seen yet: the room as the map above shows it, dimmer
						else if (c == 0 && cfg.dungeonPlan) color = ghost(plan[iz * SIZE + ix]);
					}
					// a round map shows its whole disc, also where nothing was seen yet
					if (circle && color == UNKNOWN) color = 0x90101828;
				}
				view.setPixel(px, py, color);
			}
		}
	}

	/** Whether a map pixel has floor next to it (any of the eight round it). */
	private static boolean byFloor(int x, int z) {
		for (int dz = -1; dz <= 1; dz++) {
			for (int dx = -1; dx <= 1; dx++) {
				int nx = x + dx, nz = z + dz;
				if (nx >= 0 && nz >= 0 && nx < SIZE && nz < SIZE && cell[nz * SIZE + nx] == 2 && !lone(nx, nz)) return true;
			}
		}
		return false;
	}

	/** Whether a floor pixel has no floor beside it (none of the four round it). */
	private static boolean lone(int x, int z) {
		return !(floor(x - 1, z) || floor(x + 1, z) || floor(x, z - 1) || floor(x, z + 1));
	}

	private static boolean floor(int x, int z) {
		return x >= 0 && z >= 0 && x < SIZE && z < SIZE && cell[z * SIZE + x] == 2;
	}

	/** The part of the map seen (x, z, width, height), with a margin, or null before anything was seen. */
	static int[] seen() {
		if (!active || minX > maxX) return null;
		int mx0 = Math.max(0, minX - 2), mz0 = Math.max(0, minZ - 2);
		return new int[] { mx0, mz0, Math.min(SIZE, maxX + 3) - mx0, Math.min(SIZE, maxZ + 3) - mz0 };
	}

	static String titleText() {
		return dungeonLevel.isEmpty() ? Component.translatable("slashclient-hud.dungeon").getString()
			: Component.translatable("slashclient-hud.dungeon.level", dungeonLevel).getString();
	}

	/** A block of the map above, drawn where the floor below was not seen yet. */
	private static int ghost(byte p) {
		return switch (p) {
			case DungeonRooms.PLAN_WALL -> 0xFF0B0F17;
			case DungeonRooms.PLAN_INSIDE -> 0xFF262C38;
			case DungeonRooms.PLAN_WAY -> 0xFF6B5523;
			case DungeonRooms.PLAN_START -> 0xFF2B5136;
			default -> UNKNOWN;
		};
	}

	/**
	 * The map above the dungeon (concrete or terracotta at y 37): what each column has there, the first
	 * coloured block (y 37 first). It lies one to one over the rooms, so it tells their walls before
	 * they are seen.
	 */
	private static void scanPlan(Minecraft mc) {
		ClientLevel world = mc.level;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int cx = mc.player.getBlockX(), cz = mc.player.getBlockZ();
		// from the player outwards, nearest first; columns already read cost next to nothing (the map
		// does not change), so each round gets further out sooner
		int read = 0;
		for (int steps = 0; steps < AROUND.length && read < PLAN_COLUMNS_PER_TICK; steps++) {
			if (planAt >= AROUND.length) planAt = 0;
			long p = AROUND[planAt++];
			int x = cx + aroundDx(p), z = cz + aroundDz(p);
			int ix = x - originX, iz = z - originZ;
			if (ix < 0 || iz < 0 || ix >= SIZE || iz >= SIZE || plan[iz * SIZE + ix] != 0 || !world.hasChunk(x >> 4, z >> 4)) continue;
			read++;
			// the map's own layer first (y 37): the start room's green mark lies over it, a block higher
			byte kind = planKind(world.getBlockState(pos.set(x, PLAN_Y, z)));
			for (int y = PLAN_HIGH; y >= PLAN_LOW && kind == 0; y--) kind = planKind(world.getBlockState(pos.set(x, y, z)));
			if (kind == 0) continue;
			plan[iz * SIZE + ix] = kind;
			changes++;
			minX = Math.min(minX, ix);
			minZ = Math.min(minZ, iz);
			maxX = Math.max(maxX, ix);
			maxZ = Math.max(maxZ, iz);
		}
	}

	/**
	 * The map is concrete (black, grey and yellow on SkyUp now) or terracotta: black a wall, yellow
	 * (or orange) a way, green the start room's mark, any other colour inside a room.
	 */
	private static byte planKind(BlockState state) {
		if (state.isAir()) return 0;
		String id = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath();
		if (!id.contains("terracotta") && !id.endsWith("_concrete")) return 0;
		if (id.startsWith("black_")) return DungeonRooms.PLAN_WALL;
		if (id.startsWith("yellow_") || id.startsWith("orange_")) return DungeonRooms.PLAN_WAY;
		if (id.startsWith("lime_") || id.startsWith("green_")) return DungeonRooms.PLAN_START;
		return DungeonRooms.PLAN_INSIDE;
	}

	/** A floor colour made plain: green stays green (the start room), anything else one grey. */
	private static int plain(int argb) {
		int r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		return g > r + 30 && g > b + 30 ? 0xFF3E8E52 : 0xFF4B5563;
	}

	/**
	 * The XP a dungeon level takes to the next: as learned from the damage dealt (DungeonXp), else from SkyUp's
	 * formula. The boss bar only says how full it is, so the XP is that part of it.
	 */
	public static int xpNeeded(int level) {
		return DungeonXp.need(level);
	}

	/** SkyUp's formula for a level's XP: 130·L − 9·L² + L³/5 (whole numbers, the division too). */
	static int formula(int level) {
		long l = Math.max(1, level);
		return (int) Math.max(1, 130 * l - 9 * l * l + l * l * l / 5);
	}

	/** The dungeon's boss bar as drawn: its name and the XP as a number ("Dungeon poz. 3 · 52/125 xp"); any other bar as it is. */
	public static Component withXp(Component name, float progress) {
		if (name == null || SlashHud.config == null || !SlashHud.config.dungeonXp) return name;
		Matcher m = LEVEL.matcher(name.getString());
		if (!m.find()) return name;
		int need;
		try {
			need = xpNeeded(Integer.parseInt(m.group(1)));
		} catch (NumberFormatException e) {
			return name;
		}
		int have = Math.round(Math.max(0f, Math.min(1f, progress)) * need);
		return name.copy().append(Component.literal(" · " + have + "/" + need + " xp").withStyle(net.minecraft.ChatFormatting.GRAY));
	}

	/** The dungeon's boss bar now, every tick (DungeonXp): its level and fill, or null when it is not there. */
	static float[] barNow(Minecraft mc) {
		var overlay = Compat.bossOverlay(mc);
		if (overlay == null) return null;
		for (var event : ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values()) {
			Matcher m = LEVEL.matcher(event.getName().getString());
			if (!m.find()) continue;
			try {
				return new float[] { Integer.parseInt(m.group(1)), event.getProgress() };
			} catch (NumberFormatException e) {
				return null;
			}
		}
		return null;
	}

	/** The boss bars' texts, colours left out. */
	static java.util.List<String> bossBarTexts(Minecraft mc) {
		java.util.List<String> out = new java.util.ArrayList<>();
		var overlay = Compat.bossOverlay(mc);
		if (overlay == null) return out;
		for (var event : ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values()) out.add(uncoloured(event.getName().getString()));
		return out;
	}

	/** "Dungeon poz. 2" on the boss bar: whether it is there, and the dungeon's level for the map's title. */
	private static boolean readLevel(Minecraft mc) {
		var overlay = Compat.bossOverlay(mc);
		if (overlay == null) return false;
		for (var event : ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values()) {
			Matcher m = LEVEL.matcher(event.getName().getString());
			if (m.find()) {
				dungeonLevel = m.group(1);
				DungeonRun.level(dungeonLevel);
				try {
					DungeonRun.xp(Integer.parseInt(dungeonLevel), event.getProgress());
				} catch (NumberFormatException e) {
					// a level too long for a number: no XP
				}
				// how far the player got, for SkyUp's task "Dotrzyj do poziomu w dungeonach" (the tasks are on 26.3)
				//#if MC >= 26.3
				SkyCounters.dungeonLevel(Long.parseLong(dungeonLevel));
				//#endif
				return true;
			}
		}
		return false;
	}

	/**
	 * The floor around the player, a few blocks up and down: a column is walkable where something
	 * can be stood on with two blocks of room above it, a wall where there is no such place.
	 */
	private static void scan(Minecraft mc) {
		ClientLevel world = mc.level;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		// always at the start room's floor, so going up or down stairs does not draw another storey
		int at = groundY;
		if (at != readAt) {
			readAt = at;
			clear();
		}
		int cx = mc.player.getBlockX(), cz = mc.player.getBlockZ();
		// loot is counted in all of a room: from 21 blocks below the start room's floor to 14 above it
		int low = groundY - BELOW, high = groundY + ABOVE;
		int near = at;
		// close by: a slice of the rows each tick, all of them every NEAR_TICKS ticks
		int nearRows = (NEAR * 2 + 1 + NEAR_TICKS - 1) / NEAR_TICKS;
		int nearFrom = cx - NEAR + scanRow * nearRows;
		scanRow = (scanRow + 1) % NEAR_TICKS;
		for (int x = nearFrom; x < nearFrom + nearRows && x <= cx + NEAR; x++) {
			for (int z = cz - NEAR; z <= cz + NEAR; z++) column(world, pos, x, z, low, high, near);
		}
		// further out: what the near ring does not cover, in rings from the player outwards (nearest
		// first, every way alike) as far as RANGE; all of it takes about ten seconds
		long reach = (long) RANGE * RANGE;
		for (int done = 0, steps = 0; done < FAR_COLUMNS_PER_TICK && steps < AROUND.length; steps++) {
			if (farAt >= AROUND.length || aroundDist(AROUND[farAt]) > reach) farAt = 0;
			long p = AROUND[farAt++];
			int dx = aroundDx(p), dz = aroundDz(p);
			if (Math.abs(dx) <= NEAR && Math.abs(dz) <= NEAR) continue;
			column(world, pos, cx + dx, cz + dz, low, high, near);
			done++;
		}
	}

	/** One column of the floor: its loot for the rooms, and its colour on the map (`near`: the height it is seen at). */
	private static void column(ClientLevel world, BlockPos.MutableBlockPos pos, int x, int z, int low, int high, int near) {
		int ix = x - originX, iz = z - originZ;
		if (ix < 0 || iz < 0 || ix >= SIZE || iz >= SIZE) return;
		if (!world.hasChunk(x >> 4, z >> 4)) return;
		DungeonRooms.scanColumn(world, pos, x, low - 1, high + 3, z);
		// drawn as seen near the player's height: a place to stand a couple of blocks up or down
		int color = WALL;
		for (int dy = -2; dy <= 2; dy++) {
			int y = near + dy;
			if (solid(world, pos.set(x, y - 1, z)) && !solid(world, pos.set(x, y, z)) && !solid(world, pos.set(x, y + 1, z))) {
				color = floorColor(blockColor(world, world.getBlockState(pos.set(x, y - 1, z)), pos));
				break;
			}
		}
		// columns of nothing at all (outside the dungeon, open sky below) stay unknown
		if (color == WALL && !anySolid(world, pos, x, near, z)) return;
		if (image.getPixel(ix, iz) != color) {
			image.setPixel(ix, iz, color);
			changes++;
		}
		byte c = (byte) (color == WALL ? 1 : 2);
		if (cell[iz * SIZE + ix] != c) {
			cell[iz * SIZE + ix] = c;
			changes++;
		}
		minX = Math.min(minX, ix);
		minZ = Math.min(minZ, iz);
		maxX = Math.max(maxX, ix);
		maxZ = Math.max(maxZ, iz);
	}

	private static boolean anySolid(ClientLevel world, BlockPos.MutableBlockPos pos, int x, int cy, int z) {
		for (int y = cy - 3; y <= cy + 3; y++) if (solid(world, pos.set(x, y, z))) return true;
		return false;
	}

	private static boolean solid(ClientLevel world, BlockPos pos) {
		return !world.getBlockState(pos).getCollisionShape(world, pos).isEmpty();
	}

	/** Each block's colour as seen from above: its texture's average (0xRRGGBB), or -1 when it has no texture found. */
	private static final java.util.Map<net.minecraft.world.level.block.Block, Integer> textureColors = new java.util.HashMap<>();

	/**
	 * A block's colour on the map as it looks in the game: its texture from above (a log's end, the grass's top)
	 * averaged, tinted as the game tints it (grass and leaves by the biome); a block without a texture of its
	 * own name, its map colour.
	 */
	static int blockColor(ClientLevel world, BlockState state, BlockPos pos) {
		int base = textureColors.computeIfAbsent(state.getBlock(), DungeonMap::textureColor);
		if (base == -1) return state.getMapColor(world, pos).col;
		int tint = -1;
		try {
			//#if MC >= 26.1
			var source = Minecraft.getInstance().getBlockColors().getTintSource(state, 0);
			if (source != null) tint = source.colorInWorld(state, world, pos);
			//#else
			//$ tint = Minecraft.getInstance().getBlockColors().getColor(state, world, pos, 0);
			//#endif
		} catch (RuntimeException e) {
			tint = -1;
		}
		if (tint == -1 || (tint & 0xFFFFFF) == 0xFFFFFF) return base;
		int r = (base >> 16 & 0xFF) * (tint >> 16 & 0xFF) / 255, g = (base >> 8 & 0xFF) * (tint >> 8 & 0xFF) / 255, b = (base & 0xFF) * (tint & 0xFF) / 255;
		return r << 16 | g << 8 | b;
	}

	/**
	 * The average colour of a block's texture from above, read from the game's resources (resource packs too):
	 * "<name>_top" first (logs, grass, pumpkins), then "<name>"; stairs, slabs and walls by the block they are
	 * made of ("stone_brick_stairs": stone_bricks, "oak_slab": oak_planks). -1 when none is found.
	 */
	private static int textureColor(net.minecraft.world.level.block.Block block) {
		var key = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(block);
		String name = key.getPath();
		java.util.List<String> tries = new java.util.ArrayList<>(java.util.List.of(name + "_top", name));
		String base = name.replaceFirst("_(stairs|slab|wall|pressure_plate|carpet)$", "");
		if (!base.equals(name)) tries.addAll(java.util.List.of(base, base + "s", base + "_planks", base.replace("_brick", "_bricks"), base + "_block"));
		for (String t : tries) {
			int c = averageColor(Identifier.fromNamespaceAndPath(key.getNamespace(), "textures/block/" + t + ".png"));
			if (c != -1) return c;
		}
		return -1;
	}

	/** The average of a texture's seen pixels (its first frame: an animated one is frames one under another), or -1. */
	private static int averageColor(Identifier texture) {
		try {
			var resource = Minecraft.getInstance().getResourceManager().getResource(texture);
			if (resource.isEmpty()) return -1;
			java.awt.image.BufferedImage image;
			try (var in = resource.get().open()) {
				image = javax.imageio.ImageIO.read(in);
			}
			if (image == null) return -1;
			int side = Math.min(image.getWidth(), image.getHeight());
			long r = 0, g = 0, b = 0, n = 0;
			for (int y = 0; y < side; y++) for (int x = 0; x < side; x++) {
				int p = image.getRGB(x, y);
				if ((p >>> 24) < 128) continue;
				r += p >> 16 & 0xFF;
				g += p >> 8 & 0xFF;
				b += p & 0xFF;
				n++;
			}
			if (n == 0) return -1;
			return (int) (r / n) << 16 | (int) (g / n) << 8 | (int) (b / n);
		} catch (Exception e) {
			return -1;
		}
	}

	/** The floor's map colour, a little lighter so floor and walls stand apart; never too dark to see. */
	private static int floorColor(int rgb) {
		int r = rgb >> 16 & 0xFF, g = rgb >> 8 & 0xFF, b = rgb & 0xFF;
		int light = Math.max(r, Math.max(g, b));
		if (light < 90) {
			r = r + (90 - light);
			g = g + (90 - light);
			b = b + (90 - light);
		}
		return 0xFF000000 | Math.min(255, r) << 16 | Math.min(255, g) << 8 | Math.min(255, b);
	}

	// ---------- the module ----------

	/** The map's size on screen (set in its settings). */
	private static int W = 120, H = 120;

	/** The size from the settings; the picture is made anew when it changes. */
	private static void resize() {
		int size = Math.max(80, Math.min(400, SlashHud.config.dungeonSize));
		if (size == W) return;
		W = H = size;
		if (view == null) return;
		Minecraft mc = Minecraft.getInstance();
		view = new NativeImage(W, H, true);
		viewTexture = new DynamicTexture(() -> "SlashClient dungeon map view", view);
		mc.getTextureManager().register(viewId, viewTexture);
	}

	@Override
	public boolean visible(Minecraft mc) {
		return active && minX <= maxX;
	}

	@Override
	public int width(Minecraft mc) {
		resize();
		return W;
	}

	@Override
	public int height(Minecraft mc) {
		return H + countersHeight(mc, false);
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		if (!visible(mc)) return;
		// following the player: the picture made again for this frame, where they are now
		if (viewTexture == null || following()) render(mc);
		// the loot counters above the map, under it, or on it along its bottom edge (as set)
		int over = countersHeight(mc, true);
		int ox = x, oy = "above".equals(SlashHud.config.dungeonCountersAt) ? y + over : y;
		// the simple map has no picture of its own: the module's background (or none) under its tiles
		if (!simple()) g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, viewId, ox, oy, 0, 0, W, H, W, H, W, H, 0xFFFFFFFF);
		drawOver(g, mc, ox, oy, W, H, viewX, viewZ, viewScale, SHOWN);
		switch (SlashHud.config.dungeonCountersAt) {
			case "above" -> drawCounters(g, mc, ox, y, counters());
			case "inside" -> drawCounters(g, mc, ox, oy + H - over, counters());
			// a module of their own (Loot), wherever the player put it
			case "apart" -> {}
			default -> drawCounters(g, mc, ox, oy + H, counters());
		}
	}

	/** What goes over the map's picture (w×h at ox, oy): room marks, loot, mobs, players and you. */
	static void drawOver(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy, int w, int h, float vx, float vz, float scale, java.util.function.BiPredicate<Integer, Integer> inside) {
		float keepX = viewX, keepZ = viewZ, keepScale = viewScale;
		var keepClip = clip;
		viewX = vx;
		viewZ = vz;
		viewScale = scale;
		clip = inside;
		try {
			drawOverView(g, mc, ox, oy, w, h);
		} finally {
			viewX = keepX;
			viewZ = keepZ;
			viewScale = keepScale;
			clip = keepClip;
		}
	}

	/** The module's own map's shape (the full map screen draws over its own). */
	private static final java.util.function.BiPredicate<Integer, Integer> SHOWN = DungeonMap::shown;
	private static java.util.function.BiPredicate<Integer, Integer> clip = SHOWN;

	private static void drawOverView(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy, int w, int h) {
		if (simple()) DungeonRooms.drawTiles(g, mc, ox, oy, w, h, viewX, viewZ, viewScale);
		else DungeonRooms.draw(g, mc, ox, oy, viewX, viewZ, viewScale, originX, originZ, clip);
		markers(g, mc, ox, oy);
		if (SlashHud.config.dungeonStartArrow) startMark(g, ox, oy);
		double[] at = smooth(mc);
		int sx = Math.round((float) (at[0] - originX - viewX) * viewScale), sz = Math.round((float) (at[1] - originZ - viewZ) * viewScale);
		if (clip.test(sx, sz)) {
			// the face, and a dot just past its edge the way they look
			double a = Math.toRadians(mc.player.getYRot());
			int lx = ox + sx + (int) Math.round(-Math.sin(a) * 7), lz = oy + sz + (int) Math.round(Math.cos(a) * 7);
			g.fill(lx - 1, lz - 1, lx + 1, lz + 1, 0xFFFDE047);
			face(g, mc.player, ox + sx, oy + sz, 0xFFFDE047);
		}
	}

	/**
	 * What is about in the dungeon: mobs as their head, NPCs (players with a skin, not on the tab
	 * list) with a red frame, and players with a blue one. Spawners (their holograms and the armour
	 * stands carrying them) are not drawn.
	 */
	private static void markers(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy) {
		HudConfig cfg = SlashHud.config;
		for (Entity e : mc.level.entitiesForRendering()) {
			if (e == mc.player || !e.isAlive()) continue;
			int sx = Math.round((float) (e.getX() - originX - viewX) * viewScale), sz = Math.round((float) (e.getZ() - originZ - viewZ) * viewScale);
			if (!clip.test(sx, sz)) continue;
			if (e instanceof ArmorStand) continue;
			int look = look(e);
			// SkyUp's spawners (a hologram over a floating spawner on an armour stand): nothing on the map
			if ((look & LOOK_SPAWNER) != 0) continue;
			if (e instanceof AbstractClientPlayer p && (look & LOOK_NPC) == 0) {
				if (cfg.dungeonPlayers) face(g, p, ox + sx, oy + sz, 0xFF60A5FA);
			} else if ((e instanceof Mob || e instanceof AbstractClientPlayer) && cfg.dungeonMobs && !e.isInvisible() && !simple()) {
				// (on the simple map mobs are heads on their room's tile)
				// a mob, or an NPC (a player with a skin who is not on the tab list): drawn as its class is set to be
				int kind = look >> 2, size = 8, frame = FRAMES[kind];
				mob(g, (net.minecraft.world.entity.LivingEntity) e, ox + sx, oy + sz, size, frame, mobStyle(kind));
			}
		}
		// mobs further off than the game is told about: where they were last seen (the simple map has them on its tiles)
		if (!cfg.dungeonMobs || simple()) return;
		for (DungeonRooms.Remembered m : DungeonRooms.outOfSight()) {
			if (!(m.mob() instanceof net.minecraft.world.entity.LivingEntity e)) continue;
			int sx = Math.round((float) (m.x() - viewX) * viewScale), sz = Math.round((float) (m.z() - viewZ) * viewScale);
			if (!clip.test(sx, sz)) continue;
			int kind = mobKind(e), size = 8;
			mob(g, e, ox + sx, oy + sz, size, FRAMES[kind], mobStyle(kind));
		}
	}

	/**
	 * What the map makes of each entity this tick (by id): a spawner's hologram, an NPC, and its class
	 * (bits 2 and up). Working it out reads names and looks for the name tags over it, which every
	 * frame for every entity cost frames; names change only with the server's packets, so once a
	 * tick is enough.
	 */
	private static final java.util.Map<Integer, Integer> looks = new java.util.HashMap<>();
	private static final int LOOK_SPAWNER = 1, LOOK_NPC = 2;

	private static int look(Entity e) {
		Integer known = looks.get(e.getId());
		if (known != null) return known;
		int look = 0;
		if (DungeonRooms.spawnerLabel(e)) look = LOOK_SPAWNER;
		else {
			boolean npc = e instanceof AbstractClientPlayer p && npc(p);
			if (npc) look = LOOK_NPC;
			if (e instanceof Mob || npc) look |= kind(e) << 2;
		}
		looks.put(e.getId(), look);
		return look;
	}

	/** How a mob class is drawn: "head", "dot" or "hidden" (0 other mobs, 1 normal, 2 elite, 3 mini boss, 4 minion). */
	private static String mobStyle(int kind) {
		HudConfig cfg = SlashHud.config;
		return switch (kind) {
			case 1 -> cfg.dungeonMobNormal;
			case 2 -> cfg.dungeonMobElite;
			case 3 -> cfg.dungeonMobBoss;
			case 4 -> cfg.dungeonMobMinion;
			default -> cfg.dungeonMobOther;
		};
	}

	public static final String[] MOB_STYLES = { "head", "dot", "hidden" };

	/** One mob on the map in its style, framed in its class's colour. */
	private static void mob(GuiGraphicsExtractor g, net.minecraft.world.entity.LivingEntity e, int x, int y, int size, int frame, String style) {
		switch (style) {
			case "hidden" -> {}
			case "dot" -> {
				int r = size >= 12 ? 3 : 2;
				g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, 0xFF000000);
				g.fill(x - r, y - r, x + r, y + r, frame | 0xFF000000);
			}
			default -> {
				// its face: a head it wears (servers dress mobs in player heads), an NPC's skin, its own face, else a dot
				ItemStack worn = e.getItemBySlot(EquipmentSlot.HEAD);
				if (e instanceof AbstractClientPlayer p) face(g, p, x, y, frame, size);
				else if (!worn.isEmpty() && worn.getItem() instanceof net.minecraft.world.item.BlockItem block && block.getBlock() instanceof net.minecraft.world.level.block.AbstractSkullBlock) {
					g.fill(x - size / 2 - 1, y - size / 2 - 1, x + size / 2 + 1, y + size / 2 + 1, frame);
					item(g, worn, x, y, size);
				} else if (!MobHeads.draw(g, e, x, y, size, frame)) g.fill(x - 1, y - 1, x + 2, y + 2, frame);
			}
		}
	}

	/** A mob on a room's tile of the simple map, as its class is set to be drawn, framed in its class's colour (a mini boss unframed: its room is red). */
	static void tileMob(GuiGraphicsExtractor g, net.minecraft.world.entity.LivingEntity e, int x, int y, int size) {
		int kind = mobKind(e);
		mob(g, e, x, y, size, kind == 3 ? 0 : FRAMES[kind], mobStyle(kind));
	}

	/** Whether a mob is drawn at all (its class not set to hidden, mobs on the map switched on). */
	static boolean mobShown(Entity e) {
		return SlashHud.config.dungeonMobs && !"hidden".equals(mobStyle(mobKind(e)));
	}

	/** A mob's class: as worked out when the map last looked at it (remembered ones), else now. */
	static int mobKind(Entity e) {
		int known = DungeonRooms.knownKind(e);
		return known >= 0 ? known : kind(e);
	}

	/** A face from the skin (with its hat layer) in a frame of the given colour, 8 pixels round the point. */
	private static void face(GuiGraphicsExtractor g, AbstractClientPlayer p, int x, int y, int frame) {
		face(g, p, x, y, frame, 8);
	}

	/** The same `size` pixels round the point (an NPC's face as big as the mobs' heads beside it). */
	private static void face(GuiGraphicsExtractor g, AbstractClientPlayer p, int x, int y, int frame, int size) {
		Identifier skin = Compat.skinTexture(p);
		int half = size / 2, inner = size - 2;
		g.fill(x - half, y - half, x - half + size, y - half + size, frame);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x - half + 1, y - half + 1, 8, 8, inner, inner, 8, 8, 64, 64, 0xFFFFFFFF);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x - half + 1, y - half + 1, 40, 8, inner, inner, 8, 8, 64, 64, 0xFFFFFFFF);
	}

	/** Frames of the mob classes: unknown, normal (&e), elite (&6), mini boss (&4), minion (&5). */
	private static final int[] FRAMES = { 0xFF7F1D1D, 0xFFFDE047, 0xFFF97316, 0xFFDC2626, 0xFFA855F7 };

	/**
	 * A dungeon mob's class from its name's colour (&e normal, &6 elite, &4 mini boss, &5 minion):
	 * 1, 2, 3, 4, or 0 for a mob with no such name.
	 */
	public static int kind(Entity mob) {
		// its own name; a mob with a player's model (an NPC), or one whose name tells no class, has its
		// name shown over it on another entity (as the Target module reads it)
		Component own = !npc(mob) && mob.hasCustomName() ? mob.getCustomName() : null;
		int kind = own == null ? 0 : kind(own);
		if (kind != 0) return kind;
		Component tag = tagOver(mob);
		return tag == null ? 0 : kind(tag);
	}

	/**
	 * A mob's name as the player sees it, colours left out: its own, else the one shown over it ("" for none).
	 * Only without a name of its own the one over it counts: in a crowd the boss's name hangs over its
	 * minions too, and they are not the boss.
	 */
	public static String namesOf(Entity mob) {
		String own = !npc(mob) && mob.hasCustomName() ? uncoloured(mob.getCustomName().getString()).strip() : "";
		if (!own.isEmpty()) return own;
		Component tag = tagOver(mob);
		return tag == null ? "" : uncoloured(tag.getString());
	}

	/** The name shown over a mob on another entity (a hologram, a riding name tag), or null. */
	private static Component tagOver(Entity mob) {
		return mob instanceof net.minecraft.world.entity.LivingEntity e ? dev.slash3rss.slashclient.hud.modules.MoreModules.Target.tagAbove(e) : null;
	}

	/**
	 * A server's mob with a player's model (an NPC): as the Target module tells them (not on the tab
	 * list, or with an NPC's id), or by its name, which has a level and health in it ("20.0 ❤ |
	 * Giermek poz. 1") where a player's has neither.
	 */
	static boolean npc(Entity e) {
		if (!(e instanceof AbstractClientPlayer p) || e == Minecraft.getInstance().player) return false;
		if (dev.slash3rss.slashclient.hud.modules.MoreModules.Target.npc(p)) return true;
		Component tag = dev.slash3rss.slashclient.hud.modules.MoreModules.Target.tagAbove(p);
		return mobName(p.getDisplayName().getString()) || tag != null && mobName(tag.getString());
	}

	private static final Pattern MOB_NAME = Pattern.compile("❤|\\bpoz\\.\\s*\\d+", Pattern.CASE_INSENSITIVE);

	/** A dungeon mob's name: its health ("❤") or level ("poz. 1") in it. */
	public static boolean mobName(String name) {
		return MOB_NAME.matcher(uncoloured(name)).find();
	}

	/**
	 * How strong a mob is, for which show on its room's tile: its class (mini boss, elite, normal,
	 * minion, then the rest), then its level ("poz. 6" in its name, or the one shown over it).
	 */
	static int rank(Entity mob) {
		int kind = kind(mob);
		int tier = switch (kind) {
			case 3 -> 4;
			case 2 -> 3;
			case 1 -> 2;
			case 4 -> 1;
			default -> 0;
		};
		// the level in its own name, else in the one shown over it
		int level = !npc(mob) && mob.hasCustomName() ? level(mob.getCustomName()) : -1;
		if (level < 0) level = level(tagOver(mob));
		return tier * 10_000 + Math.max(0, level);
	}

	/** The level in a name ("poz. 6"), colour codes left out; -1 for none. */
	private static int level(Component name) {
		if (name == null) return -1;
		Matcher m = LEVEL_IN_NAME.matcher(uncoloured(name.getString()));
		return m.find() ? Math.min(9_999, Integer.parseInt(m.group(1))) : -1;
	}

	/** Debug: a name with each piece's colour ("Dezerter{#FFAA00}"), as the server sent it. */
	private static String styled(Component name) {
		if (name == null) return "-";
		StringBuilder out = new StringBuilder();
		name.visit((style, text) -> {
			out.append(text);
			if (style.getColor() != null) out.append("{#").append(String.format("%06X", style.getColor().getValue())).append('}');
			return java.util.Optional.empty();
		}, net.minecraft.network.chat.Style.EMPTY);
		return out.toString();
	}

	/** Debug: the mobs about, with their names as sent and the class and level worked out from them. */
	private static String mobsAbout(Minecraft mc) {
		StringBuilder out = new StringBuilder("mobs within 48 blocks (id type x y z | own name | shown name | name over it | class, rank):\n");
		for (Entity e : mc.level.entitiesForRendering()) {
			if (!(e instanceof Mob) && !(e instanceof AbstractClientPlayer) || e == mc.player || e.distanceTo(mc.player) > 48) continue;
			out.append(e.getId()).append(' ').append(net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).getPath())
				.append(' ').append(e.getBlockX()).append(' ').append(e.getBlockY()).append(' ').append(e.getBlockZ())
				.append(" | ").append(styled(e.getCustomName())).append(" | ").append(styled(e.getDisplayName())).append(" | ").append(styled(tagOver(e)))
				.append(" | ").append(kind(e)).append(", ").append(rank(e)).append(npc(e) ? " npc" : "").append('\n');
		}
		return out.toString();
	}

	private static final Pattern LEVEL_IN_NAME = Pattern.compile("poz\\.?\\s*(\\d{1,6})", Pattern.CASE_INSENSITIVE);

	/** A name's class by its colour (see kind(Entity)). */
	private static int kind(Component name) {
		// the colour of the name itself: the first piece with letters in it, so the health before it
		// ("20.0 ❤" in &c), the heart, "|" and such do not count; colour codes written in the text count too
		int[] found = { -1 };
		name.visit((style, text) -> {
			int color = style.getColor() != null ? style.getColor().getValue() : -1;
			for (int i = 0; i < text.length(); i++) {
				char c = text.charAt(i);
				if (c == '§' && i + 1 < text.length()) {
					int legacy = legacyColor(Character.toLowerCase(text.charAt(++i)));
					if (legacy != -2) color = legacy;
					continue;
				}
				if (Character.isLetter(c)) {
					found[0] = color;
					return java.util.Optional.of(Boolean.TRUE);
				}
			}
			return java.util.Optional.empty();
		}, net.minecraft.network.chat.Style.EMPTY);
		return switch (found[0]) {
			case 0xFFFF55 -> 1;
			case 0xFFAA00 -> 2;
			case 0xAA0000 -> 3;
			case 0xAA00AA -> 4;
			default -> 0;
		};
	}

	/** A colour code's colour (§e → yellow…), -1 for a reset, -2 for a style code (bold…) that keeps the colour. */
	private static int legacyColor(char code) {
		int i = "0123456789abcdef".indexOf(code);
		if (i >= 0) return LEGACY[i];
		return code == 'r' ? -1 : -2;
	}

	private static final int[] LEGACY = { 0x000000, 0x0000AA, 0x00AA00, 0x00AAAA, 0xAA0000, 0xAA00AA, 0xFFAA00, 0xAAAAAA,
		0x555555, 0x5555FF, 0x55FF55, 0x55FFFF, 0xFF5555, 0xFF55FF, 0xFFFF55, 0xFFFFFF };

	/** An item `size` pixels large, centred on the point. */
	static void item(GuiGraphicsExtractor g, ItemStack stack, int x, int y, int size) {
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x - size / 2f, y - size / 2f);
		pose.scale(size / 16f, size / 16f);
		g.item(stack, 0, 0);
		pose.popMatrix();
	}

	/** A point of the picture inside its shape. */
	private static boolean shown(int px, int pz) {
		if (px < 1 || pz < 1 || px >= W - 1 || pz >= H - 1) return false;
		if (!round()) return true;
		float dx = px - W / 2f, dz = pz - H / 2f;
		return dx * dx + dz * dz <= (W / 2f - 1) * (W / 2f - 1);
	}

	/** The width of the counters in one row. */
	private static int rowWidth(Minecraft mc, java.util.List<int[]> counters) {
		int w = 0;
		for (int[] c : counters) w += counterWidth(mc, c) + 6;
		return Math.max(0, w - 2);
	}

	/**
	 * The loot counters as a module of their own, put anywhere in the HUD editor (with the map's
	 * counters set to "apart"): one row, shown only in a dungeon with loot in the room.
	 */
	public static final class Loot implements HudModule {
		/** Made-up counters for the editor: two chests of three taken, no barrel of two yet. */
		private static final java.util.List<int[]> SAMPLE = java.util.List.of(new int[] { 0, 2, 3 }, new int[] { 1, 0, 2 });

		@Override
		public String id() {
			return "dungeonloot";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return "apart".equals(SlashHud.config.dungeonCountersAt) && !counters().isEmpty();
		}

		private static java.util.List<int[]> shown() {
			java.util.List<int[]> c = counters();
			return c.isEmpty() ? SAMPLE : c;
		}

		@Override
		public int width(Minecraft mc) {
			return rowWidth(mc, shown()) + 4;
		}

		@Override
		public int height(Minecraft mc) {
			return ROW + 2;
		}

		@Override
		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawCounters(g, mc, x, y, shown(), Integer.MAX_VALUE);
		}
	}

	/** The counters under the map: each kind of loot shown and found, its icon and taken of all. */
	private static java.util.List<int[]> counters() {
		java.util.List<int[]> out = new java.util.ArrayList<>();
		if (!SlashHud.config.dungeonCounters || !active) return out;
		for (int cat = 0; cat < DungeonRooms.LOOT.length; cat++) {
			if (!DungeonRooms.shown(cat)) continue;
			int[] n = DungeonRooms.count(cat);
			if (n[1] > 0) out.add(new int[] { cat, n[0], n[1] });
		}
		return out;
	}

	private static final int ROW = 11;

	/** The counters' height: what they add to the module's (`all`: also when they lie on the map). */
	private static int countersHeight(Minecraft mc, boolean all) {
		if (!all && "inside".equals(SlashHud.config.dungeonCountersAt) || "apart".equals(SlashHud.config.dungeonCountersAt)) return 0;
		java.util.List<int[]> counters = counters();
		return counters.isEmpty() ? 0 : counterRows(mc, counters) * ROW + 2;
	}

	/** How many rows the counters take, laid out left to right and wrapped at the map's width. */
	private static int counterRows(Minecraft mc, java.util.List<int[]> counters) {
		return counterRows(mc, counters, W);
	}

	private static int counterRows(Minecraft mc, java.util.List<int[]> counters, int wrap) {
		int rows = counters.isEmpty() ? 0 : 1, at = 0;
		for (int[] c : counters) {
			int w = counterWidth(mc, c);
			if (at > 0 && at + w > wrap) {
				rows++;
				at = 0;
			}
			at += w + 6;
		}
		return rows;
	}

	private static int counterWidth(Minecraft mc, int[] c) {
		return 10 + mc.font.width(c[1] + "/" + c[2]);
	}

	private static void drawCounters(GuiGraphicsExtractor g, Minecraft mc, int x, int y, java.util.List<int[]> counters) {
		drawCounters(g, mc, x, y, counters, W);
	}

	private static void drawCounters(GuiGraphicsExtractor g, Minecraft mc, int x, int y, java.util.List<int[]> counters, int wrap) {
		int at = 0, row = 0;
		for (int[] c : counters) {
			int w = counterWidth(mc, c);
			if (at > 0 && at + w > wrap) {
				row++;
				at = 0;
			}
			int cx = x + 2 + at, cy = y + 2 + row * ROW;
			ItemStack icon = Ui.stack(DungeonRooms.LOOT_ICONS[c[0]]);
			if (icon != null) item(g, icon, cx + 4, cy + 4, 8);
			// all of a kind taken: green
			Modules.text(g, mc, c[1] + "/" + c[2], cx + 10, cy, c[1] == c[2] ? 0xFF86EFAC : Modules.textColor());
			at += w + 6;
		}
	}

	/**
	 * The way back to the start room: a green mark on it while it is in sight, else (the module's map
	 * following the player, zoomed in) a green arrow on the map's edge pointing to it.
	 */
	private static void startMark(GuiGraphicsExtractor g, int ox, int oy) {
		int[] start = DungeonRooms.start();
		if (start == null) return;
		float sx = (start[0] + 0.5f - viewX) * viewScale, sz = (start[1] + 0.5f - viewZ) * viewScale;
		if (clip.test(Math.round(sx), Math.round(sz))) {
			// the simple map shows the start room as its own tile, with a campfire
			if (simple()) return;
			int x = ox + Math.round(sx), y = oy + Math.round(sz);
			g.fill(x - 3, y - 3, x + 4, y + 4, 0xFF000000);
			g.fill(x - 2, y - 2, x + 3, y + 3, 0xFF4ADE80);
			return;
		}
		// only the module's own map has an edge to point from (the full map shows all)
		if (clip != SHOWN) return;
		float cx = W / 2f, cz = H / 2f, dx = sx - cx, dz = sz - cz;
		double len = Math.sqrt(dx * dx + dz * dz);
		if (len < 1) return;
		// as far out as the map goes, a few pixels in from its edge (a round map: its circle)
		double reach = round() ? Math.min(W, H) / 2.0 - 6
			: Math.min((W / 2.0 - 6) / Math.max(1e-6, Math.abs(dx)), (H / 2.0 - 6) / Math.max(1e-6, Math.abs(dz))) * len;
		double ux = dx / len, uz = dz / len;
		double tipX = ox + cx + ux * reach, tipZ = oy + cz + uz * reach;
		// a small filled triangle: its tip on the edge, its back 6 pixels in
		for (int back = 0; back <= 6; back++) {
			double half = back * 0.6;
			for (double side = -half; side <= half; side += 0.5) {
				int px = (int) Math.round(tipX - ux * back - uz * side), pz = (int) Math.round(tipZ - uz * back + ux * side);
				g.fill(px, pz, px + 1, pz + 1, back == 0 || Math.abs(side) > half - 0.6 || back == 6 ? 0xFF000000 : 0xFF4ADE80);
			}
		}
	}

	/** The player: a white dot with a short line the way they look. */
	private static void arrow(GuiGraphicsExtractor g, int x, int y, float yaw) {
		double a = Math.toRadians(yaw);
		// yaw 0 looks south (+z), 90 west (-x)
		double dx = -Math.sin(a), dz = Math.cos(a);
		for (int i = 1; i <= 4; i++) {
			int lx = x + (int) Math.round(dx * i), lz = y + (int) Math.round(dz * i);
			g.fill(lx, lz, lx + 1, lz + 1, 0xFFFDE047);
		}
		g.fill(x - 1, y - 1, x + 2, y + 2, 0xFFFFFFFF);
	}

	/** In the editor: a made-up dungeon of a few rooms, so the module can be placed. */
	@Override
	public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		if (visible(mc)) {
			draw(g, mc, x, y);
			return;
		}
		int top = y;
		if (simple()) {
			// tiles in a grid: the start room, the one you are in, one with mobs, the rest; doors between them
			int[][] tiles = { { 0, 0, 0xFF8B95A5 }, { 1, 0, 0xFF2E3440 }, { 2, 0, 0xFF8B95A5 }, { 0, 1, 0xFF8B95A5 }, { 1, 1, 0xFF8B95A5 }, { 2, 1, 0xFF5B6475 }, { 1, 2, 0xFF0EA30E } };
			for (int[] t : tiles) {
				int tx = x + 8 + t[0] * 36, ty = top + 6 + t[1] * 36;
				g.fill(tx, ty, tx + 32, ty + 32, 0xFF000000 | (t[2] & 0xFEFEFE) >> 1);
				g.fill(tx + 1, ty + 1, tx + 31, ty + 31, t[2]);
			}
			int[][] doors = { { 42, 22 }, { 78, 22 }, { 24, 40 }, { 60, 40 }, { 96, 40 }, { 42, 58 }, { 78, 58 }, { 60, 76 } };
			for (int[] d : doors) g.fill(x + d[0] - 2, top + d[1] - 2, x + d[0] + 2, top + d[1] + 2, 0xFFFDE047);
			item(g, new ItemStack(Items.CAMPFIRE), x + 60, top + 94, 16);
			return;
		}
		int[][] rooms ={ { 10, 10, 30, 26 }, { 46, 10, 30, 26 }, { 82, 14, 28, 22 }, { 10, 48, 30, 30 }, { 46, 48, 30, 30 }, { 82, 52, 28, 26 }, { 46, 88, 30, 24 } };
		for (int[] r : rooms) g.fill(x + r[0], top + r[1], x + r[0] + r[2], top + r[1] + r[3], 0xFF5B6475);
		// the start room and the corridors between the rooms
		g.fill(x + 50, top + 92, x + 72, top + 108, 0xFF4ADE80);
		g.fill(x + 40, top + 20, x + 46, top + 24, 0xFF5B6475);
		g.fill(x + 76, top + 22, x + 82, top + 26, 0xFF5B6475);
		g.fill(x + 24, top + 36, x + 28, top + 48, 0xFF5B6475);
		g.fill(x + 60, top + 36, x + 64, top + 48, 0xFF5B6475);
		g.fill(x + 60, top + 78, x + 64, top + 88, 0xFF5B6475);
		arrow(g, x + 61, top + 98, 180);
	}

	/**
	 * The debug (the grid and signs on the full map, D saving a file) is for the mod's makers: players do not see
	 * it, only a game started from the sources or with -Dslashclient.debug=true in the profile's Java arguments.
	 */
	public static final boolean DEBUG_ALLOWED = net.fabricmc.loader.api.FabricLoader.getInstance().isDevelopmentEnvironment()
		|| Boolean.getBoolean("slashclient.debug");

	public static boolean debug() {
		return DEBUG_ALLOWED && SlashHud.config.dungeonDebug;
	}

	/** Debug: what the map knows saved to a file (DungeonRooms.dump); null when there is nothing yet. */
	public static java.nio.file.Path dumpDebug(Minecraft mc) throws java.io.IOException {
		if (!active || minX > maxX) return null;
		// where the player is, and what lies at the map's heights around them (is the map above there?)
		StringBuilder near = new StringBuilder("player ").append(mc.player.getBlockX()).append(' ').append(mc.player.getBlockY()).append(' ').append(mc.player.getBlockZ())
			.append(", ground y ").append(groundY).append(grounded ? "" : " (not sure)").append("\nblocks at y 30-45 within 24 blocks, terracotta, concrete and wool (first 40):\n");
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		java.util.Map<String, Integer> kinds = new java.util.TreeMap<>();
		int listed = 0;
		for (int y = 30; y <= 45; y++) {
			for (int x = mc.player.getBlockX() - 24; x <= mc.player.getBlockX() + 24; x++) {
				for (int z = mc.player.getBlockZ() - 24; z <= mc.player.getBlockZ() + 24; z++) {
					BlockState state = mc.level.getBlockState(pos.set(x, y, z));
					if (state.isAir()) continue;
					String id = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath();
					kinds.merge(y + " " + id, 1, Integer::sum);
					if (listed < 40 && (id.contains("terracotta") || id.contains("concrete") || id.contains("wool"))) {
						near.append(x).append(' ').append(y).append(' ').append(z).append(' ').append(id).append('\n');
						listed++;
					}
				}
			}
		}
		near.append(mobsAbout(mc));
		near.append("counts by height and block:\n");
		for (var e : kinds.entrySet()) near.append(e.getKey()).append(": ").append(e.getValue()).append('\n');
		return DungeonRooms.dump(mc, cell, plan, minX, minZ, maxX, maxZ, dungeonLevel, near.toString());
	}

	/** For the test: walk into a dungeon without the server's chat line. */
	static void startForTest() {
		start();
	}

	/** For the test: in a dungeon (as when the server's line just came: it lasts 20 s with no boss bar), or out. */
	public static void inDungeonForTest(boolean in) {
		if (!in) {
			stop();
			return;
		}
		start();
		hintedAt = System.currentTimeMillis();
	}

	/** For the test: what the map knows of a column (0 nothing, 1 wall, 2 floor). */
	public static int cellAt(int x, int z) {
		int ix = x - originX, iz = z - originZ;
		return ix < 0 || iz < 0 || ix >= SIZE || iz >= SIZE ? 0 : cell[iz * SIZE + ix];
	}

	/** For the test: how much of the map is known (columns seen). */
	public static int known() {
		if (image == null || minX > maxX) return 0;
		int n = 0;
		for (int z = minZ; z <= maxZ; z++) for (int x = minX; x <= maxX; x++) if (image.getPixel(x, z) != UNKNOWN) n++;
		return n;
	}
}
