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
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.state.BlockState;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A map of a dungeon (SkyUp.pl's dungeon sector, where every dungeon is laid out at random): from
 * above, what has been seen of the floor at the player's height, walkable floor in its own block's
 * colour (the start room's green shows green), walls dark, the player as an arrow and others as
 * dots. It starts with the chat line the server sends on entering ("Dungeon » Czy wiesz że…") and
 * ends when the player is in another world; the boss bar ("Dungeon poz. 2") gives its level.
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
	private static DynamicTexture texture;
	private static Identifier textureId;
	private static boolean dirty;
	private static int tick;
	private static String dungeonLevel = "";

	public String id() {
		return "dungeonmap";
	}

	// ---------- in and out of a dungeon ----------

	/** Every chat line: the server's line on entering a dungeon starts a new map. */
	public static void onChat(String line) {
		String plain = line.replaceAll("§.", "").trim();
		if (plain.startsWith("Dungeon »") || plain.startsWith("Dungeon >>")) start();
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
			texture = new DynamicTexture(() -> "SlashClient dungeon map", image);
			textureId = Identifier.fromNamespaceAndPath(SlashHud.ID, "dungeon_map");
			mc.getTextureManager().register(textureId, texture);
		}
		for (int y = 0; y < SIZE; y++) for (int x = 0; x < SIZE; x++) image.setPixel(x, y, UNKNOWN);
		dirty = true;
	}

	static void stop() {
		active = false;
		level = null;
		dungeonLevel = "";
	}

	/** True while there is a dungeon to show. */
	public static boolean active() {
		return active;
	}

	static void tick(Minecraft mc) {
		if (!active) return;
		// out of the dungeon: another world (the server sends players to a lobby or another sector)
		if (mc.level == null || mc.level != level || mc.player == null) {
			stop();
			return;
		}
		int px = mc.player.getBlockX() - originX, pz = mc.player.getBlockZ() - originZ;
		if (px < -64 || pz < -64 || px > SIZE + 64 || pz > SIZE + 64) {
			stop();
			return;
		}
		if (++tick % 10 == 0) {
			readLevel(mc);
			scan(mc);
		}
		if (dirty) {
			texture.upload();
			dirty = false;
		}
	}

	/** "Dungeon poz. 2" on the boss bar: the dungeon's level, for the map's title. */
	private static void readLevel(Minecraft mc) {
		var overlay = Compat.bossOverlay(mc);
		if (overlay == null) return;
		for (var event : ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values()) {
			Matcher m = LEVEL.matcher(event.getName().getString());
			if (m.find()) {
				dungeonLevel = m.group(1);
				return;
			}
		}
	}

	/**
	 * The floor around the player, a few blocks up and down: a column is walkable where something
	 * can be stood on with two blocks of room above it, a wall where there is no such place.
	 */
	private static void scan(Minecraft mc) {
		ClientLevel world = mc.level;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int cx = mc.player.getBlockX(), cy = mc.player.getBlockY(), cz = mc.player.getBlockZ();
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
					dirty = true;
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
		title(g, mc, x, y);
		// the part seen so far, a little margin around it, as large as fits and square blocks
		int mx0 = Math.max(0, minX - 2), mz0 = Math.max(0, minZ - 2);
		int mw = Math.min(SIZE, maxX + 3) - mx0, mh = Math.min(SIZE, maxZ + 3) - mz0;
		float scale = Math.min((float) W / mw, (float) H / mh);
		int dw = Math.round(mw * scale), dh = Math.round(mh * scale);
		int ox = x + (W - dw) / 2, oy = y + TITLE + (H - dh) / 2;
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, textureId, ox, oy, mx0, mz0, dw, dh, mw, mh, SIZE, SIZE, 0xFFFFFFFF);
		// other players, then the player on top
		for (Player p : mc.level.players()) {
			if (p == mc.player) continue;
			int sx = ox + Math.round((float) (p.getX() - originX - mx0) * scale), sz = oy + Math.round((float) (p.getZ() - originZ - mz0) * scale);
			if (sx >= ox && sz >= oy && sx < ox + dw && sz < oy + dh) g.fill(sx - 1, sz - 1, sx + 2, sz + 2, 0xFF60A5FA);
		}
		int sx = ox + Math.round((float) (mc.player.getX() - originX - mx0) * scale), sz = oy + Math.round((float) (mc.player.getZ() - originZ - mz0) * scale);
		arrow(g, sx, sz, mc.player.getYRot());
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
