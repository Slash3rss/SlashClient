package dev.slash3rss.slashclient.hud;

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
	/** The blocks the map can hold, around where the dungeon was entered. */
	private static final int SIZE = 256;
	/** How far around the player the floor is read, each half second. */
	private static final int RADIUS = 36;
	private static final int UNKNOWN = 0, WALL = 0xFF0E131C;
	private static final Pattern LEVEL = Pattern.compile("Dungeon\\s+poz\\.?\\s*(\\d+)", Pattern.CASE_INSENSITIVE);

	private static boolean active;
	private static ClientLevel level;
	/** The map's corner in the world (x, z) and the part of it seen so far. */
	private static int originX, originZ;
	private static int minX = Integer.MAX_VALUE, minZ = Integer.MAX_VALUE, maxX = Integer.MIN_VALUE, maxZ = Integer.MIN_VALUE;
	private static NativeImage image;
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
		minX = minZ = Integer.MAX_VALUE;
		maxX = maxZ = Integer.MIN_VALUE;
		if (image == null) {
			image = new NativeImage(SIZE, SIZE, true);
		}
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
	}

	static void stop() {
		active = false;
		level = null;
		dungeonLevel = "";
		hintedAt = 0;
	}

	/** True while there is a dungeon to show. */
	public static boolean active() {
		return active;
	}

	static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null) {
			if (active) stop();
			return;
		}
		if (++tick % 10 == 0) {
			bossBar = readLevel(mc);
			// the boss bar: in a dungeon (a map starts, or goes on); gone: out, unless the hint just came
			if (bossBar && !active) start();
			boolean hinted = hintedAt > 0 && System.currentTimeMillis() - hintedAt < 20_000;
			if (!bossBar && active && !hinted) {
				stop();
				return;
			}
		}
		if (!active) return;
		// another world, or a jump far away (the teleport into the dungeon): the map begins there
		int px = mc.player.getBlockX() - originX, pz = mc.player.getBlockZ() - originZ;
		if (mc.level != level || px < -64 || pz < -64 || px > SIZE + 64 || pz > SIZE + 64) start();
		if (tick % 10 == 0) scan(mc);
		render(mc);
	}

	/** The picture on screen: the part of the map shown, in its shape. */
	private static void render(Minecraft mc) {
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
			viewX = (float) (mc.player.getX() - originX) - span / 2f;
			viewZ = (float) (mc.player.getZ() - originZ) - span / 2f;
		}
		float r = W / 2f;
		for (int py = 0; py < H; py++) {
			for (int px = 0; px < W; px++) {
				int color = UNKNOWN;
				float dx = px + 0.5f - r, dz = py + 0.5f - r;
				if (!circle || dx * dx + dz * dz <= r * r) {
					int ix = (int) Math.floor(viewX + (px + 0.5f) / viewScale), iz = (int) Math.floor(viewZ + (py + 0.5f) / viewScale);
					if (ix >= 0 && iz >= 0 && ix < SIZE && iz < SIZE) color = image.getPixel(ix, iz);
					// a round map shows its whole disc, also where nothing was seen yet
					if (circle && color == UNKNOWN) color = 0x90101828;
				}
				view.setPixel(px, py, color);
			}
		}
		viewTexture.upload();
	}

	/** "Dungeon poz. 2" on the boss bar: whether it is there, and the dungeon's level for the map's title. */
	private static boolean readLevel(Minecraft mc) {
		var overlay = Compat.bossOverlay(mc);
		if (overlay == null) return false;
		for (var event : ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values()) {
			Matcher m = LEVEL.matcher(event.getName().getString());
			if (m.find()) {
				dungeonLevel = m.group(1);
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
		int cx = mc.player.getBlockX(), cy = at == Integer.MIN_VALUE ? mc.player.getBlockY() : at, cz = mc.player.getBlockZ();
		for (int x = cx - RADIUS; x <= cx + RADIUS; x++) {
			for (int z = cz - RADIUS; z <= cz + RADIUS; z++) {
				int ix = x - originX, iz = z - originZ;
				if (ix < 0 || iz < 0 || ix >= SIZE || iz >= SIZE) continue;
				if (!world.hasChunk(x >> 4, z >> 4)) continue;
				int color = WALL;
				for (int dy = -2; dy <= 2; dy++) {
					int y = cy + dy;
					if (solid(world, pos.set(x, y - 1, z)) && !solid(world, pos.set(x, y, z)) && !solid(world, pos.set(x, y + 1, z))) {
						BlockState floor = world.getBlockState(pos.set(x, y - 1, z));
						color = floorColor(floor.getMapColor(world, pos).col);
						break;
					}
				}
				// columns of nothing at all (outside the dungeon, open sky below) stay unknown
				if (color == WALL && !anySolid(world, pos, x, cy, z)) continue;
				if (image.getPixel(ix, iz) != color) {
					image.setPixel(ix, iz, color);
				}
				minX = Math.min(minX, ix);
				minZ = Math.min(minZ, iz);
				maxX = Math.max(maxX, ix);
				maxZ = Math.max(maxZ, iz);
			}
		}
	}

	private static boolean solid(ClientLevel world, BlockPos pos) {
		return !world.getBlockState(pos).getCollisionShape(world, pos).isEmpty();
	}

	private static boolean anySolid(ClientLevel world, BlockPos.MutableBlockPos pos, int x, int cy, int z) {
		for (int y = cy - 3; y <= cy + 3; y++) if (solid(world, pos.set(x, y, z))) return true;
		return false;
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

	private static final int W = 120, H = 120, TITLE = 11;

	@Override
	public boolean visible(Minecraft mc) {
		return active && minX <= maxX;
	}

	@Override
	public int width(Minecraft mc) {
		return W;
	}

	@Override
	public int height(Minecraft mc) {
		return H + TITLE;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		if (!visible(mc)) return;
		if (viewTexture == null) render(mc);
		title(g, mc, x, y);
		int ox = x, oy = y + TITLE;
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, viewId, ox, oy, 0, 0, W, H, W, H, W, H, 0xFFFFFFFF);
		markers(g, mc, ox, oy);
		int sx = Math.round((float) (mc.player.getX() - originX - viewX) * viewScale), sz = Math.round((float) (mc.player.getZ() - originZ - viewZ) * viewScale);
		if (shown(sx, sz)) {
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
	 * What is about in the dungeon: spawners (armour stands with a spawner on the head), mobs as
	 * their head, NPCs (players with a skin, not on the tab list) with a red frame, and players
	 * with a blue one.
	 */
	private static void markers(GuiGraphicsExtractor g, Minecraft mc, int ox, int oy) {
		HudConfig cfg = SlashHud.config;
		var connection = mc.getConnection();
		for (Entity e : mc.level.entitiesForRendering()) {
			if (e == mc.player || !e.isAlive()) continue;
			int sx = Math.round((float) (e.getX() - originX - viewX) * viewScale), sz = Math.round((float) (e.getZ() - originZ - viewZ) * viewScale);
			if (!shown(sx, sz)) continue;
			if (e instanceof ArmorStand stand) {
				ItemStack head = stand.getItemBySlot(EquipmentSlot.HEAD);
				if (cfg.dungeonSpawners && head.is(Items.SPAWNER)) {
					// the cage alone is hard to see: on an orange square
					g.fill(ox + sx - 5, oy + sz - 5, ox + sx + 5, oy + sz + 5, 0xFFF59E0B);
					g.fill(ox + sx - 4, oy + sz - 4, ox + sx + 4, oy + sz + 4, 0xFF1F2937);
					item(g, head, ox + sx, oy + sz);
				}
			} else if (e instanceof AbstractClientPlayer p) {
				boolean real = connection != null && connection.getPlayerInfo(p.getUUID()) != null;
				if (real ? cfg.dungeonPlayers : cfg.dungeonMobs) face(g, p, ox + sx, oy + sz, real ? 0xFF60A5FA : 0xFFEF4444);
			} else if (e instanceof Mob mob && cfg.dungeonMobs && !mob.isInvisible()) {
				// a head it wears (servers dress their mobs in player heads), else its own face, else a dot
				ItemStack worn = mob.getItemBySlot(EquipmentSlot.HEAD);
				if (!worn.isEmpty() && worn.getItem() instanceof net.minecraft.world.item.BlockItem block && block.getBlock() instanceof net.minecraft.world.level.block.AbstractSkullBlock) item(g, worn, ox + sx, oy + sz);
				else if (!MobHeads.draw(g, mob.getType(), ox + sx, oy + sz)) g.fill(ox + sx - 1, oy + sz - 1, ox + sx + 2, oy + sz + 2, 0xFFEF4444);
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

	/** An item at half its size (8 pixels), centred on the point. */
	private static void item(GuiGraphicsExtractor g, ItemStack stack, int x, int y) {
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x - 4, y - 4);
		pose.scale(0.5f, 0.5f);
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

	private static void title(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		String text = dungeonLevel.isEmpty() ? Component.translatable("slashclient-hud.dungeon").getString()
			: Component.translatable("slashclient-hud.dungeon.level", dungeonLevel).getString();
		Modules.text(g, mc, text, x + 3, y + 2, 0xFFFFFFFF);
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
		Modules.text(g, mc, Component.translatable("slashclient-hud.dungeon").getString(), x + 3, y + 2, 0xFFFFFFFF);
		int top = y + TITLE;
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

	/** For the test: how much of the map is known (columns seen). */
	static int known() {
		if (image == null || minX > maxX) return 0;
		int n = 0;
		for (int z = minZ; z <= maxZ; z++) for (int x = minX; x <= maxX; x++) if (image.getPixel(x, z) != UNKNOWN) n++;
		return n;
	}
}
