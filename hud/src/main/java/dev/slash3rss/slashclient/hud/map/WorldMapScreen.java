package dev.slash3rss.slashclient.hud.map;

import com.mojang.blaze3d.platform.InputConstants;
import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.social.FriendPositions;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.List;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * The map over the whole screen (M outside a dungeon): all the ground the minimap has seen in this
 * dimension of this world (MinimapTerrain remembers it), the player with the way they look, the
 * waypoints (own, a friend's shared ones, the death point) with their names, the players and mobs
 * the game knows about nearby (MapEntities), and friends who share their position. Dragging moves it, the wheel zooms around the mouse, Space or "Do mnie" comes back
 * to the player; a right click puts a new waypoint there, a click on one opens it to rename,
 * recolour, hide, share or delete. M, Escape or ✕ closes it.
 */
public class WorldMapScreen extends Screen {
	private static NativeImage view;
	private static DynamicTexture texture;
	private static Identifier textureId;
	private static final int UNKNOWN = 0xFF10141C;
	public static final float MIN_ZOOM = 0.125f, MAX_ZOOM = 8f;
	private static final int BAR = 22, CLOSE = 14;

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final KeyMapping key;
	private final List<Hit> hits = new ArrayList<>();
	/** The world point in the middle of the map, and GUI pixels a block. */
	public double centerX, centerZ;
	public float zoom;
	/** The map area and the view in it, from the last frame (for the mouse). */
	private int ox, oy, aw, ah;

	/** The map's area on screen as last drawn: x, y, width, height (for the tests, which click on it). */
	public int[] area() {
		return new int[] { ox, oy, aw, ah };
	}
	private double vx, vz;
	private String lastView = "";
	private int lastVersion = -1, frame;
	private boolean panning;
	/** The waypoint open in the panel, or null. */
	public Waypoints.Point selected;
	private EditBox name;
	private int panelX, panelY, panelW, panelH;

	public WorldMapScreen(KeyMapping key) {
		super(Component.translatable("slashclient-hud.worldMap"));
		this.key = key;
		Minecraft mc = Minecraft.getInstance();
		zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, SlashHud.config.worldMapZoom));
		if (mc.player != null) {
			centerX = mc.player.getX();
			centerZ = mc.player.getZ();
		}
	}

	/** Whether M (outside a dungeon) opens it. */
	public static boolean on() {
		return SlashHud.config != null && SlashHud.config.worldMap;
	}

	/** A picture of this size to draw into, made anew when the size changes. */
	private static void ensure(int w, int h) {
		if (view != null && view.getWidth() == w && view.getHeight() == h) return;
		Minecraft mc = Minecraft.getInstance();
		if (texture != null) texture.close();
		view = new NativeImage(w, h, true);
		texture = new DynamicTexture(() -> "SlashClient world map", view);
		textureId = Identifier.fromNamespaceAndPath(SlashHud.ID, "world_map");
		mc.getTextureManager().register(textureId, texture);
	}

	@Override
	protected void init() {
		name = new EditBox(font, 0, 0, 120, 10, Component.translatable("slashclient-hud.waypoints.name"));
		name.setBordered(false);
		name.setTextColor(Ui.TEXT);
		name.setMaxLength(32);
		name.setHint(Component.translatable("slashclient-hud.waypoints.name"));
		name.setResponder(text -> {
			if (selected != null && !text.isBlank() && !text.strip().equals(selected.name)) {
				selected.name = text.strip();
				Waypoints.save();
			}
		});
		name.visible = false;
		addRenderableWidget(name);
		if (selected != null) select(selected);
	}

	public void select(Waypoints.Point p) {
		selected = p;
		if (name == null) return;
		name.visible = p != null;
		if (p != null) name.setValue(p.name);
		setFocused(null);
		name.setFocused(false);
	}

	/** World point to screen, and back. */
	private float sx(double x) {
		return (float) (ox + (x - vx) * zoom);
	}

	private float sy(double z) {
		return (float) (oy + (z - vz) * zoom);
	}

	private double wx(double screenX) {
		return vx + (screenX - ox) / zoom;
	}

	private double wz(double screenY) {
		return vz + (screenY - oy) / zoom;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null) {
			onClose();
			return;
		}
		hits.clear();
		ox = 6;
		oy = BAR + 4;
		aw = width - 12;
		// the help under the map: on two lines in a narrow window instead of losing its end
		List<Component> help = helpLines(width - 12);
		ah = height - oy - 6 - 10 * help.size();
		vx = centerX - aw / 2.0 / zoom;
		vz = centerZ - ah / 2.0 / zoom;
		// drawn at most 640 pixels across, stretched to the area; again when the view or the ground changes
		int pw = Math.max(1, Math.min(aw, 640)), ph = Math.max(1, Math.round((float) ah * pw / aw));
		ensure(pw, ph);
		String now = pw + "," + ph + "," + vx + "," + vz + "," + zoom;
		if (!now.equals(lastView) || (lastVersion != MinimapTerrain.exploredVersion && frame++ % 10 == 0)) {
			lastView = now;
			lastVersion = MinimapTerrain.exploredVersion;
			paint(pw, ph, zoom * pw / aw);
			texture.upload();
		}
		g.fill(ox - 1, oy - 1, ox + aw + 1, oy + ah + 1, 0xFF05070B);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, textureId, ox, oy, 0, 0, aw, ah, pw, ph, pw, ph, 0xFFFFFFFF);
		g.enableScissor(ox, oy, ox + aw, oy + ah);
		drawWaypoints(g, mc, mx, my);
		drawEntities(g, mc);
		drawFriends(g, mc);
		drawPlayer(g, mc);
		g.disableScissor();
		drawBar(g, mc, mx, my);
		if (selected != null && !Waypoints.points(mc).contains(selected)) select(null);
		if (selected != null) drawPanel(g, mc, mx, my);
		// where the mouse points, and how to use the map
		if (Ui.inside(mx, my, ox, oy, aw, ah)) {
			String at = "X " + (int) Math.floor(wx(mx)) + "   Z " + (int) Math.floor(wz(my));
			Ui.draw(g, Component.literal(at), ox + aw - Ui.width(Component.literal(at)) - 4, oy + ah - 11, 0xFFE5E7EB);
		}
		for (int i = 0; i < help.size(); i++) {
			Component line = help.get(i);
			Ui.draw(g, line, (width - Ui.width(line)) / 2, height - 12 - 10 * (help.size() - 1 - i), 0xFFAAAAAA);
		}
		super.extractRenderState(g, mx, my, delta);
	}

	/** The help's parts ("Drag: move", "Wheel: zoom", …) on as few lines of at most `w` pixels as they fit. */
	private static List<Component> helpLines(int w) {
		List<Component> out = new ArrayList<>();
		String line = "";
		for (String part : Ui.tr("slashclient-hud.worldMap.help").getString().split(" · ")) {
			String longer = line.isEmpty() ? part : line + " · " + part;
			if (!line.isEmpty() && Ui.width(Ui.text(longer)) > w) {
				out.add(Ui.text(line));
				line = part;
			} else line = longer;
		}
		out.add(Ui.fit(Ui.text(line), w));
		return out;
	}

	/** The ground into the picture: `ps` picture pixels a block, from the view's corner. */
	private void paint(int pw, int ph, float ps) {
		for (int py = 0; py < ph; py++) {
			int z = (int) Math.floor(vz + (py + 0.5) / ps);
			for (int px = 0; px < pw; px++) {
				int x = (int) Math.floor(vx + (px + 0.5) / ps);
				int c = MinimapTerrain.explored(x, z);
				view.setPixel(px, py, c == 0 ? UNKNOWN : c);
			}
		}
	}

	/** The top bar: the title and dimension, how much is known, "To me" and close. */
	private void drawBar(GuiGraphicsExtractor g, Minecraft mc, int mx, int my) {
		g.fill(0, 0, width, BAR, 0xE00A0D14);
		Ui.icon(g, "m-worldmap", 8, 6, 10, Ui.ACCENT_LIGHT);
		Component title = Ui.trBold("slashclient-hud.worldMap").append(Ui.text("  ·  " + dimensionName(mc)).withStyle(s -> s.withBold(false).withColor(Ui.TEXT_2 & 0xFFFFFF)));
		Ui.draw(g, title, 24, 7, Ui.TEXT);
		int cx = width - CLOSE - 6;
		Ui.button(g, "map:close", cx, 4, CLOSE, CLOSE, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(cx, 4, CLOSE, CLOSE, this::onClose));
		Component me = Ui.tr("slashclient-hud.worldMap.center");
		int bw = Ui.buttonWidth(me, "m-coords", CLOSE, 3);
		Ui.button(g, "map:center", cx - bw - 6, 4, bw, CLOSE, "m-coords", me, false, mx, my);
		hits.add(new Hit(cx - bw - 6, 4, bw, CLOSE, this::centerOnPlayer));
		Component scale = zoom >= 1 ? Ui.tr("slashclient-hud.worldMap.scale", String.format(java.util.Locale.ROOT, "%.0f", zoom))
			: Ui.text(String.format(java.util.Locale.ROOT, "1:%.0f", 1 / zoom));
		Component info = Ui.tr("slashclient-hud.worldMap.known", MinimapTerrain.exploredChunks()).append(Ui.text("  ·  ")).append(scale);
		Ui.draw(g, info, cx - bw - 14 - Ui.width(info), 7, Ui.MUTED);
	}

	public static String dimensionName(Minecraft mc) {
		String id = Waypoints.dimensionId(Waypoints.dimension(mc));
		String key = "slashclient-hud.worldMap.dim." + id.replace("minecraft:", "");
		Component c = Component.translatable(key);
		return c.getString().equals(key) ? id : c.getString();
	}

	void centerOnPlayer() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return;
		centerX = mc.player.getX();
		centerZ = mc.player.getZ();
	}

	/** Pins in this dimension (hidden ones faint), each with its name under it. */
	private void drawWaypoints(GuiGraphicsExtractor g, Minecraft mc, int mx, int my) {
		String dim = Waypoints.dimension(mc);
		for (Waypoints.Point p : Waypoints.points(mc)) {
			if (!dim.equals(p.dimension)) continue;
			int x = Math.round(sx(p.x + 0.5)), y = Math.round(sy(p.z + 0.5));
			if (x < ox - 40 || y < oy - 20 || x > ox + aw + 40 || y > oy + ah + 20) continue;
			int color = (p.color | 0xFF000000) & (p.visible ? 0xFFFFFFFF : 0x80FFFFFF);
			String icon = p.death ? "m-deathpoint" : p.from != null ? "share" : "m-waypoints";
			boolean chosen = p == selected;
			if (chosen) Ui.round(g, x - 7, y - 13, 14, 14, 4, Ui.withAlpha(Ui.ACCENT, 0xC0));
			Ui.icon(g, icon, x - 4, y - 10, 9, 0xC0000000);
			Ui.icon(g, icon, x - 5, y - 11, 9, color);
			Minimap.diamond(g, x, y, 1, color);
			String label = p.from == null ? p.name : p.name + " (" + p.from + ")";
			int tw = mc.font.width(label);
			var pose = g.pose();
			pose.pushMatrix();
			pose.translate(x - tw * 0.35f, y + 3);
			pose.scale(0.7f, 0.7f);
			g.fill(-2, -1, tw + 2, 9, 0xA0000000);
			g.text(mc.font, label, 0, 0, color, false);
			pose.popMatrix();
		}
	}

	/** The waypoint under a point of the screen (its pin or its dot), or null. */
	Waypoints.Point waypointAt(double x, double y) {
		Minecraft mc = Minecraft.getInstance();
		String dim = Waypoints.dimension(mc);
		Waypoints.Point best = null;
		double bestD = 49;
		for (Waypoints.Point p : Waypoints.points(mc)) {
			if (!dim.equals(p.dimension)) continue;
			double dx = x - sx(p.x + 0.5), dy = y - (sy(p.z + 0.5) - 4);
			double d = dx * dx + dy * dy;
			if (d < bestD) {
				bestD = d;
				best = p;
			}
		}
		return best;
	}

	/** Players (face and nick) and mobs (their faces, or dots) nearby, where they are on the map. */
	private void drawEntities(GuiGraphicsExtractor g, Minecraft mc) {
		List<MapEntities.Mark> drawn = new ArrayList<>();
		for (MapEntities.Mark m : MapEntities.around(mc, Minimap.partial())) {
			float x = sx(m.x()), y = sy(m.z());
			if (x < ox || y < oy || x > ox + aw || y > oy + ah) continue;
			MapEntities.draw(g, mc, m, Math.round(x), Math.round(y), zoom >= 1f);
			drawn.add(m);
		}
		MapEntities.shownWorldMap = drawn;
	}

	/** Friends sharing their position here: their face and nick, or an arrow on the map's edge pointing to them. */
	private void drawFriends(GuiGraphicsExtractor g, Minecraft mc) {
		for (FriendPositions.Pos p : FriendPositions.visible(mc)) {
			float x = sx(p.x()), y = sy(p.z());
			if (x >= ox + 6 && y >= oy + 6 && x <= ox + aw - 6 && y <= oy + ah - 6) {
				Minimap.friend(g, mc, p, Math.round(x), Math.round(y), true);
				continue;
			}
			float cx = ox + aw / 2f, cy = oy + ah / 2f, dx = x - cx, dy = y - cy;
			float k = Math.min((aw / 2f - 8) / Math.max(1e-4f, Math.abs(dx)), (ah / 2f - 8) / Math.max(1e-4f, Math.abs(dy)));
			float len = (float) Math.max(1e-4, Math.hypot(dx, dy));
			Minimap.arrow(g, cx + dx * k, cy + dy * k, dx / len, dy / len, 5f, 4.5f, 0xFF000000);
			Minimap.arrow(g, cx + dx * k, cy + dy * k, dx / len, dy / len, 4f, 3.5f, Minimap.FRIEND);
		}
	}

	private void drawPlayer(GuiGraphicsExtractor g, Minecraft mc) {
		var p = mc.player;
		float x = sx(p.getX()), y = sy(p.getZ());
		double a = Math.toRadians(p.getYRot());
		float dx = (float) -Math.sin(a), dy = (float) Math.cos(a);
		Minimap.arrow(g, x, y, dx, dy, 6f, 5f, 0xFF000000);
		Minimap.arrow(g, x, y, dx, dy, 5f, 4f, 0xFFFFFFFF);
	}

	/** The open waypoint: its colour, name, where it is and who shared it; show or hide, share, delete. */
	private void drawPanel(GuiGraphicsExtractor g, Minecraft mc, int mx, int my) {
		Waypoints.Point p = selected;
		panelW = Math.min(260, aw - 8);
		panelH = 44;
		panelX = ox + 6;
		panelY = oy + ah - panelH - 16;
		Ui.round(g, panelX, panelY, panelW, panelH, 5, 0xF0111622);
		Ui.roundOutline(g, panelX, panelY, panelW, panelH, 5, Ui.BORDER);
		// the colour dot changes colour on click
		Ui.round(g, panelX + 8, panelY + 7, 9, 9, 4, p.color | 0xFF000000);
		hits.add(new Hit(panelX + 6, panelY + 5, 13, 13, () -> {
			int next = 0;
			for (int c = 0; c < Waypoints.COLORS.length; c++) if (Waypoints.COLORS[c] == p.color) next = (c + 1) % Waypoints.COLORS.length;
			p.color = Waypoints.COLORS[next];
			Waypoints.save();
		}));
		int fieldW = panelW - 30 - 4 * 20;
		Ui.round(g, panelX + 22, panelY + 4, fieldW, 15, 3, Ui.CARD);
		Ui.roundOutline(g, panelX + 22, panelY + 4, fieldW, 15, 3, name.isFocused() ? Ui.withAlpha(Ui.ACCENT, 0x99) : Ui.BORDER);
		name.setX(panelX + 26);
		name.setY(panelY + 8);
		name.setWidth(fieldW - 8);
		int bx = panelX + panelW - 4 - 4 * 20;
		boolean canShare = dev.slash3rss.slashclient.hud.social.SharedWaypoints.canShare(mc);
		Ui.button(g, "map:share", bx, panelY + 3, 18, 17, "share", Component.empty(), false, mx, my);
		if (canShare) hits.add(new Hit(bx, panelY + 3, 18, 17, () -> mc.setScreenAndShow(dev.slash3rss.slashclient.hud.social.PickFriendsScreen.shareWaypoint(this, p))));
		Ui.button(g, "map:eye", bx + 20, panelY + 3, 18, 17, p.visible ? "check" : "close", Component.empty(), false, mx, my);
		hits.add(new Hit(bx + 20, panelY + 3, 18, 17, () -> {
			p.visible = !p.visible;
			Waypoints.save();
		}));
		Ui.button(g, "map:delete", bx + 40, panelY + 3, 18, 17, "trash", Component.empty(), false, mx, my);
		hits.add(new Hit(bx + 40, panelY + 3, 18, 17, () -> {
			Waypoints.remove(p);
			select(null);
		}));
		Ui.button(g, "map:deselect", bx + 60, panelY + 3, 18, 17, "back", Component.empty(), false, mx, my);
		hits.add(new Hit(bx + 60, panelY + 3, 18, 17, () -> select(null)));
		String where = p.x + " " + p.y + " " + p.z + "  ·  " + Math.round(Waypoints.distance(mc, p)) + " m";
		Component line = Ui.text(where);
		if (p.from != null) line = line.copy().append(Ui.tr("slashclient-hud.share.from", p.from));
		if (!p.visible) line = line.copy().append(Ui.text("  ·  ")).append(Ui.tr("slashclient-hud.worldMap.hidden"));
		Ui.draw(g, Ui.fit(line, panelW - 16), panelX + 8, panelY + 27, Ui.TEXT_2);
	}

	/** A new waypoint where the map was right-clicked (at the ground's height when it is known), opened at once. */
	Waypoints.Point addAt(int x, int z) {
		Minecraft mc = Minecraft.getInstance();
		Waypoints.Point p = Waypoints.add(mc, "");
		int h = MinimapTerrain.heightAt(x, z);
		p.x = x;
		p.z = z;
		p.y = h == Integer.MIN_VALUE ? mc.player.getBlockY() : h + 1;
		Waypoints.save();
		select(p);
		return p;
	}

	// ---------- the mouse and the keys ----------

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		panning = false;
		//#if MC >= 1.21.9
		if (super.mouseClicked(e, doubleClick)) return true;
		//#else
		//$ if (super.mouseClicked(e.x(), e.y(), e.button())) return true;
		//#endif
		for (Hit h : List.copyOf(hits)) {
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		if (name != null && name.isFocused()) {
			name.setFocused(false);
			setFocused(null);
		}
		if (selected != null && Ui.inside(e.x(), e.y(), panelX, panelY, panelW, panelH)) return true;
		if (!Ui.inside(e.x(), e.y(), ox, oy, aw, ah)) return false;
		if (e.button() == InputConstants.MOUSE_BUTTON_RIGHT) {
			addAt((int) Math.floor(wx(e.x())), (int) Math.floor(wz(e.y())));
			return true;
		}
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT) {
			Waypoints.Point p = waypointAt(e.x(), e.y());
			if (p != null) {
				select(p);
				return true;
			}
			panning = true;
			return true;
		}
		return false;
	}

	/** Dragging moves the map with the mouse. */
	@Override
	//#if MC >= 1.21.9
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
	//#else
	//$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (!panning) return false;
		pan(dx, dy);
		return true;
	}

	void pan(double dx, double dy) {
		centerX -= dx / zoom;
		centerZ -= dy / zoom;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseReleased(MouseButtonEvent e) {
	//#else
	//$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		panning = false;
		//#if MC >= 1.21.9
		return super.mouseReleased(e);
		//#else
		//$ return super.mouseReleased(e.x(), e.y(), e.button());
		//#endif
	}

	/** The wheel zooms in and out around the point under the mouse. */
	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//$ 	double h = 0;
	//#endif
		if (v == 0) return false;
		zoomAt(x, y, v > 0 ? 1.25f : 0.8f);
		return true;
	}

	void zoomAt(double x, double y, float by) {
		if (aw == 0) {
			zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * by));
			return;
		}
		double px = wx(x), pz = wz(y);
		zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * by));
		// the point under the mouse stays under it
		centerX = px - (x - ox - aw / 2.0) / zoom;
		centerZ = pz - (y - oy - ah / 2.0) / zoom;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		boolean typing = name != null && name.isFocused();
		if (typing && (e.key() == InputConstants.KEY_RETURN || e.key() == InputConstants.KEY_NUMPADENTER)) {
			name.setFocused(false);
			setFocused(null);
			return true;
		}
		if (!typing && key != null && key.matches(e)) {
			onClose();
			return true;
		}
		if (!typing && e.key() == InputConstants.KEY_SPACE) {
			centerOnPlayer();
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
		//#endif
	}

	@Override
	public void onClose() {
		// the zoom stays for the next time
		if (SlashHud.config.worldMapZoom != zoom) {
			SlashHud.config.worldMapZoom = zoom;
			SlashHud.config.save();
		}
		super.onClose();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		g.fill(0, 0, width, height, 0xE0000000);
	}
}
