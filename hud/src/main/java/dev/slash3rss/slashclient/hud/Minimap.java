package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import java.util.List;

/**
 * A minimap: the loaded ground around the player from above (MinimapTerrain), the player's own
 * waypoints, the players and mobs the game knows about nearby (MapEntities, each kind can be
 * switched off) and the player as an arrow; north up or turning with the player, square or round.
 * Friends who chose to share their position with us through SlashClient (FriendPositions) show
 * as their face with their nick, or an arrow on the edge when further away.
 *
 * The picture is painted on the CPU into a texture of its own, only when something it shows
 * changed (the player moved or turned, or the ground under it was read anew), so a still player
 * costs nothing and a turning one one small picture a frame.
 */
public final class Minimap implements HudModule {
	public static final String[] SHAPES = { "square", "circle" };
	private static final int UNKNOWN = 0xC0101418, BORDER = 0xFF0B0F17;
	private static final int INFO = 11;

	private static NativeImage view;
	private static DynamicTexture viewTexture;
	private static Identifier viewId;
	private static int W;
	/** What the picture was last painted for; painted again when it differs. */
	private static long painted = Long.MIN_VALUE;
	/** When the last tick ran, to place the player between ticks. */
	private static long tickedAt;
	/** For the test: how long painting took, all told, and how often. */
	static long paintNanos, paints;

	public String id() {
		return "minimap";
	}

	private static boolean on() {
		return SlashHud.config != null && SlashHud.config.placement("minimap").enabled;
	}

	static void tick(Minecraft mc) {
		// the full map (WorldMapScreen) shows the same ground, so it is read for that too
		boolean map = SlashHud.config != null && SlashHud.config.worldMap;
		if (!on() && !map || mc.level == null || mc.player == null) return;
		tickedAt = System.nanoTime();
		MinimapTerrain.tick(mc);
	}

	private static int size() {
		return Math.max(64, Math.min(200, SlashHud.config.minimapSize));
	}

	private static float zoom() {
		return Math.max(0.5f, Math.min(4f, SlashHud.config.minimapZoom));
	}

	private static boolean circle() {
		return "circle".equals(SlashHud.config.minimapShape);
	}

	/** The picture at the size from the settings; made anew when it changes. */
	private static void texture(Minecraft mc) {
		int size = size();
		if (view != null && size == W) return;
		W = size;
		view = new NativeImage(W, W, true);
		viewTexture = new DynamicTexture(() -> "SlashClient minimap", view);
		if (viewId == null) viewId = Identifier.fromNamespaceAndPath(SlashHud.ID, "minimap");
		mc.getTextureManager().register(viewId, viewTexture);
		painted = Long.MIN_VALUE;
	}

	@Override
	public boolean visible(Minecraft mc) {
		return mc.level != null && mc.player != null;
	}

	@Override
	public int width(Minecraft mc) {
		return size();
	}

	@Override
	public int height(Minecraft mc) {
		return size() + (SlashHud.config.minimapCoords ? INFO : 0);
	}

	/** How far it is from the last tick to the next (0..1), to place things between ticks. */
	static float partial() {
		return Math.max(0f, Math.min(1f, (System.nanoTime() - tickedAt) / 50_000_000f));
	}

