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
	/** Messages scrolled up from the newest, in pixels. */
	private int scroll;
	private int maxScroll;
	private record Hit(int x, int y, int w, int h, Runnable action) {}
	/** A button in a chat's header. */
	private record Action(String id, String icon, Component label, Runnable run) {}
	private final List<Hit> hits = new ArrayList<>();
	/** What the button under the mouse does, drawn last. */
	private Component tooltip;

	// the panel, recomputed on every resize
	private int px, py, pw, ph;

	public FriendsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.friends"));
		this.parent = parent;
		selected = Social.viewing;
		selectedGroup = selected == null ? Groups.viewing : null;
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
		input.visible = selected != null || selectedGroup != null;
		addRenderableWidget(input);
		if (input.visible) setInitialFocus(input);
	}

	private void select(String id) {
		selected = id;
		selectedGroup = null;
		Groups.viewing = null;
		scroll = 0;
		Social.open(id);
		input.visible = true;
		setFocused(input);
		input.setFocused(true);
	}

	/** Opens a group chat (or the clan's) in place of a friend's conversation. */
	public void selectGroup(String id) {
		selectedGroup = id;
		selected = null;
		Social.viewing = null;
		showMembers = false;
		scroll = 0;
		Groups.open(id);
		input.visible = true;
		setFocused(input);
		input.setFocused(true);
	}

	/** The clan's members instead of its chat, or back (the header's button; the test uses it too). */
	public void toggleMembers() {
		showMembers = !showMembers;
	}

	private void send() {
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
		if (friends.isEmpty() && Groups.groups().isEmpty()) {
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
			// muted: a small crossed bell after the name
			Component name = Ui.fit(Ui.bold(f.name()), textW - (f.muted() ? 10 : 0));
			Ui.draw(g, name, rx + 27, y + 4, Ui.TEXT);
			if (f.muted()) Ui.icon(g, "bell-slash", rx + 29 + Ui.width(name), y + 4, 7, Ui.MUTED);
			Ui.draw(g, Ui.fit(Social.activity(f).copy().withStyle(Ui.text("").getStyle()), textW), rx + 27, y + 15, Ui.MUTED);
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
			// a clan: a shield on gold (its tag is in the name); a group: people on violet
			if (gr.clan()) {
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
		Ui.draw(g, Ui.fit(Ui.bold(f.name()), headW), cx + 10, py + 10, Ui.TEXT);
		Component sub = Social.typing(f.id()) ? Ui.tr("slashclient-hud.friends.typing") : Social.activity(f).copy().withStyle(Ui.text("").getStyle());
		Ui.draw(g, Ui.fit(sub, headW), cx + 10, py + 21, Social.typing(f.id()) ? Ui.ACCENT_LIGHT : Ui.MUTED);
		g.fill(cx + 8, py + 33, cx + cw - 8, py + 34, Ui.BORDER);

		// messages from the bottom up, each a bubble: yours on the right in blue
		int top = py + 38, bottom = py + ph - INPUT_H - 14;
		int maxBubble = (int) (cw * 0.72);
		List<Social.Message> messages = Social.chat(f.id());
		g.enableScissor(cx + 2, top, cx + cw - 2, bottom);
		int y = bottom + scroll;
		int total = 0;
		for (int i = messages.size() - 1; i >= 0; i--) {
			Social.Message m = messages.get(i);
			boolean mine = m.from().equals(Social.myId());
			if (m.waypoint() != null) {
				int[] used = drawWaypoint(g, m, f.name(), mine, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
				continue;
			}
			if (m.image() != null && !m.image().unreadable()) {
				int[] used = drawPicture(g, m.image(), m.at(), f.name(), mine, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
				continue;
			}
			if (!m.invite().isEmpty()) {
				int[] used = drawInvite(g, m, mine, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
				continue;
			}
			String text = m.image() != null ? Ui.tr("slashclient-hud.picture.unreadable").getString() : m.text();
			List<FormattedCharSequence> lines = font.split(Ui.text(text), maxBubble - 12);
			int textW = 0;
			for (FormattedCharSequence l : lines) textW = Math.max(textW, font.width(l));
			Component time = Ui.text(TIME.format(Instant.ofEpochMilli(m.at())));
			int bw = Math.max(textW, Ui.width(time)) + 12;
			int bh = lines.size() * 10 + 15;
			y -= bh + 4;
			total += bh + 4;
			if (y > bottom || y + bh < top) continue;
			int bx = mine ? cx + cw - 10 - bw : cx + 10;
			Ui.round(g, bx, y, bw, bh, 5, mine ? Ui.ACCENT_DARK : Ui.CARD);
			int ly = y + 5;
			for (FormattedCharSequence l : lines) {
				g.text(font, l, bx + 6, ly, Ui.TEXT, false);
				ly += 10;
			}
			Ui.draw(g, time, bx + bw - 6 - Ui.width(time), ly, mine ? 0xB3FFFFFF : Ui.MUTED);
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
		drawRecentShot(g, f, cx, cw, fy, mx, my);
		if (tooltip != null) {
			int tw = Ui.width(tooltip) + 10;
			int tx = Math.min(mx + 8, px + pw - tw - 4), ty = Math.max(py + 4, my - 16);
			Ui.round(g, tx, ty, tw, 13, 3, 0xF0000000);
			Ui.draw(g, tooltip, tx + 5, ty + 3, Ui.TEXT);
			tooltip = null;
		}
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
		Ui.draw(g, Ui.fit(Ui.bold(Groups.title(gr)), headW), cx + 10, py + 10, Ui.TEXT);
		Ui.draw(g, Ui.fit(groupLine(gr), headW), cx + 10, py + 21, Ui.MUTED);
		g.fill(cx + 8, py + 33, cx + cw - 8, py + 34, Ui.BORDER);
		if (ourClan && showMembers) {
			drawMembers(g, clan, cx, cw);
			return;
		}

		int top = py + 38, bottom = py + ph - INPUT_H - 14;
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
			if (m.image() != null && !m.image().unreadable()) {
				int[] used = drawPicture(g, m.image(), m.at(), gr.nameOf(m.from()), mine, cx, cw, maxBubble, y, top, bottom, mx, my);
				y = used[0];
				total += used[1];
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
			Component time = Ui.text(TIME.format(Instant.ofEpochMilli(m.at())));
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
			int ly = by + 5;
			for (FormattedCharSequence l : lines) {
				g.text(font, l, bx2 + 6, ly, Ui.TEXT, false);
				ly += 10;
			}
			Ui.draw(g, time, bx2 + bw - 6 - Ui.width(time), ly, mine ? 0xB3FFFFFF : Ui.MUTED);
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
		if (Ui.inside(mx, my, ix, fy, 20, INPUT_H)) {
			Component tip = Ui.tr("slashclient-hud.picture.button");
			int tw = Ui.width(tip) + 10;
			int tx = Math.min(mx + 8, px + pw - tw - 4), ty = Math.max(py + 4, my - 16);
			Ui.round(g, tx, ty, tw, 13, 3, 0xF0000000);
			Ui.draw(g, tip, tx + 5, ty + 3, Ui.TEXT);
		}
	}

	/** The clan's members: online first within each role, with the role (managing them is in the launcher). */
	private void drawMembers(GuiGraphicsExtractor g, Groups.Clan clan, int cx, int cw) {
		int y = py + 40;
		y = Ui.wrapped(g, Ui.tr("slashclient-hud.clan.manage"), cx + 10, y, cw - 20, Ui.MUTED) + 3;
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
		Component title = Ui.trBold(mine ? "slashclient-hud.invite.sent" : "slashclient-hud.invite.title");
		Component where = Ui.text(m.inviteVersion().isEmpty() ? m.invite() : m.invite() + " · " + m.inviteVersion());
		Component join = Ui.tr("slashclient-hud.invite.join");
		int bw = Math.min(maxBubble, Math.max(Math.max(Ui.width(title), Ui.width(where)) + 18, mine ? 0 : Ui.buttonWidth(join, "play", 16, 2)) + 12);
		int bh = mine ? 30 : 50;
		y -= bh + 4;
		if (y > bottom || y + bh < top) return new int[] { y, bh + 4 };
		int bx = mine ? cx + cw - 10 - bw : cx + 10;
		Ui.round(g, bx, y, bw, bh, 5, mine ? Ui.ACCENT_DARK : Ui.CARD);
		Ui.roundOutline(g, bx, y, bw, bh, 5, mine ? 0x40FFFFFF : 0x663B82F6);
		Ui.icon(g, "play", bx + 6, y + 6, 8, mine ? Ui.TEXT : Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(title, bw - 24), bx + 18, y + 6, Ui.TEXT);
		Ui.draw(g, Ui.fit(where, bw - 12), bx + 6, y + 17, mine ? 0xCCFFFFFF : Ui.TEXT_2);
		if (!mine) {
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
