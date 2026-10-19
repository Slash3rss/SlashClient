package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * The waypoints of this world: add one where you stand, show or hide, recolour, delete, share with
 * friends. "Received" lists points friends shared for other servers or worlds, to accept or drop.
 */
public class WaypointsScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final List<Hit> hits = new ArrayList<>();
	private EditBox name;
	private int px, py, pw, ph, scroll;
	/** The friends' points waiting to be accepted, instead of this world's. */
	private boolean received;
	/** Room for "share where I stand" next to Add (with SlashClient friends only). */
	private int shareW;
	private static final int ROW = 22;

	public WaypointsScreen() {
		super(Component.translatable("slashclient-hud.waypoints"));
	}

	/** Opens on the friends' received points (from a toast's hint, or the screenshot test). */
	public WaypointsScreen(boolean received) {
		this();
		this.received = received;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 360);
		ph = Math.min(height - 24, 260);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		shareW = dev.slash3rss.slashclient.hud.social.Social.available() ? 24 : 0;
		name = new EditBox(font, px + 16, py + ph - 26, pw - 32 - 96 - shareW, 12, Component.translatable("slashclient-hud.waypoints.name"));
		name.setBordered(false);
		name.setTextColor(Ui.TEXT);
		name.setMaxLength(32);
		name.setHint(Component.translatable("slashclient-hud.waypoints.name"));
		addRenderableWidget(name);
	}

	private void add() {
		if (minecraft.player == null) return;
		Waypoints.add(minecraft, name.getValue());
		name.setValue("");
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("waypoints", px, py, pw, ph);
		Ui.icon(g, "m-waypoints", px + 14, py + 11, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.trBold("slashclient-hud.waypoints"), px + 30, py + 12, Ui.TEXT);
		Ui.button(g, "wp:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		// the friends' points: a tab next to Close while there are any
		int waiting = dev.slash3rss.slashclient.hud.social.SharedWaypoints.pending().size();
		if (waiting > 0 || received) {
			Component tab = Ui.tr(received ? "slashclient-hud.share.back" : "slashclient-hud.share.received", waiting);
			int tw = Ui.buttonWidth(tab, received ? "back" : "share", 18, 3);
			Ui.button(g, "wp:received", px + pw - 30 - tw, py + 7, tw, 18, received ? "back" : "share", tab, !received, mx, my);
			hits.add(new Hit(px + pw - 30 - tw, py + 7, tw, 18, () -> {
				received = !received;
				scroll = 0;
			}));
		}
		g.fill(px + 1, py + 31, px + pw - 1, py + 32, Ui.BORDER);
		name.visible = !received;
		if (received) {
			drawReceived(g, mx, my);
			Ui.end();
			super.extractRenderState(g, mx, my, delta);
			return;
		}
		boolean canShare = dev.slash3rss.slashclient.hud.social.SharedWaypoints.canShare(minecraft);

		List<Waypoints.Point> list = Waypoints.here(minecraft);
		int top = py + 38, bottom = py + ph - 38;
		if (list.isEmpty()) Ui.centered(g, Ui.fit(Ui.tr("slashclient-hud.waypoints.none"), pw - 30), px + pw / 2, top + 30, Ui.MUTED);
		int fit = (bottom - top) / ROW;
		scroll = Math.max(0, Math.min(scroll, Math.max(0, list.size() - fit)));
		String dim = Waypoints.dimension(minecraft);
		for (int i = scroll; i < Math.min(list.size(), scroll + fit); i++) {
			Waypoints.Point p = list.get(i);
			int y = top + (i - scroll) * ROW, rx = px + 10, rw = pw - 20;
			Ui.round(g, rx, y, rw, ROW - 3, 4, Ui.CARD);
			// the colour dot changes colour on click
			Ui.round(g, rx + 6, y + 5, 9, 9, 4, p.color);
			hits.add(new Hit(rx + 4, y + 2, 13, 15, () -> {
				int next = 0;
				for (int c = 0; c < Waypoints.COLORS.length; c++) if (Waypoints.COLORS[c] == p.color) next = (c + 1) % Waypoints.COLORS.length;
				p.color = Waypoints.COLORS[next];
				Waypoints.save();
			}));
			boolean otherDim = !dim.equals(p.dimension);
			String where = p.x + " " + p.y + " " + p.z + (otherDim ? "" : "  ·  " + Math.round(Waypoints.distance(minecraft, p)) + " m");
			int shareRoom = canShare ? 24 : 0;
			Component title = p.from == null ? Ui.bold(p.name) : Ui.bold(p.name).append(Ui.tr("slashclient-hud.share.from", p.from).withStyle(s -> s.withBold(false).withColor(Ui.MUTED & 0xFFFFFF)));
			Ui.draw(g, Ui.fit(title, rw - 150 - shareRoom), rx + 22, y + 6, p.visible ? Ui.TEXT : Ui.MUTED);
			Ui.draw(g, Ui.fit(Ui.text(where), 110), rx + rw - 62 - shareRoom - Math.min(110, Ui.width(Ui.text(where))), y + 6, otherDim ? Ui.MUTED : Ui.TEXT_2);
			if (canShare) {
				Ui.button(g, "wp:share:" + i, rx + rw - 72, y + 1, 22, ROW - 5, "share", Component.empty(), false, mx, my);
				hits.add(new Hit(rx + rw - 72, y + 1, 22, ROW - 5, () -> minecraft.setScreenAndShow(dev.slash3rss.slashclient.hud.social.PickFriendsScreen.shareWaypoint(this, p))));
			}
			Ui.button(g, "wp:eye:" + i, rx + rw - 48, y + 1, 22, ROW - 5, p.visible ? "check" : "close", Component.empty(), false, mx, my);
			hits.add(new Hit(rx + rw - 48, y + 1, 22, ROW - 5, () -> {
				p.visible = !p.visible;
				Waypoints.save();
			}));
			Ui.button(g, "wp:del:" + i, rx + rw - 24, y + 1, 22, ROW - 5, "reset", Component.empty(), false, mx, my);
			hits.add(new Hit(rx + rw - 24, y + 1, 22, ROW - 5, () -> {
				list.remove(p);
				Waypoints.save();
			}));
		}

		// the name field and "Add here"
		int fy = py + ph - 32;
		Ui.round(g, px + 10, fy, pw - 20 - 96 - shareW, 20, 4, Ui.CARD);
		Ui.roundOutline(g, px + 10, fy, pw - 20 - 96 - shareW, 20, 4, name.isFocused() ? 0x993B82F6 : Ui.BORDER);
		// where I stand, to friends (named as typed, or "Here")
		if (shareW > 0) {
			int sx = px + pw - 102 - shareW;
			Ui.button(g, "wp:shareHere", sx, fy, 20, 20, "share", Component.empty(), false, mx, my);
			if (canShare && minecraft.player != null) hits.add(new Hit(sx, fy, 20, 20, () ->
				minecraft.setScreenAndShow(dev.slash3rss.slashclient.hud.social.PickFriendsScreen.shareWaypoint(this, dev.slash3rss.slashclient.hud.social.SharedWaypoints.here(minecraft, name.getValue())))));
		}
		Component add = Ui.tr("slashclient-hud.waypoints.add");
		Ui.button(g, "wp:add", px + pw - 102, fy, 92, 20, "check", add, true, mx, my);
		hits.add(new Hit(px + pw - 102, fy, 92, 20, this::add));
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	/** Points friends shared for another server or world: accept (into that world's list) or drop. */
	private void drawReceived(GuiGraphicsExtractor g, int mx, int my) {
		List<dev.slash3rss.slashclient.hud.social.SharedWaypoints.Received> list = dev.slash3rss.slashclient.hud.social.SharedWaypoints.pending();
		int top = py + 38, bottom = py + ph - 10;
		if (list.isEmpty()) Ui.centered(g, Ui.fit(Ui.tr("slashclient-hud.share.noneReceived"), pw - 30), px + pw / 2, top + 30, Ui.MUTED);
		int fit = (bottom - top) / ROW;
		scroll = Math.max(0, Math.min(scroll, Math.max(0, list.size() - fit)));
		for (int i = scroll; i < Math.min(list.size(), scroll + fit); i++) {
			var r = list.get(i);
			int y = top + (i - scroll) * ROW, rx = px + 10, rw = pw - 20;
			Ui.round(g, rx, y, rw, ROW - 3, 4, Ui.CARD);
			Ui.icon(g, "m-waypoints", rx + 6, y + 5, 9, Ui.ACCENT_LIGHT);
			Component where = Ui.tr("slashclient-hud.share.fromWhere", r.from, dev.slash3rss.slashclient.hud.social.SharedWaypoints.worldName(r.world));
			int ww = Math.min(Ui.width(where), rw / 2 - 30);
			Ui.draw(g, Ui.fit(Ui.bold(r.name), rw - 80 - ww), rx + 22, y + 6, Ui.TEXT);
			Ui.draw(g, Ui.fit(where, ww), rx + rw - 54 - ww, y + 6, Ui.MUTED);
			Ui.button(g, "wp:accept:" + i, rx + rw - 48, y + 1, 22, ROW - 5, "check", Component.empty(), true, mx, my);
			hits.add(new Hit(rx + rw - 48, y + 1, 22, ROW - 5, () -> dev.slash3rss.slashclient.hud.social.SharedWaypoints.accept(r)));
			Ui.button(g, "wp:drop:" + i, rx + rw - 24, y + 1, 22, ROW - 5, "close", Component.empty(), false, mx, my);
			hits.add(new Hit(rx + rw - 24, y + 1, 22, ROW - 5, () -> dev.slash3rss.slashclient.hud.social.SharedWaypoints.dismiss(r)));
		}
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
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
		return false;
	}

	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//$ 	double h = 0;
	//#endif
		scroll = Math.max(0, scroll - (int) Math.signum(v));
		return true;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		if ((e.key() == InputConstants.KEY_RETURN || e.key() == InputConstants.KEY_NUMPADENTER) && name.isFocused() && !received) {
			add();
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
		//#endif
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		g.fill(0, 0, width, height, 0x50000000);
	}
}
