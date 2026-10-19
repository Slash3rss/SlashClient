package dev.slash3rss.slashclient.hud.social;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;

/**
 * Picks friends for something sent to several at once: a waypoint, or a party invite to this
 * server. For a party it also shows the party the player is in: who accepted, and Disband (the
 * leader) or Leave.
 */
public class PickFriendsScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private static final int ROW = 22;
	private final Screen parent;
	private final String icon;
	private final Component subtitle;
	private final Component confirm;
	private final int max;
	private final Consumer<List<String>> onConfirm;
	private final boolean party;
	private final Set<String> picked = new LinkedHashSet<>();
	/** Friends not offered (already in the group they are added to). */
	private Set<String> skip = Set.of();
	private final List<Hit> hits = new ArrayList<>();
	private int px, py, pw, ph, scroll;

	public PickFriendsScreen(Screen parent, Component title, String icon, Component subtitle, Component confirm, int max, boolean party, Consumer<List<String>> onConfirm) {
		super(title);
		this.parent = parent;
		this.icon = icon;
		this.subtitle = subtitle;
		this.confirm = confirm;
		this.max = max;
		this.party = party;
		this.onConfirm = onConfirm;
		if (party) Party.refresh();
	}

	/** Sharing one waypoint with friends. */
	public static PickFriendsScreen shareWaypoint(Screen parent, dev.slash3rss.slashclient.hud.Waypoints.Point p) {
		return new PickFriendsScreen(parent, Component.translatable("slashclient-hud.share.pointTitle", p.name), "share",
			Component.translatable("slashclient-hud.share.subtitle", p.x + " " + p.y + " " + p.z), Component.translatable("slashclient-hud.share.send"),
			SharedWaypoints.MAX_FRIENDS, false, ids -> SharedWaypoints.send(p, ids));
	}

	/** A party invite to the server this game is on. */
	public static PickFriendsScreen party(Screen parent) {
		String server = Social.currentServer();
		return new PickFriendsScreen(parent, Component.translatable("slashclient-hud.party"), "m-friends",
			server == null ? Component.translatable("slashclient-hud.party.noServer") : Component.translatable("slashclient-hud.party.subtitle", server),
			Component.translatable("slashclient-hud.party.invite"), Party.SIZE - 1, true, Party::create);
	}

	/** A new group chat with the friends picked; it opens in the friends window when the server made it. */
	public static PickFriendsScreen newGroup(Screen parent) {
		return new PickFriendsScreen(parent, Component.translatable("slashclient-hud.groups.new"), "m-players",
			Component.translatable("slashclient-hud.groups.subtitle"), Component.translatable("slashclient-hud.groups.create"), Groups.SIZE - 1, false,
			ids -> Groups.create(ids, id -> net.minecraft.client.Minecraft.getInstance().execute(() -> {
				if (dev.slash3rss.slashclient.hud.Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof FriendsScreen f) f.selectGroup(id);
			})));
	}

	/** More friends into a group chat (those already in it are not listed). */
	public static PickFriendsScreen addToGroup(Screen parent, Groups.Group group) {
		PickFriendsScreen s = new PickFriendsScreen(parent, Component.translatable("slashclient-hud.groups.addTitle", group.name()), "m-players",
			Component.translatable("slashclient-hud.groups.subtitle"), Component.translatable("slashclient-hud.groups.add"), Groups.SIZE - group.members().size(), false,
			ids -> Groups.add(group.id(), ids));
		Set<String> in = new java.util.HashSet<>();
		for (Groups.Member m : group.members()) in.add(m.id());
		s.skip = in;
		return s;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 320);
		ph = Math.min(height - 24, 280);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
	}

	private boolean canConfirm() {
		return !picked.isEmpty() && (!party || Social.currentServer() != null);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("pick friends", px, py, pw, ph);
		Ui.icon(g, icon, px + 14, py + 11, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(getTitle().copy().withStyle(Ui.bold("").getStyle()), pw - 70), px + 30, py + 12, Ui.TEXT);
		Ui.button(g, "pick:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		Ui.draw(g, Ui.fit(subtitle.copy().withStyle(Ui.text("").getStyle()), pw - 28), px + 14, py + 27, Ui.MUTED);
		g.fill(px + 1, py + 39, px + pw - 1, py + 40, Ui.BORDER);

		int top = py + 46;
		if (party) top = drawParty(g, top, mx, my);

		List<Social.Friend> friends = Social.friends().stream().filter(f -> !skip.contains(f.id())).toList();
		int bottom = py + ph - 34;
		if (friends.isEmpty()) Ui.centered(g, Ui.fit(Ui.tr("slashclient-hud.friends.none"), pw - 30), px + pw / 2, top + 20, Ui.MUTED);
		int fit = Math.max(1, (bottom - top) / ROW);
		scroll = Math.max(0, Math.min(scroll, Math.max(0, friends.size() - fit)));
		for (int i = scroll; i < Math.min(friends.size(), scroll + fit); i++) {
			Social.Friend f = friends.get(i);
			int y = top + (i - scroll) * ROW, rx = px + 10, rw = pw - 20;
			boolean on = picked.contains(f.id());
			boolean full = !on && picked.size() >= max;
			boolean over = Ui.inside(mx, my, rx, y, rw, ROW - 3);
			float t = Ui.hover("pick:" + f.id(), over && !full);
			Ui.round(g, rx, y, rw, ROW - 3, 4, on ? 0xFF1C2B4A : Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
			// the tick box
			Ui.round(g, rx + 6, y + 4, 11, 11, 3, on ? Ui.ACCENT : Ui.PANEL);
			Ui.roundOutline(g, rx + 6, y + 4, 11, 11, 3, on ? Ui.ACCENT_LIGHT : Ui.BORDER);
			if (on) Ui.icon(g, "check", rx + 7, y + 5, 9, 0xFFFFFFFF);
			int nameW = Math.min(Ui.width(Ui.bold(f.name())), rw / 2);
			Ui.draw(g, Ui.fit(Ui.bold(f.name()), rw / 2), rx + 24, y + 6, full ? Ui.MUTED : Ui.TEXT);
			Ui.draw(g, Ui.fit(Social.activity(f).copy().withStyle(Ui.text("").getStyle()), rw - 36 - nameW), rx + 30 + nameW, y + 6, Ui.MUTED);
			String id = f.id();
			if (!full) hits.add(new Hit(rx, y, rw, ROW - 3, () -> {
				if (!picked.remove(id)) picked.add(id);
			}));
		}

		// how many, and the button
		int fy = py + ph - 28;
		Ui.draw(g, Ui.text(picked.size() + " / " + max), px + 14, fy + 6, Ui.MUTED);
		int bw = Ui.buttonWidth(confirm, party ? "play" : "share", 20, 4);
		Ui.button(g, "pick:ok", px + pw - 10 - bw, fy, bw, 20, party ? "play" : "share", confirm, canConfirm(), mx, my);
		if (canConfirm()) hits.add(new Hit(px + pw - 10 - bw, fy, bw, 20, () -> {
			onConfirm.accept(List.copyOf(picked));
			onClose();
		}));
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	/** The party the player is in: its server, who is in, and Disband or Leave; returns where the list starts. */
	private int drawParty(GuiGraphicsExtractor g, int top, int mx, int my) {
		Party.Info p = Party.current();
		if (p == null) return top;
		int rx = px + 10, rw = pw - 20, h = 44;
		Ui.round(g, rx, top, rw, h, 5, Ui.CARD);
		Ui.roundOutline(g, rx, top, rw, h, 5, 0x663B82F6);
		Component head = p.mine() ? Ui.trBold("slashclient-hud.party.yours") : Ui.trBold("slashclient-hud.party.of", p.leaderName());
		Component action = Ui.tr(p.mine() ? "slashclient-hud.party.disband" : "slashclient-hud.party.leave");
		int aw = Ui.buttonWidth(action, "close", 16, 3);
		Ui.draw(g, Ui.fit(head, rw - aw - 20), rx + 8, top + 6, Ui.TEXT);
		Component where = Ui.text(p.server() + "  ·  " + Component.translatable("slashclient-hud.party.count", p.accepted(), p.members().size()).getString());
		Ui.draw(g, Ui.fit(where, rw - aw - 20), rx + 8, top + 17, Ui.TEXT_2);
		Ui.button(g, "pick:party", rx + rw - aw - 6, top + 6, aw, 16, "close", action, false, mx, my);
		String id = p.id();
		boolean mine = p.mine();
		hits.add(new Hit(rx + rw - aw - 6, top + 6, aw, 16, () -> {
			if (mine) Party.disband(id);
			else Party.leave(id);
		}));
		// each member as a dot in the colour of their answer, with the name
		int x = rx + 8;
		for (Party.Member m : p.members()) {
			int color = switch (m.status()) {
				case "accepted" -> Ui.GREEN;
				case "invited" -> 0xFFFACC15;
				default -> Ui.MUTED;
			};
			Component name = Ui.text(m.name());
			int w = Ui.width(name) + 12;
			if (x + w > rx + rw - 6) break;
			Ui.round(g, x, top + 31, 5, 5, 2, color);
			Ui.draw(g, name, x + 8, top + 30, "accepted".equals(m.status()) ? Ui.TEXT : Ui.MUTED);
			x += w + 6;
		}
		return top + h + 6;
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
		if (e.button() != InputConstants.MOUSE_BUTTON_LEFT) return false;
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
		if ((e.key() == InputConstants.KEY_RETURN || e.key() == InputConstants.KEY_NUMPADENTER) && canConfirm()) {
			onConfirm.accept(List.copyOf(picked));
			onClose();
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
		minecraft.setScreenAndShow(parent);
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
