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
	/** Messages scrolled up from the newest, in pixels. */
	private int scroll;
	private int maxScroll;
	private record Hit(int x, int y, int w, int h, Runnable action) {}
	private final List<Hit> hits = new ArrayList<>();
	/** What the button under the mouse does, drawn last. */
	private Component tooltip;

	// the panel, recomputed on every resize
	private int px, py, pw, ph;

	public FriendsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.friends"));
		this.parent = parent;
		selected = Social.viewing;
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
		input.visible = selected != null;
		addRenderableWidget(input);
		if (selected != null) setInitialFocus(input);
	}

	private void select(String id) {
		selected = id;
		scroll = 0;
		Social.open(id);
		input.visible = true;
		setFocused(input);
		input.setFocused(true);
	}

	private void send() {
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
		Ui.draw(g, Ui.trBold("slashclient-hud.friends.title", Social.onlineCount()), px + 10, py + 10, Ui.TEXT);
		// a party: several friends invited here at once (or the one the player is in)
		if (!friends.isEmpty() && (Social.currentServer() != null || Party.current() != null)) {
			Ui.button(g, "friends:party", px + LIST_W - 26, py + 6, 20, 16, "m-friends", Component.empty(), Party.current() != null, mx, my);
			hits.add(new Hit(px + LIST_W - 26, py + 6, 20, 16, () -> minecraft.setScreenAndShow(PickFriendsScreen.party(this))));
		}
		int y = py + 26;
		if (friends.isEmpty()) {
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

	private void drawChat(GuiGraphicsExtractor g, int mx, int my) {
		int cx = px + LIST_W + 1, cw = pw - LIST_W - 1;
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
				int[] used = drawPicture(g, m, f.name(), mine, cx, cw, maxBubble, y, top, bottom, mx, my);
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
	private int[] drawPicture(GuiGraphicsExtractor g, Social.Message m, String friendName, boolean mine, int cx, int cw, int maxBubble, int y, int top, int bottom, int mx, int my) {
		Social.Image img = m.image();
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
		Component time = Ui.text(TIME.format(Instant.ofEpochMilli(m.at())));
		Ui.draw(g, time, bx + bw - 4 - Ui.width(time), y + bh - 11, mine ? 0xB3FFFFFF : Ui.MUTED);
		if (tex.ready() && y + 4 >= top && y + 4 + size[1] <= bottom) {
			String from = mine ? Social.myName() : friendName;
			hits.add(new Hit(bx + 4, y + 4, size[0], size[1], () -> minecraft.setScreenAndShow(new PictureScreen(this, img.id(), from))));
		}
		return new int[] { y, bh + 4 };
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
