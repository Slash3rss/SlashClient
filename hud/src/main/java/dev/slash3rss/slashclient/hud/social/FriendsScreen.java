package dev.slash3rss.slashclient.hud.social;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Friends and chat in the game, in the launcher's look: the friends list with statuses on the
 * left, the conversation on the right, Enter sends. The game keeps running behind it.
 */
public class FriendsScreen extends Screen {
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault());
	private static final int LIST_W = 136;
	private static final int ROW_H = 26;
	private static final int INPUT_H = 20;

	private final Screen parent;
	private EditBox input;
	private String selected;
	/** A group chat (or the clan's) open instead of a friend's conversation. */
	private String selectedGroup;
	/** The clan's members instead of its chat. */
	private boolean showMembers;
	/** A community's channel open instead (communities are managed in the launcher; here: chat and a look at members). */
	private String selectedCommunity, selectedChannel;
	/** The community's first members instead of its chat. */
	private boolean showCommunityMembers;
	/** Messages scrolled up from the newest, in pixels. */
	private int scroll;
	private int maxScroll;
	private record Hit(int x, int y, int w, int h, Runnable action) {}
	/** A button in a chat's header. */
	private record Action(String id, String icon, Component label, Runnable run) {}
	private final List<Hit> hits = new ArrayList<>();
	/** What the button under the mouse does, drawn last. */
	private Component tooltip;
	/** Where each message is on screen this frame, for the right-click menu (one of the three is set). */
	private record Bubble(int x, int y, int w, int h, Social.Message direct, Groups.Message group, Communities.Message community) {
		Bubble(int x, int y, int w, int h, Social.Message direct, Groups.Message group) {
			this(x, y, w, h, direct, group, null);
		}

		long id() {
			return direct != null ? direct.id() : group != null ? group.id() : community.id();
		}
	}
	private final List<Bubble> bubbles = new ArrayList<>();
	/** The rectangle of the card drawPicture/drawInvite/drawWaypoint just drew (null when it was out of sight). */
	private int[] lastCard;
	/** A row of the right-click menu by a message. */
	private record MenuRow(String icon, Component label, boolean danger, Runnable run) {}
	/** The open right-click menu (null: none), where it is. */
	private List<MenuRow> menu;
	private int menuX, menuY;
	private static final int MENU_ROW = 15;
	/** The message being edited in the field instead of a new one (-1: none), and whose conversation it is. */
	private long editingId = -1;
	private String editingFriend, editingGroup, editingCommunity, editingChannel;

	// the panel, recomputed on every resize
	private int px, py, pw, ph;

	public FriendsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.friends"));
		this.parent = parent;
		selected = Social.viewing;
		selectedGroup = selected == null ? Groups.viewing : null;
		// a community's channel that was open
		if (selected == null && selectedGroup == null && Communities.viewing != null) {
			for (Communities.Community c : Communities.list()) {
				if (c.channel(Communities.viewing) != null) {
					selectedCommunity = c.id();
					selectedChannel = Communities.viewing;
				}
			}
		}
		Party.refresh();
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 460);
		ph = Math.min(height - 24, 300);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		int chatX = px + LIST_W + 1;
		// borderless text on our own rounded field (drawn in drawChat), like the editor's search
		input = new EditBox(font, chatX + 16, py + ph - INPUT_H - 8 + 6, pw - LIST_W - 1 - 32 - 30 - 24, 12, Component.translatable("slashclient-hud.friends.write"));
		input.setBordered(false);
		input.setTextColor(Ui.TEXT);
		input.setMaxLength(2000);
		input.setHint(Component.translatable("slashclient-hud.friends.write"));
		input.visible = selected != null || selectedGroup != null || selectedCommunity != null;
		addRenderableWidget(input);
		if (input.visible) setInitialFocus(input);
	}

	private void select(String id) {
		stopEditing();
		menu = null;
		selected = id;
		selectedGroup = null;
		Groups.viewing = null;
		selectedCommunity = null;
		Communities.viewing = null;
		scroll = 0;
		Social.open(id);
		input.visible = true;
		setFocused(input);
		input.setFocused(true);
	}

	/** Opens a group chat (or the clan's) in place of a friend's conversation. */
	public void selectGroup(String id) {
		stopEditing();
		menu = null;
		selectedGroup = id;
		selected = null;
		Social.viewing = null;
		selectedCommunity = null;
		Communities.viewing = null;
		showMembers = false;
		scroll = 0;
		Groups.open(id);
		input.visible = true;
		setFocused(input);
		input.setFocused(true);
	}

	/** Opens a community's channel (its general one when `channelId` is null) in place of a chat. Public for the in-game test. */
	public void selectCommunity(String communityId, String channelId) {
		Communities.Community c = Communities.community(communityId);
		Communities.Channel ch = c == null ? null : channelId != null ? c.channel(channelId) : c.general();
		if (ch == null) return;
		stopEditing();
		menu = null;
		selectedCommunity = communityId;
		selectedChannel = ch.id();
		selected = null;
		selectedGroup = null;
		Social.viewing = null;
		Groups.viewing = null;
		showCommunityMembers = false;
		scroll = 0;
		Communities.open(communityId, ch.id());
		input.visible = true;
		setFocused(input);
		input.setFocused(true);
	}

	/** The community's members instead of its chat, or back (the test uses it too). */
	public void toggleCommunityMembers() {
		showCommunityMembers = !showCommunityMembers;
		if (showCommunityMembers && selectedCommunity != null) Communities.loadMembers(selectedCommunity);
		else setFocused(input);
	}

	/** The clan's members instead of its chat, or back (the header's button; the test uses it too). */
	public void toggleMembers() {
		showMembers = !showMembers;
	}

	private void send() {
		// the field holds a message being edited: its new text goes instead of a new message
		if (editingId >= 0) {
			if (input.getValue().isBlank()) return;
			if (editingCommunity != null) Communities.edit(editingCommunity, editingChannel, editingId, input.getValue());
			else if (editingGroup != null) Groups.edit(editingGroup, editingId, input.getValue());
			else Social.edit(editingFriend, editingId, input.getValue());
			stopEditing();
			return;
		}
		if (selectedCommunity != null && !input.getValue().isBlank()) {
			Communities.send(selectedCommunity, selectedChannel, input.getValue());
			input.setValue("");
			scroll = 0;
			return;
		}
		if (selectedGroup != null && !input.getValue().isBlank()) {
			Groups.send(selectedGroup, input.getValue());
			input.setValue("");
			scroll = 0;
			return;
		}
		if (selected == null || input.getValue().isBlank()) return;
		Social.send(selected, input.getValue());
		input.setValue("");
		scroll = 0;
	}

	// ---------- editing and deleting messages (servers 0.9.23+) ----------

	/** Puts our message's text in the field; Enter saves it, Esc lets go. Public for the in-game test. */
	public void startEditing(String friendId, String groupId, long id, String text) {
		menu = null;
		editingId = id;
		editingFriend = friendId;
		editingGroup = groupId;
		input.setValue(text);
		input.visible = true;
		setFocused(input);
		input.setFocused(true);
		scroll = 0;
	}

	/** The same for our message in a community's channel. */
	public void startEditingCommunity(String communityId, String channelId, long id, String text) {
		startEditing(null, null, id, text);
		editingCommunity = communityId;
		editingChannel = channelId;
	}

	private void stopEditing() {
		if (editingId < 0) return;
		editingId = -1;
		editingFriend = editingGroup = editingCommunity = editingChannel = null;
		if (input != null) input.setValue("");
	}

	/** The right-click menu for a message: edit (ours, for a while), copy (text), delete (ours, or as the group's moderator). */
	private List<MenuRow> menuFor(Bubble b) {
		List<MenuRow> rows = new ArrayList<>();
		if (b.direct() != null) {
			Social.Message m = b.direct();
			String other = m.from().equals(Social.myId()) ? m.to() : m.from();
			if (Social.canEdit(m)) rows.add(new MenuRow("pen", Ui.tr("slashclient-hud.message.edit"), false, () -> startEditing(other, null, m.id(), m.text())));
			if (m.plainText()) rows.add(new MenuRow("copy", Ui.tr("slashclient-hud.message.copy"), false, () -> minecraft.keyboardHandler.setClipboard(m.text())));
			if (Social.canDelete(m)) rows.add(new MenuRow("trash", Ui.tr("slashclient-hud.message.delete"), true, () -> confirmDelete(() -> Social.delete(other, m.id()))));
		} else if (b.community() != null) {
			// a community's message: edit ours for a while, copy, delete (ours, or below our role), report others'
			Communities.Message m = b.community();
			if (Communities.canEdit(m)) rows.add(new MenuRow("pen", Ui.tr("slashclient-hud.message.edit"), false, () -> startEditingCommunity(m.community(), m.channel(), m.id(), m.text())));
			if (m.plainText()) rows.add(new MenuRow("copy", Ui.tr("slashclient-hud.message.copy"), false, () -> minecraft.keyboardHandler.setClipboard(m.text())));
			// the quick reactions in the same menu, one row away (server 0.9.27+)
			if (Communities.canReact(m)) rows.add(new MenuRow("m-emotes", Ui.tr("slashclient-hud.communities.reactions"), false, () -> reactMenu(m)));
			if (Communities.canDelete(m)) {
				boolean theirs = !m.from().equals(Social.myId());
				rows.add(new MenuRow("trash", Ui.tr(theirs ? "slashclient-hud.message.deleteModeration" : "slashclient-hud.message.delete"), true, () -> confirmDelete(() -> Communities.delete(m.community(), m.channel(), m.id()))));
			}
			if (Communities.canReport(m)) rows.add(new MenuRow("info", Ui.tr("slashclient-hud.message.report"), true, () -> Communities.report(m.community(), m.channel(), m.id())));
		} else {
			Groups.Message m = b.group();
			if (Groups.canEdit(m)) rows.add(new MenuRow("pen", Ui.tr("slashclient-hud.message.edit"), false, () -> startEditing(null, m.group(), m.id(), m.text())));
			if (m.plainText()) rows.add(new MenuRow("copy", Ui.tr("slashclient-hud.message.copy"), false, () -> minecraft.keyboardHandler.setClipboard(m.text())));
			if (Groups.canDelete(m)) {
				boolean theirs = !m.from().equals(Social.myId());
				rows.add(new MenuRow("trash", Ui.tr(theirs ? "slashclient-hud.message.deleteModeration" : "slashclient-hud.message.delete"), true, () -> confirmDelete(() -> Groups.delete(m.group(), m.id()))));
			}
		}
		return rows;
	}

	/** The quick reactions in place of the menu: ours taken off, the others added. */
	private void reactMenu(Communities.Message m) {
		List<MenuRow> rows = new ArrayList<>();
		for (String emoji : Communities.QUICK) {
			boolean had = m.reactions().stream().anyMatch(r -> r.emoji().equals(emoji) && r.me());
			rows.add(new MenuRow("m-emotes", Ui.tr(had ? "slashclient-hud.communities.unreact" : "slashclient-hud.communities.react", Communities.glyph(emoji)), false, () -> Communities.react(m, emoji)));
		}
		rows.add(new MenuRow("close", Ui.tr("slashclient-hud.message.cancel"), false, () -> {}));
		menu = rows;
	}

	/** Deleting asks once more, in the same menu. */

	private void confirmDelete(Runnable delete) {
		menu = List.of(new MenuRow("trash", Ui.tr("slashclient-hud.message.deleteSure"), true, () -> {
			if (editingId >= 0) stopEditing();
			delete.run();
		}), new MenuRow("close", Ui.tr("slashclient-hud.message.cancel"), false, () -> {}));
	}

	/** Opens the menu of the message at this point, as a right click does; false when there is none (or nothing to do). Public for the in-game test. */
	public boolean openMenuAt(int x, int y) {
		for (Bubble b : List.copyOf(bubbles)) {
			if (!Ui.inside(x, y, b.x(), b.y(), b.w(), b.h())) continue;
			List<MenuRow> rows = menuFor(b);
			if (rows.isEmpty()) return false;
			menu = rows;
			menuX = x;
			menuY = y;
			return true;
		}
		return false;
	}

	/** Where a message is drawn now (the in-game test right-clicks it); null when it is not in sight. */
	public int[] bubbleOf(long id) {
		for (Bubble b : List.copyOf(bubbles)) {
			if (b.id() == id) return new int[] { b.x(), b.y(), b.w(), b.h() };
		}
		return null;
	}

	/** For the in-game test: the open menu's rows ("" each when closed: an empty list), and where a row's middle is. */
	public List<String> menuForTest() {
		return menu == null ? List.of() : menu.stream().map(r -> r.label().getString()).toList();
	}

	public double[] menuRowForTest(int index) {
		int[] box = menuBox();
		return new double[] { box[0] + box[2] / 2.0, box[1] + 3 + index * MENU_ROW + MENU_ROW / 2.0 };
	}

	/** For the in-game test: the message being edited (-1: none) and the field's text. */
	public long editingForTest() {
		return editingId;
	}

	public String inputForTest() {
		return input.getValue();
	}

	/** The menu's rows by the mouse, kept inside the window; returns {x, y, w}. */
	private int[] menuBox() {
		int w = 0;
		for (MenuRow r : menu) w = Math.max(w, Ui.width(r.label()));
		w += 30;
		int h = menu.size() * MENU_ROW + 6;
		int x = Math.max(px + 4, Math.min(menuX, px + pw - w - 4));
		int y = Math.max(py + 4, Math.min(menuY, py + ph - h - 4));
		return new int[] { x, y, w, h };
	}

	private void drawMenu(GuiGraphicsExtractor g, int mx, int my) {
		if (menu == null) return;
		// over the bubbles' text too
		overEverything(g);
		int[] box = menuBox();
		int x = box[0], y = box[1], w = box[2], h = box[3];
		Ui.round(g, x, y, w, h, 5, 0xFF111622);
		Ui.roundOutline(g, x, y, w, h, 5, 0x40FFFFFF);
		int ry = y + 3;
		for (MenuRow r : menu) {
			boolean over = Ui.inside(mx, my, x + 3, ry, w - 6, MENU_ROW);
			if (over) Ui.round(g, x + 3, ry, w - 6, MENU_ROW, 3, r.danger() ? 0x33EF4444 : 0x1AFFFFFF);
			int color = r.danger() ? 0xFFF87171 : Ui.TEXT;
			Ui.icon(g, r.icon(), x + 8, ry + 4, 8, color);
			Ui.draw(g, r.label(), x + 21, ry + 4, color);
			ry += MENU_ROW;
		}
	}

	/** What is drawn next covers what came before, text included (1.21.6+ draws in layers, older versions by depth). */
	private static void overEverything(GuiGraphicsExtractor g) {
		Ui.layer(g);
		//#if MC >= 1.21.6
		g.nextStratum();
		//#endif
	}

	/** A click while the menu is open: a row runs, anywhere else closes it. */
	private void clickMenu(double mx, double my) {
		int[] box = menuBox();
		List<MenuRow> rows = menu;
		menu = null;
		int ry = box[1] + 3;
		for (MenuRow r : rows) {
			if (Ui.inside(mx, my, box[0] + 3, ry, box[2] - 6, MENU_ROW)) {
				r.run().run();
				return;
			}
			ry += MENU_ROW;
		}
	}

	/** The time under a bubble, "(edytowano) 12:30" for an edited one (its time when hovered). */
	private Component timeOf(long at, long editedAt) {
		Component time = Ui.text(TIME.format(Instant.ofEpochMilli(at)));
		return editedAt > 0 ? Ui.tr("slashclient-hud.message.edited").append(" ").append(time) : time;
	}

	/** The part of a card inside the scroll area, as {x, y, w, h}; null when none of it is. */
	private static int[] visible(int x, int y, int w, int h, int top, int bottom) {
		int y0 = Math.max(y, top), y1 = Math.min(y + h, bottom);
		return y1 > y0 ? new int[] { x, y0, w, y1 - y0 } : null;
	}

	/** A deleted message: a muted outline with "Message deleted". Returns the bubble's width. */
	private int tombstoneWidth() {
		return Ui.width(Ui.tr("slashclient-hud.message.deleted")) + 26;
	}

	private void drawTombstone(GuiGraphicsExtractor g, int x, int y) {
		int w = tombstoneWidth();
		Ui.roundOutline(g, x, y, w, 16, 5, 0x33FFFFFF);
		Ui.icon(g, "ban", x + 6, y + 4, 8, Ui.MUTED);
		Ui.draw(g, Ui.tr("slashclient-hud.message.deleted").withStyle(net.minecraft.ChatFormatting.ITALIC), x + 18, y + 4, Ui.MUTED);
	}

	// ---------- drawing ----------

	private static int statusColor(String status) {
		return switch (status) {
			case "online" -> Ui.GREEN;
			case "idle" -> 0xFFFACC15;
			case "dnd" -> Ui.DANGER;
			default -> Ui.MUTED;
		};
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		bubbles.clear();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("friends panel", px, py, pw, ph);
		// closing without Esc, as in the HUD window
		Ui.button(g, "friends:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		if (!Social.available() || !Social.signedIn() || !Social.reachable()) {
			String key = !Social.available() ? "slashclient-hud.friends.noLauncher"
				: !Social.reachable() ? "slashclient-hud.friends.connecting" : "slashclient-hud.friends.signIn";
			Ui.icon(g, "user", px + pw / 2 - 8, py + ph / 2 - 30, 16, Ui.ACCENT_LIGHT);
			int ty = py + ph / 2 - 6;
			for (FormattedCharSequence line : font.split(Ui.tr(key), pw - 60)) {
				g.text(font, line, px + (pw - font.width(line)) / 2, ty, Ui.TEXT_2, false);
				ty += 11;
			}
			Ui.end();
			super.extractRenderState(g, mx, my, delta);
			return;
		}
		drawList(g, mx, my);
		g.fill(px + LIST_W, py + 8, px + LIST_W + 1, py + ph - 8, Ui.BORDER);
		drawChat(g, mx, my);
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
		// a message's menu and the tooltip over everything, the field too (with the menu open, no tooltip under it)
		if (menu != null) tooltip = null;
		Ui.begin("friends panel", px, py, pw, ph);
		drawTooltip(g, mx, my);
		drawMenu(g, mx, my);
		Ui.end();
	}

	private void drawList(GuiGraphicsExtractor g, int mx, int my) {
		List<Social.Friend> friends = Social.friends();
		int titleW = LIST_W - 20;
		// a party: several friends invited here at once (or the one the player is in)
		int bx = px + LIST_W - 26;
		if (!friends.isEmpty() && (Social.currentServer() != null || Party.current() != null)) {
			Ui.button(g, "friends:party", bx, py + 6, 20, 16, "m-friends", Component.empty(), Party.current() != null, mx, my);
			hits.add(new Hit(bx, py + 6, 20, 16, () -> minecraft.setScreenAndShow(PickFriendsScreen.party(this))));
			bx -= 22;
			titleW -= 22;
		}
		// a new group chat with some friends
		if (!friends.isEmpty() && Social.bridged() || !Groups.groups().isEmpty()) {
			Ui.button(g, "friends:group", bx, py + 6, 20, 16, "m-players", Component.empty(), false, mx, my);
			hits.add(new Hit(bx, py + 6, 20, 16, () -> minecraft.setScreenAndShow(PickFriendsScreen.newGroup(this))));
			titleW -= 22;
		}
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.friends.title", Social.onlineCount()), titleW), px + 10, py + 10, Ui.TEXT);
		int y = py + 26;
		y = drawGroups(g, y, mx, my);
		y = drawCommunities(g, y, mx, my);
		if (friends.isEmpty() && Groups.groups().isEmpty() && Communities.list().isEmpty()) {
			int ty = y + 4;
			for (FormattedCharSequence line : font.split(Ui.tr("slashclient-hud.friends.none"), LIST_W - 20)) {
				g.text(font, line, px + 10, ty, Ui.MUTED, false);
				ty += 11;
			}
			return;
		}
		int bottom = py + ph - 8;
		for (Social.Friend f : friends) {
			if (y + ROW_H > bottom) break;
			int rx = px + 5, rw = LIST_W - 10;
			boolean over = Ui.inside(mx, my, rx, y, rw, ROW_H);
			float t = Ui.hover("friend:" + f.id(), over);
			if (f.id().equals(selected)) Ui.round(g, rx, y, rw, ROW_H, 4, 0xFF1C2B4A);
			else if (t > 0) Ui.round(g, rx, y, rw, ROW_H, 4, Ui.blend(0x00161C2A, Ui.CARD_HOVER, t));
			// avatar: the first letter on the accent, with the status dot
			Ui.round(g, rx + 4, y + 4, 18, 18, 5, Ui.ACCENT_DARK);
			Component initial = Ui.bold(f.name().isEmpty() ? "?" : f.name().substring(0, 1).toUpperCase());
			Ui.draw(g, initial, rx + 13 - Ui.width(initial) / 2, y + 9, 0xFFFFFFFF);
			Ui.round(g, rx + 16, y + 16, 7, 7, 3, Ui.PANEL);
			Ui.round(g, rx + 17, y + 17, 5, 5, 2, statusColor(f.status()));
			int textW = rw - 30 - (f.unread() > 0 ? 16 : 0);
			// live on Twitch or Kick: the red LIVE badge after the name, the stream's title under it
			FriendStreams.Live live = FriendStreams.of(f.id());
			int liveW = live != null ? FriendStreams.badgeWidth() + 3 : 0;
			// muted: a small crossed bell after the name
			Component name = Ui.fit(Ui.bold(f.name()), textW - (f.muted() ? 10 : 0) - liveW);
			Ui.draw(g, name, rx + 27, y + 4, Ui.TEXT);
			int after = rx + 29 + Ui.width(name);
			if (f.muted()) {
				Ui.icon(g, "bell-slash", after, y + 4, 7, Ui.MUTED);
				after += 10;
			}
			if (live != null) FriendStreams.badge(g, after + 1, y + 3);
			if (live != null) Ui.draw(g, Ui.fit(FriendStreams.line(live), textW), rx + 27, y + 15, FriendStreams.LINE);
			else Ui.draw(g, Ui.fit(Social.activity(f).copy().withStyle(Ui.text("").getStyle()), textW), rx + 27, y + 15, Ui.MUTED);
			if (f.unread() > 0) {
				Component n = Ui.bold(f.unread() > 9 ? "9+" : String.valueOf(f.unread()));
				int bw = Math.max(12, Ui.width(n) + 6);
				Ui.round(g, rx + rw - bw - 3, y + 8, bw, 11, 5, f.muted() ? 0xFF3A4252 : Ui.ACCENT);
				Ui.draw(g, n, rx + rw - bw - 3 + (bw - Ui.width(n)) / 2, y + 10, 0xFFFFFFFF);
			}
			String id = f.id();
			hits.add(new Hit(rx, y, rw, ROW_H, () -> select(id)));
			y += ROW_H + 2;
		}
	}

	/** The clan's chat and the group chats, above the friends; returns where the friends start. */
	private int drawGroups(GuiGraphicsExtractor g, int y, int mx, int my) {
		int bottom = py + ph - 8;
		for (Groups.Group gr : Groups.groups()) {
			if (y + ROW_H > bottom) break;
			int rx = px + 5, rw = LIST_W - 10;
			boolean over = Ui.inside(mx, my, rx, y, rw, ROW_H);
			float t = Ui.hover("group:" + gr.id(), over);
			if (gr.id().equals(selectedGroup)) Ui.round(g, rx, y, rw, ROW_H, 4, 0xFF1C2B4A);
			else if (t > 0) Ui.round(g, rx, y, rw, ROW_H, 4, Ui.blend(0x00161C2A, Ui.CARD_HOVER, t));
			// a clan: its logo, or a shield on gold (its tag is in the name); a group: people on violet
			ChatImages.Texture logo = Groups.logo(gr);
			if (logo != null) drawLogo(g, logo, rx + 4, y + 4, 18);
			else if (gr.clan()) {
				Ui.round(g, rx + 4, y + 4, 18, 18, 5, 0xFFB45309);
				Ui.icon(g, "m-armor", rx + 8, y + 8, 10, 0xFFFFFFFF);
			} else {
				Ui.round(g, rx + 4, y + 4, 18, 18, 5, 0xFF6D28D9);
				Ui.icon(g, "m-players", rx + 8, y + 8, 10, 0xFFFFFFFF);
			}
			int textW = rw - 30 - (gr.unread() > 0 ? 16 : 0);
			Ui.draw(g, Ui.fit(Ui.bold(Groups.title(gr)), textW), rx + 27, y + 4, Ui.TEXT);
			Ui.draw(g, Ui.fit(groupLine(gr), textW), rx + 27, y + 15, Ui.MUTED);
			if (gr.unread() > 0) {
				Component n = Ui.bold(gr.unread() > 9 ? "9+" : String.valueOf(gr.unread()));
				int bw = Math.max(12, Ui.width(n) + 6);
				Ui.round(g, rx + rw - bw - 3, y + 8, bw, 11, 5, Ui.ACCENT);
				Ui.draw(g, n, rx + rw - bw - 3 + (bw - Ui.width(n)) / 2, y + 10, 0xFFFFFFFF);
			}
			String id = gr.id();
			hits.add(new Hit(rx, y, rw, ROW_H, () -> selectGroup(id)));
			y += ROW_H + 2;
		}
		if (!Groups.groups().isEmpty()) {
			g.fill(px + 10, y + 1, px + LIST_W - 10, y + 2, Ui.BORDER);
			y += 6;
		}
		return y;
	}

	/** The communities, under the groups: a logo (or people on teal), the name, #TAG and size, unread or mentions. */
	private int drawCommunities(GuiGraphicsExtractor g, int y, int mx, int my) {
		int bottom = py + ph - 8;
		List<Communities.Community> list = Communities.list();
		for (Communities.Community c : list) {
			if (y + ROW_H > bottom) break;
			int rx = px + 5, rw = LIST_W - 10;
			boolean over = Ui.inside(mx, my, rx, y, rw, ROW_H);
			float t = Ui.hover("community:" + c.id(), over);
			if (c.id().equals(selectedCommunity)) Ui.round(g, rx, y, rw, ROW_H, 4, 0xFF1C2B4A);
			else if (t > 0) Ui.round(g, rx, y, rw, ROW_H, 4, Ui.blend(0x00161C2A, Ui.CARD_HOVER, t));
			ChatImages.Texture logo = Communities.logo(c);
			if (logo != null) drawLogo(g, logo, rx + 4, y + 4, 18);
			else {
				Ui.round(g, rx + 4, y + 4, 18, 18, 5, 0xFF0F766E);
				Ui.icon(g, "m-players", rx + 8, y + 8, 10, 0xFFFFFFFF);
			}
			// a mention in amber "@2"; else unread, grey when the member does not want to hear of everything
			int badge = c.mentions() > 0 ? c.mentions() : c.unread();
			int textW = rw - 30 - (badge > 0 ? 18 : 0);
			Ui.draw(g, Ui.fit(Ui.bold(c.name()), textW), rx + 27, y + 4, Ui.TEXT);
			Ui.draw(g, Ui.fit(communityLine(c), textW), rx + 27, y + 15, Ui.MUTED);
			if (badge > 0) {
				Component n = Ui.bold((c.mentions() > 0 ? "@" : "") + (badge > 9 ? "9+" : String.valueOf(badge)));
				int bw = Math.max(12, Ui.width(n) + 6);
				Ui.round(g, rx + rw - bw - 3, y + 8, bw, 11, 5, c.mentions() > 0 ? 0xFFD97706 : "all".equals(c.notifyMode()) ? Ui.ACCENT : 0xFF3A4252);
				Ui.draw(g, n, rx + rw - bw - 3 + (bw - Ui.width(n)) / 2, y + 10, 0xFFFFFFFF);
			}
			String id = c.id();
			hits.add(new Hit(rx, y, rw, ROW_H, () -> selectCommunity(id, null)));
			y += ROW_H + 2;
		}
		if (!list.isEmpty()) {
			g.fill(px + 10, y + 1, px + LIST_W - 10, y + 2, Ui.BORDER);
			y += 6;
		}
		return y;
	}

	/** "#TAG · 25 członków" */
	private static Component communityLine(Communities.Community c) {
		Component size = Ui.tr("slashclient-hud.communities.size", c.members());
		return c.tag().isEmpty() ? size : Ui.text("#" + c.tag() + " · ").append(size);
	}

	/** A channel's name: the two every community has in the game's language, else its own. */
	private static Component channelName(Communities.Channel ch) {
		return switch (ch.kind()) {
			case "general" -> Ui.tr("slashclient-hud.communities.general");
			case "announcements" -> Ui.tr("slashclient-hud.communities.announcements");
			default -> Ui.text(ch.name());
		};
	}

	/** A community's chat: its channels as buttons, who wrote each message (and their role), mentions of us marked. */
	private void drawCommunityChat(GuiGraphicsExtractor g, Communities.Community c, int cx, int cw, int mx, int my) {
		Communities.Channel ch = c.channel(selectedChannel);
		if (ch == null) ch = c.general();
		if (ch == null) return;
		selectedChannel = ch.id();
		boolean muted = c.mutedUntil() > System.currentTimeMillis();
		boolean canWrite = ch.canPost() && !muted;
		input.visible = !showCommunityMembers && canWrite;
		// on the right: the members, then the channels (the open one lit, a dot on one with news)
		int bx = cx + cw - 36;
		int headW = cw - 46;
		List<Action> buttons = new ArrayList<>();
		buttons.add(new Action("friends:communityMembers", "m-players", Ui.tr(showCommunityMembers ? "slashclient-hud.communities.chat" : "slashclient-hud.communities.members"), this::toggleCommunityMembers));
		List<Communities.Channel> channels = new ArrayList<>(c.channels());
		java.util.Collections.reverse(channels);
		for (Communities.Channel x : channels) {
			String cid = c.id(), xid = x.id();
			buttons.add(new Action("friends:channel:" + xid, x.announcements() ? "info" : "chat", channelName(x), () -> selectCommunity(cid, xid)));
		}
		// icons only (the name of each in its tooltip): the community's name needs the room
		for (Action b : buttons) {
			int w = 20;
			bx -= w;
			String chId = b.id().startsWith("friends:channel:") ? b.id().substring("friends:channel:".length()) : null;
			boolean lit = chId != null ? chId.equals(selectedChannel) && !showCommunityMembers : showCommunityMembers;
			Ui.button(g, b.id(), bx, py + 8, w, 18, b.icon(), Component.empty(), lit, mx, my);
			if (Ui.inside(mx, my, bx, py + 8, w, 18)) tooltip = b.label();
			Communities.Channel other = chId == null ? null : c.channel(chId);
			if (other != null && !chId.equals(selectedChannel) && (other.unread() > 0 || other.mentions() > 0)) Ui.round(g, bx + w - 6, py + 7, 6, 6, 3, other.mentions() > 0 ? 0xFFF59E0B : 0xFFEF4444);
			hits.add(new Hit(bx, py + 8, w, 18, b.run()));
			bx -= 4;
			headW -= w + 4;
		}
		ChatImages.Texture logo = Communities.logo(c);
		int titleX = cx + 10;
		if (logo != null) {
			drawLogo(g, logo, titleX, py + 8, 22);
			titleX += 27;
			headW -= 27;
		}
		Ui.draw(g, Ui.fit(Ui.bold(c.name()), headW), titleX, py + 10, Ui.TEXT);
		Ui.draw(g, Ui.fit(communityLine(c), headW), titleX, py + 21, Ui.MUTED);
		g.fill(cx + 8, py + 33, cx + cw - 8, py + 34, Ui.BORDER);
		if (showCommunityMembers) {
			drawCommunityMembers(g, c, cx, cw);
			return;
		}

		// slow mode: room above the field for the countdown while we wait
		long slowWait = canWrite ? Communities.slowWait(ch.id()) : 0;
		int top = py + 38, bottom = py + ph - INPUT_H - 14 - (editingId >= 0 ? 16 : slowWait > 0 ? 12 : 0);
		int maxBubble = (int) (cw * 0.72);
		List<Communities.Message> messages = Communities.chat(ch.id());
		g.enableScissor(cx + 2, top, cx + cw - 2, bottom);
		Ui.beginClip("community chat", cx + 2, top, cw - 4, bottom - top);
		int y = bottom + scroll;
		int total = 0;
		for (int i = messages.size() - 1; i >= 0; i--) {
			Communities.Message m = messages.get(i);
			boolean mine = m.from().equals(Social.myId());
			boolean named = !mine && (i == 0 || !messages.get(i - 1).from().equals(m.from()));
			// the author's name, and their role when it is more than a member
			Component name = Ui.bold(m.author().isEmpty() ? "?" : m.author());
			if (!m.authorRole().isEmpty() && !"member".equals(m.authorRole())) name = Ui.bold(m.author() + " · ").append(Ui.tr("slashclient-hud.communities.role." + m.authorRole()));
			// a custom role (server 0.9.30+): its name in its colour
			Communities.RoleTag custom = Communities.customRole(m.community(), m.from());
			if (custom != null) name = Component.empty().append(name).append(Ui.bold(" · " + custom.name()).withStyle(s -> s.withColor(custom.color())));
			int nameColor = switch (m.authorRole()) {
				case "owner" -> 0xFFFBBF24;
				case "admin" -> 0xFFFCA5A5;
				case "moderator" -> 0xFF93C5FD;
				default -> Ui.ACCENT_LIGHT;
			};
			if (m.deleted()) {
				int bw = tombstoneWidth(), bh = 16, nameH = named ? 11 : 0;
				y -= bh + 4 + nameH;
				total += bh + 4 + nameH;
				if (y > bottom || y + bh + nameH < top) continue;
				int bx2 = mine ? cx + cw - 10 - bw : cx + 10;
				if (named) Ui.draw(g, Ui.fit(name, maxBubble), bx2 + 2, y, nameColor);
				drawTombstone(g, bx2, y + nameH);
				continue;
			}
			// a picture or a poll (server 0.9.30+): a card of its own
			Communities.Image picture = Communities.image(m.id());
			Communities.Poll poll = picture == null ? Communities.poll(m.id()) : null;
			if (picture != null || poll != null) {
				lastCard = null;
				int[] used = picture != null ? drawCommunityPicture(g, m, picture, mine, named ? name : null, nameColor, cx, cw, maxBubble, y, top, bottom, mx, my)
					: drawPoll(g, m, poll, mine, named ? name : null, nameColor, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
				if (lastCard != null) bubbles.add(new Bubble(lastCard[0], lastCard[1], lastCard[2], lastCard[3], null, null, m));
				continue;
			}
			List<FormattedCharSequence> lines = font.split(Ui.text(m.text()), maxBubble - 12);
			int textW = 0;
			for (FormattedCharSequence l : lines) textW = Math.max(textW, font.width(l));
			Component time = timeOf(m.at(), m.editedAt());
			int bw = Math.max(textW, Ui.width(time)) + 12;
			int bh = lines.size() * 10 + 15;
			int nameH = named ? 11 : 0;
			// a reply's quote above the bubble, the reactions' counts below it (server 0.9.27+)
			int quoteH = m.replyId() > 0 ? 11 : 0;
			int reactH = m.reactions().isEmpty() ? 0 : 14;
			y -= bh + 4 + nameH + quoteH + reactH;
			total += bh + 4 + nameH + quoteH + reactH;
			if (y > bottom || y + bh + nameH + quoteH + reactH < top) continue;
			int bx2 = mine ? cx + cw - 10 - bw : cx + 10;
			if (named) Ui.draw(g, Ui.fit(name, maxBubble), bx2 + 2, y, nameColor);
			if (quoteH > 0) {
				Component quote = m.replyGone() ? Ui.tr("slashclient-hud.communities.replyGone") : Component.empty().append(Ui.bold(m.replyAuthor())).append(Component.literal(" " + m.replyText()));

				Component fitted = Ui.fit(quote, maxBubble - 8);
				int qw = Ui.width(fitted) + 6;
				int qx = mine ? cx + cw - 10 - qw : cx + 10;
				int qy = y + nameH;
				g.fill(qx, qy, qx + 2, qy + 9, m.replyGone() ? Ui.BORDER : 0xFF14B8A6);
				Ui.draw(g, fitted, qx + 5, qy + 1, Ui.MUTED);
			}
			int by = y + nameH + quoteH;

			// a message that mentions us stands out in amber
			boolean toMe = !mine && m.mentionsMe();
			Ui.round(g, bx2, by, bw, bh, 5, mine ? Ui.ACCENT_DARK : toMe ? 0xFF3A2E12 : Ui.CARD);
			if (toMe) g.fill(bx2, by + 2, bx2 + 2, by + bh - 2, 0xFFF59E0B);
			if (m.id() == editingId && editingCommunity != null) Ui.roundOutline(g, bx2 - 1, by - 1, bw + 2, bh + 2, 5, 0xCCFACC15);
			int ly = by + 5;
			for (FormattedCharSequence l : lines) {
				g.text(font, l, bx2 + 6, ly, Ui.TEXT, false);
				ly += 10;
			}
			Ui.draw(g, time, bx2 + bw - 6 - Ui.width(time), ly, mine ? 0xB3FFFFFF : Ui.MUTED);
			if (m.editedAt() > 0 && Ui.inside(mx, my, bx2 + bw - 6 - Ui.width(time), ly, Ui.width(time), 9) && my >= top && my <= bottom)
				tooltip = Ui.tr("slashclient-hud.message.editedAt", TIME.format(Instant.ofEpochMilli(m.editedAt())));
			// pinned: an amber corner
			if (m.pinned()) {
				g.fill(bx2 + bw - 5, by + 2, bx2 + bw - 2, by + 5, 0xFFFBBF24);
				if (Ui.inside(mx, my, bx2 + bw - 7, by, 7, 7) && my >= top && my <= bottom) tooltip = Ui.tr("slashclient-hud.communities.pinned");
			}
			if (reactH > 0) drawReactions(g, m, mine, bx2, bw, by + bh + 3, cx, cw, top, bottom);
			int[] seen = visible(bx2, by, bw, bh, top, bottom);
			if (seen != null) bubbles.add(new Bubble(seen[0], seen[1], seen[2], seen[3], null, null, m));
		}
		Ui.end();
		g.disableScissor();
		maxScroll = Math.max(0, total - (bottom - top));
		if (messages.isEmpty()) Ui.centered(g, Ui.fit(Ui.tr(ch.announcements() ? "slashclient-hud.communities.emptyNews" : "slashclient-hud.communities.empty"), cw - 20), cx + cw / 2, (top + bottom) / 2, Ui.MUTED);

		int fy = input.getY() - 6;
		if (editingId >= 0) drawEditBar(g, cx, fy);
		else if (slowWait > 0) {
			Ui.icon(g, "m-time", cx + 12, fy - 12, 7, 0xFFFBBF24);
			Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.communities.slowWait", slowWait), cw - 34), cx + 22, fy - 12, 0xFFFBBF24);
		}
		if (!canWrite) {
			// announcements (only admins write) or a timeout: the reason where the field would be
			Ui.round(g, cx + 10, fy, cw - 20, INPUT_H, 4, 0x80111622);
			Component why = muted ? Ui.tr("slashclient-hud.communities.muted", UNTIL.format(Instant.ofEpochMilli(c.mutedUntil()))) : Ui.tr("slashclient-hud.communities.readOnly");
			Ui.draw(g, Ui.fit(why, cw - 36), cx + 18, fy + 6, Ui.MUTED);
			return;
		}
		Ui.round(g, cx + 10, fy, input.getWidth() + 12, INPUT_H, 4, Ui.CARD);
		Ui.roundOutline(g, cx + 10, fy, input.getWidth() + 12, INPUT_H, 4, input.isFocused() ? 0x993B82F6 : Ui.BORDER);
		int sx = cx + cw - 10 - 24;
		Ui.button(g, "friends:send", sx, fy, 24, INPUT_H, "arrow", Component.empty(), true, mx, my);
		hits.add(new Hit(sx, fy, 24, INPUT_H, this::send));
		// a screenshot to this channel (server 0.9.30+; not encrypted: the members see it)
		if (Communities.picturesAllowed()) {
			int ix = sx - 24;
			Ui.button(g, "friends:picture", ix, fy, 20, INPUT_H, "image", Component.empty(), false, mx, my);
			if (Ui.inside(mx, my, ix, fy, 20, INPUT_H)) tooltip = Ui.tr("slashclient-hud.picture.button");
			String cid = c.id(), chid = ch.id(), cname = c.name();
			hits.add(new Hit(ix, fy, 20, INPUT_H, () -> minecraft.setScreenAndShow(ShotPickerScreen.forCommunity(this, cid, chid, cname))));
		}
	}

	/** A picture in a community's chat (not encrypted, so no lock); a click shows it big. Returns the new y and the height used. */
	private int[] drawCommunityPicture(GuiGraphicsExtractor g, Communities.Message m, Communities.Image img, boolean mine, Component name, int nameColor, int cx, int cw, int maxBubble, int y, int top, int bottom, int mx, int my) {
		ChatImages.Texture tex = img.expired() ? null : ChatImages.community(m.community(), img.id());
		boolean ready = tex != null && tex.ready();
		int w0 = ready ? tex.w() : img.w(), h0 = ready ? tex.h() : img.h();
		int[] size = ChatImages.fit(w0, h0, Math.min(maxBubble - 8, 150), 96);
		int nameH = name != null ? 11 : 0, reactH = m.reactions().isEmpty() ? 0 : 14;
		int bw = size[0] + 8, bh = size[1] + 8 + 11;
		y -= bh + 4 + nameH + reactH;
		int used = bh + 4 + nameH + reactH;
		if (y > bottom || y + used < top) return new int[] { y, used };
		int bx = mine ? cx + cw - 10 - bw : cx + 10;
		if (name != null) Ui.draw(g, Ui.fit(name, maxBubble), bx + 2, y, nameColor);
		int by = y + nameH;
		lastCard = visible(bx, by, bw, bh, top, bottom);
		Ui.round(g, bx, by, bw, bh, 5, mine ? Ui.ACCENT_DARK : Ui.CARD);
		if (ready) {
			g.blit(RenderPipelines.GUI_TEXTURED, tex.id(), bx + 4, by + 4, 0, 0, size[0], size[1], tex.w(), tex.h(), tex.w(), tex.h(), 0xFFFFFFFF);
			if (Ui.inside(mx, my, bx + 4, by + 4, size[0], size[1])) Ui.roundOutline(g, bx + 3, by + 3, size[0] + 2, size[1] + 2, 3, 0x993B82F6);
		} else {
			Ui.round(g, bx + 4, by + 4, size[0], size[1], 3, 0x40000000);
			Component state = Ui.tr(img.removed() ? "slashclient-hud.picture.removed" : img.expired() ? "slashclient-hud.picture.expired" : tex.failed() ? "slashclient-hud.picture.gone" : "slashclient-hud.picture.loading");
			Ui.icon(g, "image", bx + 4 + size[0] / 2 - 6, by + 4 + size[1] / 2 - 12, 12, Ui.MUTED);
			Ui.centered(g, Ui.fit(state, size[0] - 6), bx + 4 + size[0] / 2, by + 4 + size[1] / 2 + 4, Ui.MUTED);
		}
		Component time = Ui.text(TIME.format(Instant.ofEpochMilli(m.at())));
		Ui.draw(g, time, bx + bw - 4 - Ui.width(time), by + bh - 11, mine ? 0xB3FFFFFF : Ui.MUTED);
		if (m.pinned()) g.fill(bx + bw - 5, by + 2, bx + bw - 2, by + 5, 0xFFFBBF24);
		if (reactH > 0) drawReactions(g, m, mine, bx, bw, by + bh + 3, cx, cw, top, bottom);
		if (ready && by + 4 >= top && by + 4 + size[1] <= bottom) {
			String from = mine ? Social.myName() : m.author();
			String community = m.community(), id = img.id();
			hits.add(new Hit(bx + 4, by + 4, size[0], size[1], () -> minecraft.setScreenAndShow(PictureScreen.forCommunity(this, community, id, from))));
		}
		return new int[] { y, used };
	}

	/**
	 * A poll: the question, each answer with its share as a bar (ours marked), how many voted and
	 * when it ends. A click on an answer votes while it is open (making and closing polls is in the launcher).
	 */
	private int[] drawPoll(GuiGraphicsExtractor g, Communities.Message m, Communities.Poll p, boolean mine, Component name, int nameColor, int cx, int cw, int maxBubble, int y, int top, int bottom, int mx, int my) {
		int bw = Math.min(maxBubble, 200);
		List<FormattedCharSequence> question = font.split(Ui.bold(p.question()), bw - 22);
		boolean open = p.open();
		boolean canVote = open && Communities.canReact(m) && Social.bridged();
		int nameH = name != null ? 11 : 0, reactH = m.reactions().isEmpty() ? 0 : 14;
		int rowH = 13;
		int bh = 6 + question.size() * 10 + 3 + p.options().size() * (rowH + 2) + 12 + (canVote ? 10 : 0) + 3;
		y -= bh + 4 + nameH + reactH;
		int used = bh + 4 + nameH + reactH;
		if (y > bottom || y + used < top) return new int[] { y, used };
		int bx = mine ? cx + cw - 10 - bw : cx + 10;
		if (name != null) Ui.draw(g, Ui.fit(name, maxBubble), bx + 2, y, nameColor);
		int by = y + nameH;
		lastCard = visible(bx, by, bw, bh, top, bottom);
		Ui.round(g, bx, by, bw, bh, 5, Ui.CARD);
		Ui.roundOutline(g, bx, by, bw, bh, 5, mine ? 0x993B82F6 : Ui.BORDER);
		Ui.icon(g, "m-stats", bx + 6, by + 6, 8, open ? Ui.ACCENT_LIGHT : Ui.MUTED);
		int ly = by + 6;
		for (FormattedCharSequence l : question) {
			g.text(font, l, bx + 17, ly, Ui.TEXT, false);
			ly += 10;
		}
		ly += 3;
		for (int i = 0; i < p.options().size(); i++) {
			boolean chosen = p.mine().contains(i);
			int pct = p.percent(i);
			int ox = bx + 5, ow = bw - 10;
			boolean over = canVote && Ui.inside(mx, my, ox, ly, ow, rowH) && my >= top && my <= bottom;
			Ui.round(g, ox, ly, ow, rowH, 3, over ? 0x40FFFFFF : 0x30000000);
			int fill = Math.round(ow * pct / 100f);
			if (fill > 0) Ui.round(g, ox, ly, Math.max(fill, 4), rowH, 3, chosen ? 0x803B82F6 : 0x4060A5FA);
			if (chosen) Ui.roundOutline(g, ox, ly, ow, rowH, 3, 0xCC60A5FA);
			if (chosen) Ui.icon(g, "check", ox + 3, ly + 3, 7, Ui.TEXT);
			Component pctText = Ui.text(pct + "%");
			int pw2 = Ui.width(pctText);
			Ui.draw(g, Ui.fit(Ui.text(p.options().get(i)), ow - 16 - pw2 - 6), ox + 13, ly + 3, Ui.TEXT);
			Ui.draw(g, pctText, ox + ow - 4 - pw2, ly + 3, Ui.TEXT_2);
			if (canVote && ly >= top && ly + rowH <= bottom) {
				int option = i;
				hits.add(new Hit(ox, ly, ow, rowH, () -> Communities.vote(m, option)));
			}
			ly += rowH + 2;
		}
		// how many voted and the end, then what a click does
		Component state = open ? (p.endsAt() > 0 ? Ui.tr("slashclient-hud.poll.ends", UNTIL.format(Instant.ofEpochMilli(p.endsAt()))) : Ui.tr("slashclient-hud.poll.open")) : Ui.tr("slashclient-hud.poll.closed");
		Component foot = Ui.tr("slashclient-hud.poll.votes", p.total()).append(Component.literal(" · ")).append(state);
		Component time = Ui.text(TIME.format(Instant.ofEpochMilli(m.at())));
		Ui.draw(g, Ui.fit(foot, bw - 14 - Ui.width(time)), bx + 6, ly + 1, Ui.MUTED);
		Ui.draw(g, time, bx + bw - 6 - Ui.width(time), ly + 1, Ui.MUTED);
		if (canVote) Ui.draw(g, Ui.fit(Ui.tr(p.multiple() ? "slashclient-hud.poll.hintSeveral" : "slashclient-hud.poll.hint"), bw - 12), bx + 6, ly + 11, Ui.TEXT_2);
		if (m.pinned()) g.fill(bx + bw - 5, by + 2, bx + bw - 2, by + 5, 0xFFFBBF24);
		if (reactH > 0) drawReactions(g, m, mine, bx, bw, by + bh + 3, cx, cw, top, bottom);
		return new int[] { y, used };
	}

	/** A timeout's end: the day too (it may last a week). */
	private static final DateTimeFormatter UNTIL = DateTimeFormatter.ofPattern("dd.MM HH:mm").withZone(ZoneId.systemDefault());

	/** The reactions under a community message: each emoji with its count (ours lit); a click toggles ours while we may react. */
	private void drawReactions(GuiGraphicsExtractor g, Communities.Message m, boolean mine, int bx, int bw, int ry, int cx, int cw, int top, int bottom) {
		List<Component> labels = new ArrayList<>();
		int total = 0;
		for (Communities.Reaction r : m.reactions()) {
			Component l = Component.literal(Communities.glyph(r.emoji()) + " " + r.count());
			labels.add(l);
			total += Ui.width(l) + 10;
		}
		int x = mine ? Math.max(cx + 10, bx + bw - total + 2) : bx;
		boolean react = Communities.canReact(m);
		for (int i = 0; i < labels.size(); i++) {
			Communities.Reaction r = m.reactions().get(i);
			int w = Ui.width(labels.get(i)) + 8;
			if (x + w > cx + cw - 8) break;
			Ui.round(g, x, ry, w, 11, 5, r.me() ? 0xFF0F3D3A : Ui.CARD);
			if (r.me()) Ui.roundOutline(g, x, ry, w, 11, 5, 0xCC14B8A6);
			Ui.draw(g, labels.get(i), x + 4, ry + 2, r.me() ? 0xFF5EEAD4 : Ui.TEXT_2);
			if (react && ry >= top && ry + 11 <= bottom) {
				String emoji = r.emoji();
				hits.add(new Hit(x, ry, w, 11, () -> Communities.react(m, emoji)));
			}
			x += w + 2;
		}
	}

	/** The first members (online first within each role), with the note that managing is in the launcher. */

	private void drawCommunityMembers(GuiGraphicsExtractor g, Communities.Community c, int cx, int cw) {
		int y = py + 40;
		ChatImages.Texture logo = Communities.logo(c);
		if (logo != null) {
			drawLogo(g, logo, cx + 10, y, 32);
			y = Math.max(Ui.wrapped(g, Ui.tr("slashclient-hud.communities.manage"), cx + 48, y + 2, cw - 58, Ui.MUTED), y + 32) + 4;
		} else y = Ui.wrapped(g, Ui.tr("slashclient-hud.communities.manage"), cx + 10, y, cw - 20, Ui.MUTED) + 3;
		List<Communities.Member> list = new ArrayList<>(Communities.members(c.id()));
		List<String> order = List.of("owner", "admin", "moderator", "member");
		list.sort(java.util.Comparator.comparing((Communities.Member m) -> order.indexOf(m.role())).thenComparing(m -> !m.online()).thenComparing(m -> m.name().toLowerCase()));
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.communities.shown", list.size(), Communities.memberTotal(c.id())), cw - 20), cx + 10, y, Ui.TEXT_2);
		y += 12;
		int bottom = py + ph - 8;
		int col = 0, colW = (cw - 20) / 2;
		int startY = y;
		for (Communities.Member m : list) {
			if (y + 18 > bottom) {
				if (col == 1) break;
				col = 1;
				y = startY;
			}
			int rx = cx + 10 + col * colW;
			Ui.round(g, rx, y, colW - 6, 16, 4, Ui.CARD);
			Ui.round(g, rx + 5, y + 5, 6, 6, 3, m.online() ? Ui.GREEN : Ui.MUTED);
			Component role = "member".equals(m.role()) ? Component.empty() : Ui.tr("slashclient-hud.communities.role." + m.role());
			// a custom role (server 0.9.30+) in its colour, after the built-in one
			Communities.RoleTag custom = Communities.customRole(c.id(), m.id());
			if (custom != null) role = "member".equals(m.role()) ? Ui.text(custom.name()).withStyle(s -> s.withColor(custom.color()))
				: Component.empty().append(role).append(Ui.text(" · " + custom.name()).withStyle(s -> s.withColor(custom.color())));
			// the nick keeps at least half the row
			// both too long: the custom role alone (the built-in one shows in the chat)
			if (custom != null && Ui.width(role) > (colW - 30) / 2) role = Ui.fit(Ui.text(custom.name()).withStyle(s -> s.withColor(custom.color())), (colW - 30) / 2);
			int roleW = Ui.width(role);
			Ui.draw(g, Ui.fit(Ui.bold(m.name()), colW - 6 - 16 - roleW - 8), rx + 15, y + 4, m.online() ? Ui.TEXT : Ui.MUTED);
			Ui.draw(g, role, rx + colW - 6 - roleW - 6, y + 4, "owner".equals(m.role()) ? 0xFFFBBF24 : "admin".equals(m.role()) ? 0xFFFCA5A5 : 0xFF93C5FD);
			y += 18;
		}
	}

	/** Under a group's name: the clan's members online, or who else is in the group. */
	private static Component groupLine(Groups.Group gr) {
		Groups.Clan c = Groups.clan();
		if (gr.clan() && c != null && c.chat().equals(gr.id())) return Ui.tr("slashclient-hud.clan.online", c.online(), c.members().size());
		List<String> names = new ArrayList<>();
		for (Groups.Member m : gr.members()) if (!m.id().equals(Social.myId())) names.add(m.name());
		return Ui.text(String.join(", ", names));
	}

	private void drawChat(GuiGraphicsExtractor g, int mx, int my) {
		int cx = px + LIST_W + 1, cw = pw - LIST_W - 1;
		Communities.Community community = selectedCommunity == null ? null : Communities.community(selectedCommunity);
		if (community != null) {
			drawCommunityChat(g, community, cx, cw, mx, my);
			return;
		}
		Groups.Group open = selectedGroup == null ? null : Groups.group(selectedGroup);
		if (open != null) {
			drawGroupChat(g, open, cx, cw, mx, my);
			return;
		}
		Social.Friend f = selected == null ? null : Social.friend(selected);
		if (f == null) {
			Component hint = Ui.tr("slashclient-hud.friends.pick");
			Ui.icon(g, "chat", cx + cw / 2 - 8, py + ph / 2 - 22, 16, Ui.MUTED);
			Ui.centered(g, Ui.fit(hint, cw - 20), cx + cw / 2, py + ph / 2, Ui.MUTED);
			input.visible = false;
			return;
		}
		input.visible = true;
		// the header's buttons from the right, left of the window's close button
		int right = cx + cw - 36;
		String fid = f.id();
		// muted: still a friend, messages still come, but no toasts (on the account, the launcher follows)
		boolean muted = f.muted();
		Ui.button(g, "friends:mute", right - 18, py + 8, 18, 18, muted ? "bell-slash" : "bell", Component.empty(), false, mx, my);
		if (Ui.inside(mx, my, right - 18, py + 8, 18, 18)) tooltip = Ui.tr(muted ? "slashclient-hud.mute.off" : "slashclient-hud.mute.on");
		hits.add(new Hit(right - 18, py + 8, 18, 18, () -> Social.mute(fid, !muted)));
		right -= 22;
		// on a server: one click invites this friend there
		if (Social.currentServer() != null) {
			Component here = Ui.tr("slashclient-hud.invite.here");
			int iw = Ui.buttonWidth(here, "play", 18, 2);
			right -= iw;
			Ui.button(g, "friends:invite", right, py + 8, iw, 18, "play", here, false, mx, my);
			hits.add(new Hit(right, py + 8, iw, 18, () -> Social.invite(fid)));
			right -= 4;
		}
		// their world is open to LAN: one click joins it, through SlashClient
		if (Social.lanOpen(f.id())) {
			Component joinWorld = Ui.tr("slashclient-hud.lan.join");
			int jw = Ui.buttonWidth(joinWorld, "play", 18, 2);
			right -= jw;
			Ui.button(g, "friends:lan", right, py + 8, jw, 18, "play", joinWorld, true, mx, my);
			hits.add(new Hit(right, py + 8, jw, 18, () -> Social.joinLan(fid)));
			right -= 4;
		}
		int headW = right - (cx + 10);
		FriendStreams.Live live = FriendStreams.of(f.id());
		Component headName = Ui.fit(Ui.bold(f.name()), headW - (live != null ? FriendStreams.badgeWidth() + 4 : 0));
		Ui.draw(g, headName, cx + 10, py + 10, Ui.TEXT);
		if (live != null) FriendStreams.badge(g, cx + 13 + Ui.width(headName), py + 9);
		Component sub = Social.typing(f.id()) ? Ui.tr("slashclient-hud.friends.typing") : live != null ? FriendStreams.line(live) : Social.activity(f).copy().withStyle(Ui.text("").getStyle());
		Ui.draw(g, Ui.fit(sub, headW), cx + 10, py + 21, Social.typing(f.id()) ? Ui.ACCENT_LIGHT : live != null ? FriendStreams.LINE : Ui.MUTED);
		g.fill(cx + 8, py + 33, cx + cw - 8, py + 34, Ui.BORDER);

		// messages from the bottom up, each a bubble: yours on the right in blue
		int top = py + 38, bottom = py + ph - INPUT_H - 14 - (editingId >= 0 ? 16 : 0);
		int maxBubble = (int) (cw * 0.72);
		List<Social.Message> messages = Social.chat(f.id());
		g.enableScissor(cx + 2, top, cx + cw - 2, bottom);
		int y = bottom + scroll;
		int total = 0;
		for (int i = messages.size() - 1; i >= 0; i--) {
			Social.Message m = messages.get(i);
			boolean mine = m.from().equals(Social.myId());
			// taken back: only that there was a message stays
			if (m.deleted()) {
				int bw = tombstoneWidth(), bh = 16;
				y -= bh + 4;
				total += bh + 4;
				if (y > bottom || y + bh < top) continue;
				int bx = mine ? cx + cw - 10 - bw : cx + 10;
				drawTombstone(g, bx, y);
				continue;
			}
			lastCard = null;
			if (m.waypoint() != null) {
				int[] used = drawWaypoint(g, m, f.name(), mine, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
				if (lastCard != null) bubbles.add(new Bubble(lastCard[0], lastCard[1], lastCard[2], lastCard[3], m, null));
				continue;
			}
			if (m.image() != null && !m.image().unreadable()) {
				int[] used = drawPicture(g, m.image(), m.at(), f.name(), mine, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
				if (lastCard != null) bubbles.add(new Bubble(lastCard[0], lastCard[1], lastCard[2], lastCard[3], m, null));
				continue;
			}
			if (!m.invite().isEmpty()) {
				int[] used = drawInvite(g, m, mine, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
				if (lastCard != null) bubbles.add(new Bubble(lastCard[0], lastCard[1], lastCard[2], lastCard[3], m, null));
				continue;
			}
			String text = m.image() != null ? Ui.tr("slashclient-hud.picture.unreadable").getString() : m.text();
			List<FormattedCharSequence> lines = font.split(Ui.text(text), maxBubble - 12);
			int textW = 0;
			for (FormattedCharSequence l : lines) textW = Math.max(textW, font.width(l));
			Component time = timeOf(m.at(), m.editedAt());
			int bw = Math.max(textW, Ui.width(time)) + 12;
			int bh = lines.size() * 10 + 15;
			y -= bh + 4;
			total += bh + 4;
			if (y > bottom || y + bh < top) continue;
			int bx = mine ? cx + cw - 10 - bw : cx + 10;
			Ui.round(g, bx, y, bw, bh, 5, mine ? Ui.ACCENT_DARK : Ui.CARD);
			// the one being edited in the field
			if (m.id() == editingId && editingGroup == null) Ui.roundOutline(g, bx - 1, y - 1, bw + 2, bh + 2, 5, 0xCCFACC15);
			int ly = y + 5;
			for (FormattedCharSequence l : lines) {
				g.text(font, l, bx + 6, ly, Ui.TEXT, false);
				ly += 10;
			}
			Ui.draw(g, time, bx + bw - 6 - Ui.width(time), ly, mine ? 0xB3FFFFFF : Ui.MUTED);
			if (m.editedAt() > 0 && Ui.inside(mx, my, bx + bw - 6 - Ui.width(time), ly, Ui.width(time), 9) && my >= top && my <= bottom)
				tooltip = Ui.tr("slashclient-hud.message.editedAt", TIME.format(Instant.ofEpochMilli(m.editedAt())));
			int[] seen = visible(bx, y, bw, bh, top, bottom);
			if (seen != null) bubbles.add(new Bubble(seen[0], seen[1], seen[2], seen[3], m, null));
		}
		g.disableScissor();
		maxScroll = Math.max(0, total - (bottom - top));
		if (messages.isEmpty()) Ui.centered(g, Ui.fit(Ui.tr("slashclient-hud.friends.empty", f.name()), cw - 20), cx + cw / 2, (top + bottom) / 2, Ui.MUTED);

		// the field (an EditBox drawn by the screen) on a rounded background, and the send button
		int fy = input.getY() - 6;
		Ui.round(g, cx + 10, fy, input.getWidth() + 12, INPUT_H, 4, Ui.CARD);
		Ui.roundOutline(g, cx + 10, fy, input.getWidth() + 12, INPUT_H, 4, input.isFocused() ? 0x993B82F6 : Ui.BORDER);
		int sx = cx + cw - 10 - 24;
		Ui.button(g, "friends:send", sx, fy, 24, INPUT_H, "arrow", Component.empty(), true, mx, my);
		hits.add(new Hit(sx, fy, 24, INPUT_H, this::send));
		// a screenshot to the friend: picked from the newest ones, encrypted by the launcher
		int ix = sx - 24;
		Ui.button(g, "friends:picture", ix, fy, 20, INPUT_H, "image", Component.empty(), false, mx, my);
		if (Ui.inside(mx, my, ix, fy, 20, INPUT_H)) tooltip = Ui.tr("slashclient-hud.picture.button");
		String fid2 = f.id(), fname = f.name();
		hits.add(new Hit(ix, fy, 20, INPUT_H, () -> minecraft.setScreenAndShow(new ShotPickerScreen(this, fid2, fname))));
		if (editingId >= 0) drawEditBar(g, cx, fy);
		else drawRecentShot(g, f, cx, cw, fy, mx, my);
	}

	/** Above the field while a message is edited: what Enter and Esc do. */
	private void drawEditBar(GuiGraphicsExtractor g, int cx, int fy) {
		int w = input.getWidth() + 12, y = fy - 15;
		Ui.round(g, cx + 10, y, w, 13, 4, 0x26FACC15);
		Ui.icon(g, "pen", cx + 14, y + 3, 7, 0xFFFACC15);
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.message.editing"), w - 20), cx + 25, y + 3, 0xFFFACC15);
	}

	/** The tooltip of what is under the mouse, over everything else. */
	private void drawTooltip(GuiGraphicsExtractor g, int mx, int my) {
		if (tooltip == null) return;
		overEverything(g);
		int tw = Ui.width(tooltip) + 10;
		int tx = Math.min(mx + 8, px + pw - tw - 4), ty = Math.max(py + 4, my - 16);
		Ui.round(g, tx, ty, tw, 13, 3, 0xF0000000);
		Ui.draw(g, tooltip, tx + 5, ty + 3, Ui.TEXT);
		tooltip = null;
	}

	/** The screenshot taken a moment ago (F2): one click sends it to this friend. */
	private void drawRecentShot(GuiGraphicsExtractor g, Social.Friend f, int cx, int cw, int fy, int mx, int my) {
		java.io.File shot = dev.slash3rss.slashclient.hud.Shots.recent();
		if (shot == null) return;
		ChatImages.Texture tex = ChatImages.file(shot);
		int h = 30, w = Math.min(cw - 20, 190), x = cx + cw - 10 - w, y = fy - h - 6;
		boolean over = Ui.inside(mx, my, x, y, w, h);
		float t = Ui.hover("friends:recent", over);
		Ui.round(g, x, y, w, h, 5, Ui.blend(0xF01C2B4A, 0xF0264070, t));
		Ui.roundOutline(g, x, y, w, h, 5, 0x993B82F6);
		int tw = 0;
		if (tex.ready()) {
			int[] size = ChatImages.fit(tex.w(), tex.h(), 40, h - 6);
			tw = size[0];
			g.blit(RenderPipelines.GUI_TEXTURED, tex.id(), x + 3, y + 3 + (h - 6 - size[1]) / 2, 0, 0, size[0], size[1], tex.w(), tex.h(), tex.w(), tex.h(), 0xFFFFFFFF);
		}
		int tx = x + 3 + Math.max(tw, 0) + 5;
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.picture.recent"), x + w - tx - 18), tx, y + 6, Ui.TEXT);
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.picture.recentHint", f.name()), x + w - tx - 18), tx, y + 17, Ui.TEXT_2);
		// not now: the card goes
		Ui.icon(g, "close", x + w - 12, y + 4, 8, Ui.MUTED);
		hits.add(new Hit(x + w - 14, y + 2, 12, 12, dev.slash3rss.slashclient.hud.Shots::forgetRecent));
		String fid = f.id(), fname = f.name();
		hits.add(new Hit(x, y, w, h, () -> {
			Social.sendImage(fid, shot, null);
			dev.slash3rss.slashclient.hud.Shots.forgetRecent();
			Social.toast(fname, Component.translatable("slashclient-hud.picture.sending").getString(), "m-screenshot");
		}));
	}

	/** A picture as a thumbnail (it loads through the launcher); a click shows it big. Returns the new y and the height used. */
	private int[] drawPicture(GuiGraphicsExtractor g, Social.Image img, long at, String fromName, boolean mine, int cx, int cw, int maxBubble, int y, int top, int bottom, int mx, int my) {
		ChatImages.Texture tex = ChatImages.chat(img.id());
		int w0 = tex.ready() ? tex.w() : img.w(), h0 = tex.ready() ? tex.h() : img.h();
		int[] size = ChatImages.fit(w0, h0, Math.min(maxBubble - 8, 150), 96);
		int bw = size[0] + 8, bh = size[1] + 8 + 11;
		y -= bh + 4;
		if (y > bottom || y + bh < top) return new int[] { y, bh + 4 };
		int bx = mine ? cx + cw - 10 - bw : cx + 10;
		lastCard = visible(bx, y, bw, bh, top, bottom);
		Ui.round(g, bx, y, bw, bh, 5, mine ? Ui.ACCENT_DARK : Ui.CARD);
		if (tex.ready()) {
			g.blit(RenderPipelines.GUI_TEXTURED, tex.id(), bx + 4, y + 4, 0, 0, size[0], size[1], tex.w(), tex.h(), tex.w(), tex.h(), 0xFFFFFFFF);
			if (Ui.inside(mx, my, bx + 4, y + 4, size[0], size[1])) Ui.roundOutline(g, bx + 3, y + 3, size[0] + 2, size[1] + 2, 3, 0x993B82F6);
		} else {
			Ui.round(g, bx + 4, y + 4, size[0], size[1], 3, 0x40000000);
			Component state = Ui.tr(tex.failed() ? "slashclient-hud.picture.gone" : "slashclient-hud.picture.loading");
			Ui.icon(g, "image", bx + 4 + size[0] / 2 - 6, y + 4 + size[1] / 2 - 12, 12, Ui.MUTED);
			Ui.centered(g, Ui.fit(state, size[0] - 6), bx + 4 + size[0] / 2, y + 4 + size[1] / 2 + 4, Ui.MUTED);
		}
		Ui.icon(g, "lock", bx + 4, y + bh - 11, 7, mine ? 0xB3FFFFFF : Ui.MUTED);
		Component time = Ui.text(TIME.format(Instant.ofEpochMilli(at)));
		Ui.draw(g, time, bx + bw - 4 - Ui.width(time), y + bh - 11, mine ? 0xB3FFFFFF : Ui.MUTED);
		if (tex.ready() && y + 4 >= top && y + 4 + size[1] <= bottom) {
			String from = mine ? Social.myName() : fromName;
			hits.add(new Hit(bx + 4, y + 4, size[0], size[1], () -> minecraft.setScreenAndShow(new PictureScreen(this, img.id(), from))));
		}
		return new int[] { y, bh + 4 };
	}

	/** A group's (or the clan's) conversation: who wrote each message above it, and what happened in the group as lines. */
	private void drawGroupChat(GuiGraphicsExtractor g, Groups.Group gr, int cx, int cw, int mx, int my) {
		input.visible = !showMembers;
		Groups.Clan clan = Groups.clan();
		boolean ourClan = gr.clan() && clan != null && clan.chat().equals(gr.id());
		// on the right: the clan's members, or adding friends and leaving a group
		int bx = cx + cw - 36;
		List<Action> buttons = new ArrayList<>();
		if (ourClan) buttons.add(new Action("friends:members", "m-players", Ui.tr(showMembers ? "slashclient-hud.clan.chat" : "slashclient-hud.clan.members"), () -> {
			showMembers = !showMembers;
			if (!showMembers) setFocused(input);
		}));
		else if (!gr.clan()) {
			String id = gr.id();
			buttons.add(new Action("friends:leaveGroup", "close", Ui.tr("slashclient-hud.groups.leave"), () -> {
				Groups.leave(id);
				selectedGroup = null;
			}));
			if (gr.members().size() < Groups.SIZE) buttons.add(new Action("friends:addToGroup", "user", Ui.tr("slashclient-hud.groups.add"), () -> minecraft.setScreenAndShow(PickFriendsScreen.addToGroup(this, gr))));
		}
		int headW = cw - 46;
		for (Action b : buttons) {
			int w = Ui.buttonWidth(b.label(), b.icon(), 18, 2);
			bx -= w;
			Ui.button(g, b.id(), bx, py + 8, w, 18, b.icon(), b.label(), ourClan && showMembers, mx, my);
			hits.add(new Hit(bx, py + 8, w, 18, b.run()));
			bx -= 4;
			headW -= w + 4;
		}
		// the clan's logo before its name, when it has one
		ChatImages.Texture logo = Groups.logo(gr);
		int titleX = cx + 10;
		if (logo != null) {
			drawLogo(g, logo, titleX, py + 8, 22);
			titleX += 27;
			headW -= 27;
		}
		Ui.draw(g, Ui.fit(Ui.bold(Groups.title(gr)), headW), titleX, py + 10, Ui.TEXT);
		Ui.draw(g, Ui.fit(groupLine(gr), headW), titleX, py + 21, Ui.MUTED);
		g.fill(cx + 8, py + 33, cx + cw - 8, py + 34, Ui.BORDER);
		if (ourClan && showMembers) {
			drawMembers(g, clan, cx, cw);
			return;
		}

		int top = py + 38, bottom = py + ph - INPUT_H - 14 - (editingId >= 0 ? 16 : 0);
		int maxBubble = (int) (cw * 0.72);
		List<Groups.Message> messages = Groups.chat(gr.id());
		g.enableScissor(cx + 2, top, cx + cw - 2, bottom);
		Ui.beginClip("group chat", cx + 2, top, cw - 4, bottom - top);
		int y = bottom + scroll;
		int total = 0;
		for (int i = messages.size() - 1; i >= 0; i--) {
			Groups.Message m = messages.get(i);
			if (!m.event().isEmpty()) {
				Component line = Ui.fit(Ui.text(m.event()), cw - 40);
				int lw = Ui.width(line) + 12;
				y -= 16;
				total += 16;
				if (y > bottom || y + 12 < top) continue;
				Ui.round(g, cx + (cw - lw) / 2, y, lw, 12, 5, 0x14FFFFFF);
				Ui.centered(g, line, cx + cw / 2, y + 2, Ui.MUTED);
				continue;
			}
			boolean mine = m.from().equals(Social.myId());
			// the name above the first of someone's messages in a row
			boolean named = !mine && (i == 0 || !messages.get(i - 1).from().equals(m.from()) || !messages.get(i - 1).event().isEmpty());
			// taken back (by its author or a moderator): only that there was a message stays
			if (m.deleted()) {
				int bw = tombstoneWidth(), bh = 16, nameH = named ? 11 : 0;
				y -= bh + 4 + nameH;
				total += bh + 4 + nameH;
				if (y > bottom || y + bh + nameH < top) continue;
				int bx2 = mine ? cx + cw - 10 - bw : cx + 10;
				if (named) Ui.draw(g, Ui.fit(Ui.bold(gr.nameOf(m.from())), maxBubble), bx2 + 2, y, Ui.ACCENT_LIGHT);
				drawTombstone(g, bx2, y + nameH);
				continue;
			}
			if (m.image() != null && !m.image().unreadable()) {
				lastCard = null;
				int[] used = drawPicture(g, m.image(), m.at(), gr.nameOf(m.from()), mine, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
				if (lastCard != null) bubbles.add(new Bubble(lastCard[0], lastCard[1], lastCard[2], lastCard[3], null, m));
				if (named) {
					y -= 11;
					total += 11;
					if (y <= bottom && y + 11 >= top) Ui.draw(g, Ui.fit(Ui.bold(gr.nameOf(m.from())), maxBubble), cx + 12, y, Ui.ACCENT_LIGHT);
				}
				continue;
			}
			List<FormattedCharSequence> lines = font.split(Ui.text(m.text()), maxBubble - 12);
			int textW = 0;
			for (FormattedCharSequence l : lines) textW = Math.max(textW, font.width(l));
			Component time = timeOf(m.at(), m.editedAt());
			int bw = Math.max(textW, Ui.width(time)) + 12;
			int bh = lines.size() * 10 + 15;
			int nameH = named ? 11 : 0;
			y -= bh + 4 + nameH;
			total += bh + 4 + nameH;
			if (y > bottom || y + bh + nameH < top) continue;
			int bx2 = mine ? cx + cw - 10 - bw : cx + 10;
			if (named) Ui.draw(g, Ui.fit(Ui.bold(gr.nameOf(m.from())), maxBubble), bx2 + 2, y, Ui.ACCENT_LIGHT);
			int by = y + nameH;
			Ui.round(g, bx2, by, bw, bh, 5, mine ? Ui.ACCENT_DARK : Ui.CARD);
			if (m.id() == editingId && gr.id().equals(editingGroup)) Ui.roundOutline(g, bx2 - 1, by - 1, bw + 2, bh + 2, 5, 0xCCFACC15);
			int ly = by + 5;
			for (FormattedCharSequence l : lines) {
				g.text(font, l, bx2 + 6, ly, Ui.TEXT, false);
				ly += 10;
			}
			Ui.draw(g, time, bx2 + bw - 6 - Ui.width(time), ly, mine ? 0xB3FFFFFF : Ui.MUTED);
			if (m.editedAt() > 0 && Ui.inside(mx, my, bx2 + bw - 6 - Ui.width(time), ly, Ui.width(time), 9) && my >= top && my <= bottom)
				tooltip = Ui.tr("slashclient-hud.message.editedAt", TIME.format(Instant.ofEpochMilli(m.editedAt())));
			int[] seen = visible(bx2, by, bw, bh, top, bottom);
			if (seen != null) bubbles.add(new Bubble(seen[0], seen[1], seen[2], seen[3], null, m));
		}
		Ui.end();
		g.disableScissor();
		maxScroll = Math.max(0, total - (bottom - top));
		if (messages.isEmpty()) Ui.centered(g, Ui.fit(Ui.tr("slashclient-hud.groups.empty"), cw - 20), cx + cw / 2, (top + bottom) / 2, Ui.MUTED);

		int fy = input.getY() - 6;
		Ui.round(g, cx + 10, fy, input.getWidth() + 12, INPUT_H, 4, Ui.CARD);
		Ui.roundOutline(g, cx + 10, fy, input.getWidth() + 12, INPUT_H, 4, input.isFocused() ? 0x993B82F6 : Ui.BORDER);
		int sx = cx + cw - 10 - 24;
		Ui.button(g, "friends:send", sx, fy, 24, INPUT_H, "arrow", Component.empty(), true, mx, my);
		hits.add(new Hit(sx, fy, 24, INPUT_H, this::send));
		// a screenshot to the whole group, encrypted for its members by the launcher
		int ix = sx - 24;
		Ui.button(g, "friends:picture", ix, fy, 20, INPUT_H, "image", Component.empty(), false, mx, my);
		String gid = gr.id(), gname = Groups.title(gr);
		hits.add(new Hit(ix, fy, 20, INPUT_H, () -> minecraft.setScreenAndShow(ShotPickerScreen.forGroup(this, gid, gname))));
		if (Ui.inside(mx, my, ix, fy, 20, INPUT_H)) tooltip = Ui.tr("slashclient-hud.picture.button");
		if (editingId >= 0) drawEditBar(g, cx, fy);
	}

	/** A clan's logo, size × size (the 64×64 picture scaled). */
	private static void drawLogo(GuiGraphicsExtractor g, ChatImages.Texture tex, int x, int y, int size) {
		g.blit(RenderPipelines.GUI_TEXTURED, tex.id(), x, y, 0, 0, size, size, tex.w(), tex.h(), tex.w(), tex.h(), 0xFFFFFFFF);
	}

	/** The clan's members: online first within each role, with the role (managing them is in the launcher). */
	private void drawMembers(GuiGraphicsExtractor g, Groups.Clan clan, int cx, int cw) {
		int y = py + 40;
		// the clan's logo bigger, by the note that it is managed in the launcher
		ChatImages.Texture logo = ClanLogos.of(clan.id(), clan.logo());
		if (logo != null) {
			drawLogo(g, logo, cx + 10, y, 32);
			y = Math.max(Ui.wrapped(g, Ui.tr("slashclient-hud.clan.manage"), cx + 48, y + 2, cw - 58, Ui.MUTED), y + 32) + 4;
		} else y = Ui.wrapped(g, Ui.tr("slashclient-hud.clan.manage"), cx + 10, y, cw - 20, Ui.MUTED) + 3;
		List<Groups.ClanMember> sorted = new ArrayList<>(clan.members());
		List<String> order = List.of("owner", "officer", "member");
		sorted.sort(java.util.Comparator.comparing((Groups.ClanMember m) -> order.indexOf(m.role())).thenComparing(m -> !m.online()).thenComparing(m -> m.name().toLowerCase()));
		int bottom = py + ph - 8;
		int col = 0, colW = (cw - 20) / 2;
		int startY = y;
		for (Groups.ClanMember m : sorted) {
			if (y + 18 > bottom) {
				if (col == 1) break;
				col = 1;
				y = startY;
			}
			int rx = cx + 10 + col * colW;
			Ui.round(g, rx, y, colW - 6, 16, 4, Ui.CARD);
			Ui.round(g, rx + 5, y + 5, 6, 6, 3, m.online() ? Ui.GREEN : Ui.MUTED);
			if ("owner".equals(m.role())) Ui.icon(g, "m-armor", rx + colW - 20, y + 4, 8, 0xFFFBBF24);
			Component role = Ui.tr("slashclient-hud.clan.role." + m.role());
			int roleW = Ui.width(role);
			int nameW = colW - 6 - 16 - roleW - 8 - ("owner".equals(m.role()) ? 12 : 0);
			Ui.draw(g, Ui.fit(Ui.bold(m.name()), nameW), rx + 15, y + 4, m.online() ? Ui.TEXT : Ui.MUTED);
			Ui.draw(g, role, rx + colW - 6 - roleW - 6 - ("owner".equals(m.role()) ? 12 : 0), y + 4, "officer".equals(m.role()) ? 0xFF93C5FD : "owner".equals(m.role()) ? 0xFFFBBF24 : Ui.MUTED);
			y += 18;
		}
	}

	/** A "join me" invite as a card with a Join button (for the one invited); returns the new y and the height used. */
	private int[] drawInvite(GuiGraphicsExtractor g, Social.Message m, boolean mine, int cx, int cw, int maxBubble, int y, int top, int bottom, int mx, int my) {
		// run out: no Join, only that it was
		boolean expired = Social.inviteExpired(m);
		Component title = Ui.trBold(expired ? "slashclient-hud.invite.expired" : mine ? "slashclient-hud.invite.sent" : "slashclient-hud.invite.title");
		Component where = Ui.text(m.inviteVersion().isEmpty() ? m.invite() : m.invite() + " · " + m.inviteVersion());
		Component join = Ui.tr("slashclient-hud.invite.join");
		boolean button = !mine && !expired;
		int bw = Math.min(maxBubble, Math.max(Math.max(Ui.width(title), Ui.width(where)) + 18, button ? Ui.buttonWidth(join, "play", 16, 2) : 0) + 12);
		int bh = button ? 50 : 30;
		y -= bh + 4;
		if (y > bottom || y + bh < top) return new int[] { y, bh + 4 };
		int bx = mine ? cx + cw - 10 - bw : cx + 10;
		lastCard = visible(bx, y, bw, bh, top, bottom);
		Ui.round(g, bx, y, bw, bh, 5, mine ? Ui.ACCENT_DARK : Ui.CARD);
		Ui.roundOutline(g, bx, y, bw, bh, 5, mine ? 0x40FFFFFF : 0x663B82F6);
		Ui.icon(g, "play", bx + 6, y + 6, 8, expired ? Ui.MUTED : mine ? Ui.TEXT : Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(title, bw - 24), bx + 18, y + 6, expired ? Ui.TEXT_2 : Ui.TEXT);
		Ui.draw(g, Ui.fit(where, bw - 12), bx + 6, y + 17, expired ? Ui.MUTED : mine ? 0xCCFFFFFF : Ui.TEXT_2);
		if (button) {
			int jw = bw - 12;
			// only clickable where it is not cut off by the scroll area
			Ui.button(g, "friends:join:" + m.id(), bx + 6, y + 29, jw, 16, "play", join, true, mx, my);
			if (y + 29 >= top && y + 45 <= bottom) hits.add(new Hit(bx + 6, y + 29, jw, 16, () -> {
				// a party's invite: "I'm in" first, so the leader sees it
				Party.accept(m.party());
				Social.join(m.invite());
			}));
		}
		return new int[] { y, bh + 4 };
	}

	/** A shared waypoint as a card: its name, where it is, and Add (for the one it was sent to). */
	private int[] drawWaypoint(GuiGraphicsExtractor g, Social.Message m, String friendName, boolean mine, int cx, int cw, int maxBubble, int y, int top, int bottom, int mx, int my) {
		SharedWaypoints.Shared w = m.waypoint();
		Component title = Ui.trBold(mine ? "slashclient-hud.share.sentCard" : "slashclient-hud.share.card", w.name());
		Component where = Ui.text(w.x() + " " + w.y() + " " + w.z() + " · " + SharedWaypoints.worldName(w.world()));
		Component add = Ui.tr("slashclient-hud.share.add");
		int bw = Math.min(maxBubble, Math.max(Math.max(Ui.width(title), Ui.width(where)) + 18, mine ? 0 : Ui.buttonWidth(add, "check", 16, 2)) + 12);
		int bh = mine ? 30 : 50;
		y -= bh + 4;
		if (y > bottom || y + bh < top) return new int[] { y, bh + 4 };
		int bx = mine ? cx + cw - 10 - bw : cx + 10;
		lastCard = visible(bx, y, bw, bh, top, bottom);
		Ui.round(g, bx, y, bw, bh, 5, mine ? Ui.ACCENT_DARK : Ui.CARD);
		Ui.roundOutline(g, bx, y, bw, bh, 5, mine ? 0x40FFFFFF : 0x663B82F6);
		Ui.icon(g, "m-waypoints", bx + 6, y + 6, 8, mine ? Ui.TEXT : Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(title, bw - 24), bx + 18, y + 6, Ui.TEXT);
		Ui.draw(g, Ui.fit(where, bw - 12), bx + 6, y + 17, mine ? 0xCCFFFFFF : Ui.TEXT_2);
		if (!mine) {
			int jw = bw - 12;
			Ui.button(g, "friends:wp:" + m.id(), bx + 6, y + 29, jw, 16, "check", add, true, mx, my);
			if (y + 29 >= top && y + 45 <= bottom) hits.add(new Hit(bx + 6, y + 29, jw, 16, () -> SharedWaypoints.acceptMessage(m, friendName)));
		}
		return new int[] { y, bh + 4 };
	}

	// ---------- input ----------

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		// a message's menu is open: a row runs, a click anywhere else closes it
		if (menu != null) {
			if (e.button() == InputConstants.MOUSE_BUTTON_LEFT) clickMenu(e.x(), e.y());
			else menu = null;
			return true;
		}
		// right click on a message: its menu (edit, copy, delete)
		if (e.button() == InputConstants.MOUSE_BUTTON_RIGHT && openMenuAt((int) e.x(), (int) e.y())) return true;
		//#if MC >= 1.21.9
		if (super.mouseClicked(e, doubleClick)) return true;
		//#else
		//$ if (super.mouseClicked(e.x(), e.y(), e.button())) return true;
		//#endif
		if (e.button() != InputConstants.MOUSE_BUTTON_LEFT) return false;
		// what was drawn last is on top (the card of a fresh screenshot over the newest messages)
		List<Hit> all = List.copyOf(hits);
		for (int i = all.size() - 1; i >= 0; i--) {
			Hit h = all.get(i);
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
		scroll = (int) Math.max(0, Math.min(maxScroll, scroll + v * 20));
		menu = null;
		return true;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		if ((e.key() == InputConstants.KEY_RETURN || e.key() == InputConstants.KEY_NUMPADENTER) && input.isFocused()) {
			send();
			return true;
		}
		// Esc closes a message's menu, then lets go of the message being edited, and only then the window
		if (e.key() == InputConstants.KEY_ESCAPE && (menu != null || editingId >= 0)) {
			if (menu != null) menu = null;
			else stopEditing();
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
		Social.viewing = null;
		Groups.viewing = null;
		Communities.viewing = null;
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
		if (minecraft.level == null) {
			// from the main menu there is no world behind: the menu's panorama, as on our title screen
			extractPanorama(g, delta);
			g.fill(0, 0, width, height, 0x800A0D14);
			g.fillGradient(0, height / 2, width, height, 0x000A0D14, 0xB00A0D14);
		} else {
			// in game the world stays visible, a little darker so the window reads well
			g.fill(0, 0, width, height, 0x50000000);
		}
	}
}