	/** The player's place between the last tick and the next (x, z). */
	private static double[] where(Minecraft mc) {
		var p = mc.player;
		float t = partial();
		return new double[] { p.xo + (p.getX() - p.xo) * t, p.zo + (p.getZ() - p.zo) * t };
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		if (!visible(mc)) return;
		texture(mc);
		HudConfig cfg = SlashHud.config;
		double[] at = where(mc);
		float scale = zoom();
		boolean rotate = cfg.minimapRotate, circle = circle();
		float yaw = rotate ? mc.player.getYRot() : 180f;
		// what the picture shows, in its own steps: half a pixel of movement, a quarter of a degree
		long key = Math.round(at[0] * scale * 2) * 31 + Math.round(at[1] * scale * 2);
		key = key * 31 + (rotate ? Math.round(yaw * 4) : 0);
		key = key * 31 + MinimapTerrain.version;
		key = key * 31 + Float.floatToIntBits(scale) + (circle ? 1 : 0) + W * 7L;
		if (key != painted) {
			painted = key;
			long t0 = System.nanoTime();
			paint(at[0], at[1], scale, yaw, circle);
			viewTexture.upload();
			paintNanos += System.nanoTime() - t0;
			paints++;
		}
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, viewId, x, y, 0, 0, W, W, W, W, W, W, 0xFFFFFFFF);
		float r = W / 2f;
		int cx = x + W / 2, cy = y + W / 2;
		double a = Math.toRadians(yaw);
		float cos = (float) Math.cos(a), sin = (float) Math.sin(a);
		// north on the edge
		float[] north = toScreen(0, -1, 1f, cos, sin);
		float[] n = edge(north[0], north[1], r - 6, circle);
		String letter = "N";
		g.text(mc.font, letter, cx + Math.round(n[0]) - mc.font.width(letter) / 2 + 1, cy + Math.round(n[1]) - 3, 0xFFF87171, true);
		if (cfg.minimapWaypoints) waypoints(g, mc, cx, cy, at, scale, cos, sin, r, circle);
		entities(g, mc, cx, cy, at, scale, cos, sin, r, circle);
		friends(g, mc, cx, cy, at, scale, cos, sin, r, circle);
		// the player: up when the map turns, else the way they look
		float[] dir = rotate ? new float[] { 0, -1 } : new float[] { (float) -Math.sin(Math.toRadians(mc.player.getYRot())), (float) Math.cos(Math.toRadians(mc.player.getYRot())) };
		arrow(g, cx, cy, dir[0], dir[1], 5f, 4f, 0xFF000000);
		arrow(g, cx, cy, dir[0], dir[1], 4f, 3f, 0xFFFFFFFF);
		if (cfg.minimapCoords) info(g, mc, x, y + W);
	}

	/**
	 * The ground into the picture, around (px, pz): `scale` pixels a block, turned so that `yaw`
	 * looks up (180, looking north, is north up).
	 */
	private static void paint(double px, double pz, float scale, float yaw, boolean circle) {
		float r = W / 2f, inv = 1f / scale;
		double a = Math.toRadians(yaw);
		float cos = (float) Math.cos(a), sin = (float) Math.sin(a);
		float ring = (r - 1.2f) * (r - 1.2f);
		for (int py = 0; py < W; py++) {
			float sy = py + 0.5f - r;
			for (int qx = 0; qx < W; qx++) {
				float sx = qx + 0.5f - r;
				int c;
				if (circle) {
					float d = sx * sx + sy * sy;
					if (d > r * r) {
						view.setPixel(qx, py, 0);
						continue;
					}
					if (d > ring) {
						view.setPixel(qx, py, BORDER);
						continue;
					}
				} else if (qx == 0 || py == 0 || qx == W - 1 || py == W - 1) {
					view.setPixel(qx, py, BORDER);
					continue;
				}
				// the screen's right and up in the world: right is (-cos, -sin), ahead (-sin, cos)
				float ox = (-cos * sx + sin * sy) * inv, oz = (-sin * sx - cos * sy) * inv;
				c = MinimapTerrain.sample((int) Math.floor(px + ox), (int) Math.floor(pz + oz));
				view.setPixel(qx, py, c == 0 ? UNKNOWN : c);
			}
		}
	}

	/** A point `ox`, `oz` blocks from the player to screen pixels from the map's middle. */
	static float[] toScreen(double ox, double oz, float scale, float cos, float sin) {
		return new float[] { (float) (-cos * ox - sin * oz) * scale, (float) (sin * ox - cos * oz) * scale };
	}

	/** A direction from the middle, out to `reach` pixels: on the circle, or the square's edge. */
	private static float[] edge(float sx, float sy, float reach, boolean circle) {
		float k = circle ? (float) (reach / Math.max(1e-4, Math.hypot(sx, sy))) : reach / Math.max(1e-4f, Math.max(Math.abs(sx), Math.abs(sy)));
		return new float[] { sx * k, sy * k };
	}

	/** The player's waypoints in this dimension: a diamond on the map, or an arrow on its edge pointing to it. */
	private static void waypoints(GuiGraphicsExtractor g, Minecraft mc, int cx, int cy, double[] at, float scale, float cos, float sin, float r, boolean circle) {
		List<Waypoints.Point> points = Waypoints.points(mc);
		if (points.isEmpty()) return;
		String dim = Waypoints.dimension(mc);
		float reach = r - 5;
		for (Waypoints.Point p : points) {
			if (!p.visible || !dim.equals(p.dimension)) continue;
			float[] s = toScreen(p.x + 0.5 - at[0], p.z + 0.5 - at[1], scale, cos, sin);
			boolean inside = circle ? s[0] * s[0] + s[1] * s[1] <= reach * reach : Math.abs(s[0]) <= reach && Math.abs(s[1]) <= reach;
			if (inside) {
				int sx = cx + Math.round(s[0]), sy = cy + Math.round(s[1]);
				diamond(g, sx, sy, 4, 0xFF000000);
				diamond(g, sx, sy, 3, p.color | 0xFF000000);
			} else {
				float len = (float) Math.max(1e-4, Math.hypot(s[0], s[1]));
				float[] e = edge(s[0], s[1], reach, circle);
				arrow(g, cx + e[0], cy + e[1], s[0] / len, s[1] / len, 4f, 3.5f, 0xFF000000);
				arrow(g, cx + e[0], cy + e[1], s[0] / len, s[1] / len, 3f, 2.5f, p.color | 0xFF000000);
			}
		}
	}

	/** Players and mobs nearby, where they are inside the map (none on its edge: only those the game knows of, close by). */
	private static void entities(GuiGraphicsExtractor g, Minecraft mc, int cx, int cy, double[] at, float scale, float cos, float sin, float r, boolean circle) {
		float reach = r - 4;
		List<MapEntities.Mark> drawn = new java.util.ArrayList<>();
		for (MapEntities.Mark m : MapEntities.around(mc, partial())) {
			float[] s = toScreen(m.x() - at[0], m.z() - at[1], scale, cos, sin);
			boolean inside = circle ? s[0] * s[0] + s[1] * s[1] <= reach * reach : Math.abs(s[0]) <= reach && Math.abs(s[1]) <= reach;
			if (!inside) continue;
			MapEntities.draw(g, mc, m, cx + Math.round(s[0]), cy + Math.round(s[1]), false);
			drawn.add(m);
		}
		MapEntities.drawnMinimap = MapEntities.describe(drawn);
	}

	/** Friends sharing their position, in this dimension: their face (and nick) on the map, or an arrow on its edge. */
	private static void friends(GuiGraphicsExtractor g, Minecraft mc, int cx, int cy, double[] at, float scale, float cos, float sin, float r, boolean circle) {
		var list = dev.slash3rss.slashclient.hud.social.FriendPositions.visible(mc);
		if (list.isEmpty()) return;
		float reach = r - 6;
		// the furthest first, so the nearest are drawn on top
		for (int i = list.size() - 1; i >= 0; i--) {
			var p = list.get(i);
			float[] s = toScreen(p.x() - at[0], p.z() - at[1], scale, cos, sin);
			boolean inside = circle ? s[0] * s[0] + s[1] * s[1] <= reach * reach : Math.abs(s[0]) <= reach && Math.abs(s[1]) <= reach;
			if (inside) {
				friend(g, mc, p, cx + Math.round(s[0]), cy + Math.round(s[1]), SlashHud.config.friendsOnMapNames);
			} else {
				float len = (float) Math.max(1e-4, Math.hypot(s[0], s[1]));
				float[] e = edge(s[0], s[1], reach + 1, circle);
				arrow(g, cx + e[0], cy + e[1], s[0] / len, s[1] / len, 4.5f, 4f, 0xFF000000);
				arrow(g, cx + e[0], cy + e[1], s[0] / len, s[1] / len, 3.5f, 3f, FRIEND);
			}
		}
	}

	/** A friend's colour on the maps. */
	static final int FRIEND = 0xFF4ADE80;

	/** A friend on a map at (x, y): their face in a green frame (a green dot when the game has no skin for them), the nick under it. */
	static void friend(GuiGraphicsExtractor g, Minecraft mc, dev.slash3rss.slashclient.hud.social.FriendPositions.Pos p, int x, int y, boolean name) {
		Identifier skin = null;
		var player = dev.slash3rss.slashclient.hud.social.FriendPositions.player(mc, p);
		if (player != null) skin = Compat.skinTexture(player);
		else if (mc.getConnection() != null) {
			for (java.util.UUID u : p.uuids()) {
				var info = mc.getConnection().getPlayerInfo(u);
				if (info != null) {
					skin = Compat.skinTexture(info);
					break;
				}
			}
		}
		g.fill(x - 5, y - 5, x + 5, y + 5, 0xFF000000);
		g.fill(x - 4, y - 4, x + 4, y + 4, FRIEND);
		if (skin != null) {
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x - 3, y - 3, 8, 8, 6, 6, 8, 8, 64, 64, 0xFFFFFFFF);
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x - 3, y - 3, 40, 8, 6, 6, 8, 8, 64, 64, 0xFFFFFFFF);
		} else {
			String initial = p.name().isEmpty() ? "?" : p.name().substring(0, 1).toUpperCase(java.util.Locale.ROOT);
			g.fill(x - 3, y - 3, x + 3, y + 3, 0xFF166534);
			var pose = g.pose();
			pose.pushMatrix();
			pose.translate(x - mc.font.width(initial) * 0.35f, y - 2.5f);
			pose.scale(0.7f, 0.7f);
			g.text(mc.font, initial, 0, 0, 0xFFFFFFFF, false);
			pose.popMatrix();
		}
		if (!name || p.name().isEmpty()) return;
		// the nick, half size, on a dark strip under the face
		var pose = g.pose();
		int tw = mc.font.width(p.name());
		pose.pushMatrix();
		pose.translate(x - tw * 0.3f, y + 6);
		pose.scale(0.6f, 0.6f);
		g.fill(-2, -1, tw + 2, 9, 0xB0000000);
		g.text(mc.font, p.name(), 0, 0, FRIEND, false);
		pose.popMatrix();
	}

	static void diamond(GuiGraphicsExtractor g, int x, int y, int r, int color) {
		for (int i = 0; i <= r; i++) g.fill(x - i, y - r + i, x + i + 1, y - r + i + 1, color);
		for (int i = 0; i < r; i++) g.fill(x - r + 1 + i, y + 1 + i, x + r - i, y + 2 + i, color);
	}

	/**
	 * An arrowhead at (x, y) pointing along (dx, dy) (a unit vector): its tip `len` ahead, its
	 * wings `wide` to the sides behind, notched at the back. Drawn pixel by pixel.
	 */
	static void arrow(GuiGraphicsExtractor g, float x, float y, float dx, float dy, float len, float wide, int color) {
		float tipX = x + dx * len, tipY = y + dy * len;
		float backX = x - dx * len * 0.8f, backY = y - dy * len * 0.8f;
		float lx = backX - dy * wide, ly = backY + dx * wide, rx = backX + dy * wide, ry = backY - dx * wide;
		float nx = x - dx * len * 0.3f, ny = y - dy * len * 0.3f;
		int x0 = (int) Math.floor(Math.min(Math.min(tipX, lx), rx)), x1 = (int) Math.ceil(Math.max(Math.max(tipX, lx), rx));
		int y0 = (int) Math.floor(Math.min(Math.min(tipY, ly), ry)), y1 = (int) Math.ceil(Math.max(Math.max(tipY, ly), ry));
		for (int py = y0; py <= y1; py++) {
			for (int px = x0; px <= x1; px++) {
				float qx = px + 0.5f, qy = py + 0.5f;
				if (inTriangle(qx, qy, tipX, tipY, lx, ly, nx, ny) || inTriangle(qx, qy, tipX, tipY, nx, ny, rx, ry)) g.fill(px, py, px + 1, py + 1, color);
			}
		}
	}

	private static boolean inTriangle(float px, float py, float ax, float ay, float bx, float by, float cx, float cy) {
		float d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
		float d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
		float d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
		boolean neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
		return !(neg && pos);
	}

	private static final String[] DIRECTIONS = { "S", "SW", "W", "NW", "N", "NE", "E", "SE" };

	/** The coordinates and the way the player looks, under the map; smaller when they do not fit. */
	private static void info(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		var p = mc.player;
		float yaw = ((p.getYRot() % 360) + 360) % 360;
		String text = p.getBlockX() + ", " + p.getBlockY() + ", " + p.getBlockZ() + "  " + DIRECTIONS[Math.round(yaw / 45f) % 8];
		int tw = mc.font.width(text);
		if (tw <= W - 2) {
			Modules.text(g, mc, text, x + (W - tw) / 2, y + 2, SlashHud.config.textColor);
			return;
		}
		float k = (W - 2) / (float) tw;
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x + 1, y + 2 + (8 - 8 * k) / 2);
		pose.scale(k, k);
		Modules.text(g, mc, text, 0, 0, SlashHud.config.textColor);
		pose.popMatrix();
	}

	/** In the editor without a world: the shape with the player's arrow, so it can be placed. */
	@Override
	public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		if (visible(mc)) {
			draw(g, mc, x, y);
			return;
		}
		int w = size();
		if (circle()) {
			float r = w / 2f;
			for (int row = 0; row < w; row++) {
				float dy = row + 0.5f - r;
				int half = (int) Math.sqrt(Math.max(0, r * r - dy * dy));
				g.fill(x + w / 2 - half, y + row, x + w / 2 + half, y + row + 1, 0xFF3F6B3A);
			}
		} else g.fill(x, y, x + w, y + w, 0xFF3F6B3A);
		arrow(g, x + w / 2f, y + w / 2f, 0, -1, 4f, 3f, 0xFFFFFFFF);
	}

	/** For the test: chunks known, the paints and their average time (µs). */
	static String summary() {
		return MinimapTerrain.chunksKnown() + " chunks, " + paints + " paints, " + (paints == 0 ? 0 : paintNanos / paints / 1000) + " us";
	}
}
