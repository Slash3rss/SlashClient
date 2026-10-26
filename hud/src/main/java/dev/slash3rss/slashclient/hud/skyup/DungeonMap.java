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
import dev.slash3rss.slashclient.hud.HudModule;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.Modules;
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
	 * a mined ore shows at once; further out, as far as the setting says (MIN_RANGE–MAX_RANGE: the map
	 * fills in as far as the game has the dungeon loaded), a few hundred columns each tick.
	 */
	private static final int NEAR = 36, NEAR_TICKS = 10;
	public static final int MIN_RANGE = 32, MAX_RANGE = 128;
	private static final int FAR_COLUMNS_PER_TICK = 320;
	private static final int UNKNOWN = 0, WALL = 0xFF0E131C;
	private static final Pattern LEVEL = Pattern.compile("Dungeon\\s+poz\\.?\\s*(\\d+)", Pattern.CASE_INSENSITIVE);

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
	private static final int PLAN_LOW = 35, PLAN_HIGH = 41, PLAN_RADIUS = 96;
	/** The map above is read over this many ticks, a slice each, so no tick takes long. */
	private static final int PLAN_TICKS = 20;
	private static int planRow;
	/** The dungeon's ground (y), and how far its rooms reach below and above it. */
	private static int groundY;
	private static boolean grounded;
	private static final int BELOW = 21, ABOVE = 14;
	/** Which slice of rows each ring reads next. */
	private static int scanRow, farRow;
	private static int tick;
	private static String dungeonLevel = "";
	/** The boss bar's fill: progress to the next level (0–1), or -1 when not known. */
	private static float dungeonProgress = -1;
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
	public static net.minecraft.client.KeyMapping zoomInKey, zoomOutKey, fullKey;

	public String id() {
		return "dungeonmap";
	}

	// ---------- in and out of a dungeon ----------

	/** The server's lines: the hint on entering starts a map, leaving ends it. */
	public static void onChat(String line) {
		String plain = line.replaceAll("§.", "").trim();
		if (!plain.startsWith("Dungeon")) return;
		String rest = plain.replaceFirst("^Dungeon\\s*(»|>>)\\s*", "");
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
	}

	public static void stop() {
		active = false;
		dungeonProgress = -1;
		level = null;
		dungeonLevel = "";
		hintedAt = 0;
	}

	/** True while there is a dungeon to show. */
	public static boolean active() {
		return active;
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
		return "circle".equals(cfg.dungeonShape) || cfg.dungeonFollow || cfg.dungeonZoom > 1.001f;
	}

	public static void tick(Minecraft mc) {
		tickAt = System.nanoTime();
		if (mc.level == null || mc.player == null) {
			if (active) stop();
			return;
		}
		if (++tick % 10 == 0) {
			bossBar = readLevel(mc);
			// the boss bar: in a dungeon (a map starts, or goes on); gone: out, unless the hint just came
			if (bossBar && !active) start();
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
		}
		render(mc);
	}

	/** = and - zoom the map in and out, a quarter at a time. */
	private static void zoomKeys() {
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
		boolean circle = "circle".equals(cfg.dungeonShape);
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
		paint(view, W, H, viewX, viewZ, viewScale, circle);
		viewTexture.upload();
	}

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
						if (c == 2) color = DungeonRooms.tint(ix, iz, cfg.dungeonBlockColors ? color : plain(color));
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
	 * The map above the dungeon (terracotta at y 37–39): what each column has there, the first
	 * terracotta from the top. It lies one to one over the rooms, so it tells their walls before
	 * they are seen.
	 */
	private static void scanPlan(Minecraft mc) {
		ClientLevel world = mc.level;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int cx = mc.player.getBlockX(), cz = mc.player.getBlockZ();
		int rows = (PLAN_RADIUS * 2 + 1 + PLAN_TICKS - 1) / PLAN_TICKS;
		int from = cx - PLAN_RADIUS + planRow * rows;
		planRow = (planRow + 1) % PLAN_TICKS;
		for (int x = from; x < from + rows && x <= cx + PLAN_RADIUS; x++) {
			for (int z = cz - PLAN_RADIUS; z <= cz + PLAN_RADIUS; z++) {
				int ix = x - originX, iz = z - originZ;
				if (ix < 0 || iz < 0 || ix >= SIZE || iz >= SIZE || !world.hasChunk(x >> 4, z >> 4)) continue;
				byte kind = 0;
				for (int y = PLAN_HIGH; y >= PLAN_LOW && kind == 0; y--) kind = planKind(world.getBlockState(pos.set(x, y, z)));
				if (kind == 0) continue;
				plan[iz * SIZE + ix] = kind;
				minX = Math.min(minX, ix);
				minZ = Math.min(minZ, iz);
				maxX = Math.max(maxX, ix);
				maxZ = Math.max(maxZ, iz);
			}
		}
	}

	/** Black terracotta a wall, yellow (or orange) a way, green the start room's mark, any other terracotta inside a room. */
	private static byte planKind(BlockState state) {
		if (state.isAir()) return 0;
		String id = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath();
		if (!id.contains("terracotta")) return 0;
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

	/** "Dungeon poz. 2" on the boss bar: whether it is there, and the dungeon's level for the map's title. */
	private static boolean readLevel(Minecraft mc) {
		var overlay = Compat.bossOverlay(mc);
		if (overlay == null) return false;
		for (var event : ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values()) {
			Matcher m = LEVEL.matcher(event.getName().getString());
			if (m.find()) {
				dungeonLevel = m.group(1);
				dungeonProgress = event.getProgress();
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
		int at = SlashHud.config.dungeonFixedY ? SlashHud.config.dungeonY : Integer.MIN_VALUE;
		if (at != readAt) {
			readAt = at;
			clear();
		}
		int cx = mc.player.getBlockX(), py = mc.player.getBlockY(), cz = mc.player.getBlockZ();
		// loot is counted in all of a room: from 21 blocks below the start room's floor to 14 above it
		int low = groundY - BELOW, high = groundY + ABOVE;
		int near = at == Integer.MIN_VALUE ? py : at;
		// close by: a slice of the rows each tick, all of them every NEAR_TICKS ticks
		int nearRows = (NEAR * 2 + 1 + NEAR_TICKS - 1) / NEAR_TICKS;
		int nearFrom = cx - NEAR + scanRow * nearRows;
		scanRow = (scanRow + 1) % NEAR_TICKS;
		for (int x = nearFrom; x < nearFrom + nearRows && x <= cx + NEAR; x++) {
			for (int z = cz - NEAR; z <= cz + NEAR; z++) column(world, pos, x, z, low, high, near);
		}
		// further out: what the near ring does not cover, from the player's own slice outwards (middle,
		// one left, one right…) so the nearest part shows first; 96 blocks take about five seconds
		int radius = Math.max(MIN_RANGE, Math.min(MAX_RANGE, SlashHud.config.dungeonScanRange));
		if (radius <= NEAR) return;
		int side = radius * 2 + 1;
		int ticks = Math.max(1, (side * side - (NEAR * 2 + 1) * (NEAR * 2 + 1) + FAR_COLUMNS_PER_TICK - 1) / FAR_COLUMNS_PER_TICK);
		int rows = (side + ticks - 1) / ticks;
		if (farRow >= ticks) farRow = 0;
		int middle = ticks / 2;
		int slice = farRow % 2 == 0 ? middle + farRow / 2 : middle - (farRow + 1) / 2;
		int from = cx - radius + Math.floorMod(slice, ticks) * rows;
		farRow = (farRow + 1) % ticks;
		for (int x = from; x < from + rows && x <= cx + radius; x++) {
			boolean nearX = Math.abs(x - cx) <= NEAR;
			for (int z = cz - radius; z <= cz + radius; z++) {
				if (nearX && Math.abs(z - cz) <= NEAR) continue;
				column(world, pos, x, z, low, high, near);
			}
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
				color = floorColor(world.getBlockState(pos.set(x, y - 1, z)).getMapColor(world, pos).col);
				break;
			}
		}
		// columns of nothing at all (outside the dungeon, open sky below) stay unknown
		if (color == WALL && !anySolid(world, pos, x, near, z)) return;
		if (image.getPixel(ix, iz) != color) {
			image.setPixel(ix, iz, color);
		}
		cell[iz * SIZE + ix] = (byte) (color == WALL ? 1 : 2);
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

	/** The map's size on screen (set in its settings), and its title line. */
	private static int W = 120, H = 120;
	private static final int TITLE = 11;

	/** The size from the settings; the picture is made anew when it changes. */
	private static void resize() {
		int size = Math.max(80, Math.min(240, SlashHud.config.dungeonSize));
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
		java.util.List<int[]> counters = counters();
		return H + title() + (counters.isEmpty() ? 0 : counterRows(mc, counters) * ROW + 2);
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		if (!visible(mc)) return;
		// following the player: the picture made again for this frame, where they are now
		if (viewTexture == null || following()) render(mc);
		if (SlashHud.config.dungeonTitle) title(g, mc, x, y);
		progress(g, x, y + (SlashHud.config.dungeonTitle ? TITLE : 0));
		int ox = x, oy = y + title();
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, viewId, ox, oy, 0, 0, W, H, W, H, W, H, 0xFFFFFFFF);
		drawCounters(g, mc, ox, oy + H, counters());
		drawOver(g, mc, ox, oy, viewX, viewZ, viewScale, SHOWN);
	}

	/** What goes over the map's picture: room marks, loot, mobs, players and you. */
	static void drawOver(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy, float vx, float vz, float scale, java.util.function.BiPredicate<Integer, Integer> inside) {
		float keepX = viewX, keepZ = viewZ, keepScale = viewScale;
		var keepClip = clip;
		viewX = vx;
		viewZ = vz;
		viewScale = scale;
		clip = inside;
		try {
			drawOverView(g, mc, ox, oy);
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

	private static void drawOverView(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy) {
		DungeonRooms.draw(g, mc, ox, oy, viewX, viewZ, viewScale, originX, originZ, clip);
		markers(g, mc, ox, oy);
		if (SlashHud.config.dungeonStartArrow) startMark(g, ox, oy);
		double[] at = smooth(mc);
		int sx = Math.round((float) (at[0] - originX - viewX) * viewScale), sz = Math.round((float) (at[1] - originZ - viewZ) * viewScale);
		if (clip.test(sx, sz)) {
			if (SlashHud.config.dungeonSelfHead) {
				// the face, and a dot just past its edge the way they look
				double a = Math.toRadians(mc.player.getYRot());
				int lx = ox + sx + (int) Math.round(-Math.sin(a) * 7), lz = oy + sz + (int) Math.round(Math.cos(a) * 7);
				g.fill(lx - 1, lz - 1, lx + 1, lz + 1, 0xFFFDE047);
				face(g, mc.player, ox + sx, oy + sz, 0xFFFDE047);
			} else arrow(g, ox + sx, oy + sz, mc.player.getYRot());
		}
	}

	/**
	 * What is about in the dungeon: mobs as their head, NPCs (players with a skin, not on the tab
	 * list) with a red frame, and players with a blue one. Spawners (their holograms and the armour
	 * stands carrying them) are not drawn.
	 */
	private static void markers(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy) {
		HudConfig cfg = SlashHud.config;
		var connection = mc.getConnection();
		for (Entity e : mc.level.entitiesForRendering()) {
			if (e == mc.player || !e.isAlive()) continue;
			int sx = Math.round((float) (e.getX() - originX - viewX) * viewScale), sz = Math.round((float) (e.getZ() - originZ - viewZ) * viewScale);
			if (!clip.test(sx, sz)) continue;
			// SkyUp's spawners (a hologram over a floating spawner on an armour stand): nothing on the map
			if (DungeonRooms.spawnerLabel(e) || e instanceof ArmorStand) continue;
			if (e instanceof AbstractClientPlayer p && connection != null && connection.getPlayerInfo(p.getUUID()) != null) {
				if (cfg.dungeonPlayers) face(g, p, ox + sx, oy + sz, 0xFF60A5FA);
			} else if ((e instanceof Mob || e instanceof AbstractClientPlayer) && cfg.dungeonMobs && !e.isInvisible()) {
				// a mob, or an NPC (a player with a skin who is not on the tab list): drawn as its class is set to be
				int kind = kind(e), size = kind == 3 ? 12 : 8, frame = FRAMES[kind];
				mob(g, (net.minecraft.world.entity.LivingEntity) e, ox + sx, oy + sz, size, frame, mobStyle(kind));
			}
		}
	}

	/** How a mob class is drawn: "head", "dot", "skull" or "hidden" (0 other mobs, 1 normal, 2 elite, 3 mini boss, 4 minion). */
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

	public static final String[] MOB_STYLES = { "head", "dot", "skull", "hidden" };

	/** One mob on the map in its style, framed in its class's colour. */
	private static void mob(GuiGraphicsExtractor g, net.minecraft.world.entity.LivingEntity e, int x, int y, int size, int frame, String style) {
		switch (style) {
			case "hidden" -> {}
			case "dot" -> {
				int r = size >= 12 ? 3 : 2;
				g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, 0xFF000000);
				g.fill(x - r, y - r, x + r, y + r, frame | 0xFF000000);
			}
			case "skull" -> {
				g.fill(x - size / 2 - 1, y - size / 2 - 1, x + size / 2 + 1, y + size / 2 + 1, frame);
				item(g, new ItemStack(size >= 12 ? Items.WITHER_SKELETON_SKULL : Items.SKELETON_SKULL), x, y, size);
			}
			default -> {
				// its face: a head it wears (servers dress mobs in player heads), an NPC's skin, its own face, else a dot
				ItemStack worn = e.getItemBySlot(EquipmentSlot.HEAD);
				if (e instanceof AbstractClientPlayer p) face(g, p, x, y, frame);
				else if (!worn.isEmpty() && worn.getItem() instanceof net.minecraft.world.item.BlockItem block && block.getBlock() instanceof net.minecraft.world.level.block.AbstractSkullBlock) {
					g.fill(x - size / 2 - 1, y - size / 2 - 1, x + size / 2 + 1, y + size / 2 + 1, frame);
					item(g, worn, x, y, size);
				} else if (!MobHeads.draw(g, e, x, y, size, frame)) g.fill(x - 1, y - 1, x + 2, y + 2, frame);
			}
		}
	}

	/** A face from the skin (with its hat layer) in a frame of the given colour, 8 pixels round the point. */
	private static void face(GuiGraphicsExtractor g, AbstractClientPlayer p, int x, int y, int frame) {
		Identifier skin = Compat.skinTexture(p);
		g.fill(x - 4, y - 4, x + 4, y + 4, frame);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x - 3, y - 3, 8, 8, 6, 6, 8, 8, 64, 64, 0xFFFFFFFF);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x - 3, y - 3, 40, 8, 6, 6, 8, 8, 64, 64, 0xFFFFFFFF);
	}

	/** Frames of the mob classes: unknown, normal (&e), elite (&6), mini boss (&4), minion (&5). */
	private static final int[] FRAMES = { 0xFF7F1D1D, 0xFFFDE047, 0xFFF97316, 0xFFDC2626, 0xFFA855F7 };

	/**
	 * A dungeon mob's class from its name's colour (&e normal, &6 elite, &4 mini boss, &5 minion):
	 * 1, 2, 3, 4, or 0 for a mob with no such name.
	 */
	public static int kind(Entity mob) {
		if (!mob.hasCustomName()) return 0;
		// the colour of the name itself: the first piece with letters in it, so the health before it
		// ("20.0 ❤" in &c), the heart, "|" and such do not count; colour codes written in the text count too
		int[] found = { -1 };
		mob.getCustomName().visit((style, text) -> {
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
		if (!"circle".equals(SlashHud.config.dungeonShape)) return true;
		float dx = px - W / 2f, dz = pz - H / 2f;
		return dx * dx + dz * dz <= (W / 2f - 1) * (W / 2f - 1);
	}

	/** The title line's height, or 0 when it is hidden. */
	private static int title() {
		return (SlashHud.config.dungeonTitle ? TITLE : 0) + (SlashHud.config.dungeonProgress ? 4 : 0);
	}

	/** The boss bar's progress to the next level as a thin bar across the map, the share on it in the title. */
	private static void progress(GuiGraphicsExtractor g, int x, int y) {
		if (!SlashHud.config.dungeonProgress) return;
		g.fill(x + 1, y, x + W - 1, y + 3, 0xFF111827);
		if (dungeonProgress >= 0) g.fill(x + 1, y, x + 1 + Math.round((W - 2) * Math.min(1f, dungeonProgress)), y + 3, 0xFFA855F7);
	}

	private static void title(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		String share = SlashHud.config.dungeonProgress && dungeonProgress >= 0 ? Math.round(dungeonProgress * 100) + "%" : "";
		int room = W - 6 - (share.isEmpty() ? 0 : mc.font.width(share) + 6);
		// the title shorter when it would run into the share: "Dungeon · poziom 100", "Dungeon 100", "poz. 100"
		String text = dungeonLevel.isEmpty() ? Component.translatable("slashclient-hud.dungeon").getString()
			: Component.translatable("slashclient-hud.dungeon.level", dungeonLevel).getString();
		if (!dungeonLevel.isEmpty() && mc.font.width(text) > room) text = Component.translatable("slashclient-hud.dungeon").getString() + " " + dungeonLevel;
		if (!dungeonLevel.isEmpty() && mc.font.width(text) > room) text = "poz. " + dungeonLevel;
		Modules.text(g, mc, text, x + 3, y + 2, 0xFFFFFFFF);
		if (!share.isEmpty()) Modules.text(g, mc, share, x + W - 3 - mc.font.width(share), y + 2, 0xFFD8B4FE);
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

	/** How many rows the counters take, laid out left to right and wrapped at the map's width. */
	private static int counterRows(Minecraft mc, java.util.List<int[]> counters) {
		int rows = counters.isEmpty() ? 0 : 1, at = 0;
		for (int[] c : counters) {
			int w = counterWidth(mc, c);
			if (at > 0 && at + w > W) {
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
		int at = 0, row = 0;
		for (int[] c : counters) {
			int w = counterWidth(mc, c);
			if (at > 0 && at + w > W) {
				row++;
				at = 0;
			}
			int cx = x + 2 + at, cy = y + 2 + row * ROW;
			ItemStack icon = Ui.stack(DungeonRooms.LOOT_ICONS[c[0]]);
			if (icon != null) item(g, icon, cx + 4, cy + 4, 8);
			// all of a kind taken: green
			Modules.text(g, mc, c[1] + "/" + c[2], cx + 10, cy, c[1] == c[2] ? 0xFF86EFAC : 0xFFFFFFFF);
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
		double reach = "circle".equals(SlashHud.config.dungeonShape) ? Math.min(W, H) / 2.0 - 6
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
		if (SlashHud.config.dungeonTitle) Modules.text(g, mc, Component.translatable("slashclient-hud.dungeon").getString(), x + 3, y + 2, 0xFFFFFFFF);
		int top = y + title();
		int[][] rooms = { { 10, 10, 30, 26 }, { 46, 10, 30, 26 }, { 82, 14, 28, 22 }, { 10, 48, 30, 30 }, { 46, 48, 30, 30 }, { 82, 52, 28, 26 }, { 46, 88, 30, 24 } };
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
