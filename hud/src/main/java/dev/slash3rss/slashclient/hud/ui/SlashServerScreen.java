package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.PartnerServers;
import dev.slash3rss.slashclient.hud.PinnedServer;
import dev.slash3rss.slashclient.hud.ServerFriends;
import dev.slash3rss.slashclient.hud.ServerPacks;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.mixin.JoinMultiplayerScreenAccessor;
import dev.slash3rss.slashclient.hud.mixin.NetworkServerEntryAccessor;
import dev.slash3rss.slashclient.hud.mixin.OnlineServerEntryAccessor;
import dev.slash3rss.slashclient.hud.mixin.ServerSelectionListAccessor;
import net.minecraft.ChatFormatting;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.multiplayer.ServerSelectionList;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.server.LanServer;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.network.protocol.status.ServerStatus;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The SlashClient server list, in the look of our main and pause menus: one panel with a search
 * box on top, every server as a card (icon, name, the server's message in its colours, players
 * with a small bar, the ping as coloured bars, another game version marked in red, partners with
 * their picture and gold badge, pinned ones with a pin), the LAN games below, and the game's
 * actions at the bottom. Keys: arrows choose, Shift+arrows move a server, Enter joins, Delete
 * removes (after asking), F5 refreshes, typing searches.
 *
 * It is the game's own screen underneath (a subclass): the game's list stays alive but hidden, so
 * servers are pinged, their icons loaded and LAN games found exactly as the game does it, and
 * adding, editing, deleting and joining go through the game's own code. Only the drawing and the
 * input are ours. Switched off in the settings, the game's screen shows as it always did.
 */
public class SlashServerScreen extends JoinMultiplayerScreen {
	private static final int CARD_H = 36, CARD_GAP = 3, HEADER_H = 14;
	/** A friend's face next to a server (ServerFriends). */
	private static final int FACE = 11;
	/** The keyboard's modifier bits (as GLFW gives them). */
	private static final int MOD_SHIFT = 1, MOD_CONTROL = 2;

	/** For the test: servers that were never pinged get a made-up answer instead (no network). */
	public static boolean sampleStatusForTest;

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final List<Hit> hits = new ArrayList<>();
	/** The game's buttons by their text's key ("selectServer.add"...), pressed for its own actions. */
	private final Map<String, Button> vanilla = new HashMap<>();
	private final Scrollbar bar = new Scrollbar();
	private EditBox search;
	private String query = "";
	private float scroll, maxScroll;
	/** How high the list's content was last drawn, for the panel's height. */
	private int contentH = 160;
	/** The chosen server (ServerData) or LAN game (LanServer), or null. */
	private Object selected;
	/** The server asked about before it is deleted, or null. */
	private ServerData confirm;
	private Object lastClicked;
	private long lastClickAt;
	/** What shows now, in order (for the keys), and where each one is in the scrolled content. */
	private final List<Object> shown = new ArrayList<>();
	private final Map<Object, Integer> shownY = new java.util.IdentityHashMap<>();
	private int listY, listH;
	private List<Component> tip;
	private int tipX, tipY;
	/** Where friends' faces were drawn last, by the server's name (for the test's mouse). */
	private final Map<String, int[]> facesAt = new HashMap<>();

	public SlashServerScreen(Screen parent) {
		super(parent);
	}

	private JoinMultiplayerScreenAccessor game() {
		return (JoinMultiplayerScreenAccessor) this;
	}

	private ServerSelectionListAccessor rows() {
		return (ServerSelectionListAccessor) serverSelectionList;
	}

	@Override
	protected void init() {
		// the game sets up its list, its LAN search and its buttons; we keep them and draw our own
		super.init();
		vanilla.clear();
		for (GuiEventListener child : List.copyOf(children())) {
			if (child instanceof Button b && b.getMessage().getContents() instanceof TranslatableContents t) vanilla.put(t.getKey(), b);
		}
		clearWidgets();
		setFocused(null);
		search = new EditBox(font, 0, 0, 100, 12, Ui.tr("slashclient-hud.serverList.search"));
		search.setBordered(false);
		search.setTextColor(Ui.TEXT);
		search.setMaxLength(64);
		search.setHint(Ui.tr("slashclient-hud.serverList.search"));
		search.setValue(query);
		search.setResponder(v -> {
			query = v;
			scroll = 0;
		});
		addWidget(search);
	}

	// ---------- the servers ----------

	private enum Status { PINGING, UNREACHABLE, INCOMPATIBLE, ONLINE }

	private static Status status(ServerData d) {
		//#if MC >= 1.21
		return switch (d.state()) {
			case UNREACHABLE -> Status.UNREACHABLE;
			case INCOMPATIBLE -> Status.INCOMPATIBLE;
			case SUCCESSFUL -> Status.ONLINE;
			default -> Status.PINGING;
		};
		//#else
		//$ if (!d.pinged || d.ping == -2L) return Status.PINGING;
		//$ if (d.ping < 0) return Status.UNREACHABLE;
		//$ return d.protocol != net.minecraft.SharedConstants.getCurrentVersion().getProtocolVersion() ? Status.INCOMPATIBLE : Status.ONLINE;
		//#endif
	}

	/**
	 * "Another version" that is only the server's own text: networks that take several versions
	 * (ViaVersion) often send words ("NOWY SEZON 26.3", "SkyUP") instead of a version and another
	 * protocol number, and usually let the player in anyway. Shown as an online server, not red.
	 * A real version number (1.8.9, 1.21.4) other than the game's stays marked.
	 */
	public static boolean softIncompatible(ServerData d) {
		if (status(d) != Status.INCOMPATIBLE || d.version == null) return false;
		String v = d.version.getString().trim();
		// a version: "1.21.4", "Paper 1.21.4", "1.8.x-1.21.x"; anything else is the server's own words
		return !v.matches("^[A-Za-z]{0,12}\\s?\\d+\\.\\d+[\\d.xX\\s\\-–]*$");
	}

	private List<ServerData> servers() {
		List<ServerData> out = new ArrayList<>();
		for (int i = 0; i < getServers().size(); i++) out.add(getServers().get(i));
		return out;
	}

	private List<LanServer> lanServers() {
		List<LanServer> out = new ArrayList<>();
		for (ServerSelectionList.NetworkServerEntry e : rows().slashclient$lan()) out.add(((NetworkServerEntryAccessor) e).slashclient$lan());
		return out;
	}

	private ServerSelectionList.OnlineServerEntry entryOf(ServerData d) {
		for (ServerSelectionList.OnlineServerEntry e : rows().slashclient$online()) if (e.getServerData() == d) return e;
		return null;
	}

	private boolean matches(String... texts) {
		String q = query.trim().toLowerCase(Locale.ROOT);
		if (q.isEmpty()) return true;
		for (String t : texts) if (t != null && t.toLowerCase(Locale.ROOT).contains(q)) return true;
		return false;
	}

	/**
	 * The game's row of a server, drawn where nothing shows: that is where the game pings a server
	 * the first time, reads its answer and uploads its icon. Nothing of it reaches the screen.
	 */
	private void drive(GuiGraphicsExtractor g, List<ServerData> visible, float delta) {
		if (sampleStatusForTest) for (ServerData d : visible) sample(d);
		Ui.beginClip("hidden rows", 0, 0, 0, 0);
		g.enableScissor(0, 0, 0, 0);
		for (ServerData d : visible) {
			ServerSelectionList.OnlineServerEntry e = entryOf(d);
			if (e == null) continue;
			//#if MC >= 1.21.9
			e.extractContent(g, -10000, -10000, false, delta);
			//#else
			//$ e.render(g, 0, -10000, -10000, 200, 32, -10000, -10000, false, delta);
			//#endif
		}
		g.disableScissor();
		Ui.end();
	}

	// ---------- drawing ----------

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		if (minecraft.level == null) {
			extractPanorama(g, delta);
			g.fill(0, 0, width, height, 0x800A0D14);
			g.fillGradient(0, height / 2, width, height, 0x000A0D14, 0xB00A0D14);
		} else g.fill(0, 0, width, height, 0x90000000);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta) {
		// the game's own drawing (its list, its buttons) is left out: before 1.21.6 the background came with it
		//#if MC < 1.21.6
		//$ extractBackground(g, mouseX, mouseY, delta);
		//#endif
		hits.clear();
		facesAt.clear();
		tip = null;
		// under the question nothing else lights up
		int mx = confirm != null ? -1 : mouseX, my = confirm != null ? -1 : mouseY;
		if (confirm != null && getServers() != null && !servers().contains(confirm)) confirm = null;

		// wider on big screens; as high as the list needs (from the last frame), at least 200
		int pw = Math.min(width - 16, Math.max(520, Math.min(720, width / 2)));
		int bh = height >= 300 ? 20 : 18;
		int ph = Math.min(height - 12, Math.max(200, contentH + 34 + 7 + 5 + bh + 8));
		int px = (width - pw) / 2, py = Math.max(6, (height - ph) / 2);
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("server list", px, py, pw, ph);

		drawHeader(g, mx, my, px, py, pw, delta);
		int fy = py + ph - 8 - bh;
		listY = py + 34;
		listH = fy - 7 - listY;
		g.fill(px + 8, fy - 5, px + pw - 8, fy - 4, Ui.BORDER);
		drawList(g, mx, my, px + 8, listY, pw - 22, listH, delta);
		drawFooter(g, mx, my, px + 10, fy, pw - 20, bh);
		Ui.end();

		if (confirm != null) drawConfirm(g, mouseX, mouseY);
		drawTip(g);
	}

	private void drawHeader(GuiGraphicsExtractor g, int mx, int my, int px, int py, int pw, float delta) {
		int y = py + 8, s = 18;
		// on the right: refresh, the game's own list, back; the search box before them
		int cx = px + pw - 10 - s;
		iconButton(g, "close", cx, y, s, "slashclient-hud.serverList.back", mx, my, this::onClose);
		cx -= s + 4;
		iconButton(g, "back", cx, y, s, "slashclient-hud.serverList.vanilla", mx, my, () -> {
			SlashHud.config.customServerList = false;
			SlashHud.config.save();
			minecraft.setScreenAndShow(new JoinMultiplayerScreen(game().slashclient$lastScreen()));
		});
		cx -= s + 4;
		iconButton(g, "repeat", cx, y, s, "slashclient-hud.serverList.refresh", mx, my, this::refresh);
		Component title = Ui.trBold("multiplayer.title");
		int titleW = Math.min(Ui.width(title), 140);
		int sw = Math.min(180, cx - 6 - (px + 10 + 16 + titleW + 10));
		int sx = cx - 6 - sw;
		Ui.icon(g, "server", px + 10, y + 4, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(title, Math.max(20, sx - 10 - (px + 26))), px + 26, y + 5, Ui.TEXT);
		if (search != null) {
			boolean focused = search.isFocused();
			Ui.round(g, sx, y, sw, s, 4, Ui.CARD);
			Ui.roundOutline(g, sx, y, sw, s, 4, focused ? 0x993B82F6 : Ui.BORDER);
			Ui.icon(g, "search", sx + 5, y + 4, 10, focused ? Ui.ACCENT_LIGHT : Ui.MUTED);
			search.setX(sx + 19);
			search.setY(y + 5);
			search.setWidth(Math.max(10, sw - 24));
			search.extractRenderState(g, mx, my, delta);
		}
		g.fill(px + 8, y + s + 7, px + pw - 8, y + s + 8, Ui.BORDER);
	}

	private void drawList(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h, float delta) {
		List<ServerData> all = servers();
		List<ServerData> online = new ArrayList<>();
		for (ServerData d : all) if (matches(d.name, d.ip)) online.add(d);
		List<LanServer> lan = new ArrayList<>();
		for (LanServer l : lanServers()) if (matches(l.getMotd(), l.getAddress())) lan.add(l);
		if (selected instanceof ServerData d && !all.contains(d)) selected = null;
		if (selected instanceof LanServer l && !lanServers().contains(l)) selected = null;

		// where everything goes in the scrolled content
		shown.clear();
		shownY.clear();
		int cy = 0;
		cy += HEADER_H;
		for (ServerData d : online) {
			shown.add(d);
			shownY.put(d, cy);
			cy += CARD_H + CARD_GAP;
		}
		boolean emptyLine = online.isEmpty();
		int emptyAt = cy;
		if (emptyLine) cy += 22;
		int lanHeaderAt = cy + 4;
		cy += 4 + HEADER_H;
		for (LanServer l : lan) {
			shown.add(l);
			shownY.put(l, cy);
			cy += CARD_H + CARD_GAP;
		}
		int scanningAt = cy;
		if (lan.isEmpty()) cy += 18;
		contentH = cy;
		maxScroll = Math.max(0, cy - h);
		if (bar.dragging()) scroll = bar.drag(my);
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		int top = y - Math.round(scroll);

		// the game pings and loads only what would be on screen, as its own list does
		List<ServerData> visible = new ArrayList<>();
		for (ServerData d : online) {
			int ry = top + shownY.get(d);
			if (ry + CARD_H > y && ry < y + h) visible.add(d);
		}
		drive(g, visible, delta);

		boolean overList = Ui.inside(mx, my, x, y, w, h);
		Ui.beginClip("server cards", x, y, w, h);
		g.enableScissor(x, y, x + w, y + h);
		section(g, x, top, w, Ui.tr("slashclient-hud.serverList.yours", all.size()));
		for (ServerData d : online) {
			int ry = top + shownY.get(d);
			if (ry + CARD_H <= y || ry >= y + h) continue;
			serverCard(g, d, x, ry, w, CARD_H, overList ? mx : -1, overList ? my : -1);
			clickable(x, ry, w, CARD_H, y, h, () -> clicked(d));
		}
		if (emptyLine) {
			Component text = query.isBlank() ? Ui.tr("slashclient-hud.serverList.empty") : Ui.tr("slashclient-hud.serverList.noMatch", query.trim());
			Ui.draw(g, Ui.fit(text, w - 16), x + 8, top + emptyAt + 6, Ui.MUTED);
		}
		section(g, x, top + lanHeaderAt, w, Ui.tr("slashclient-hud.serverList.lan"));
		for (LanServer l : lan) {
			int ry = top + shownY.get(l);
			if (ry + CARD_H <= y || ry >= y + h) continue;
			lanCard(g, l, x, ry, w, CARD_H, overList ? mx : -1, overList ? my : -1);
			clickable(x, ry, w, CARD_H, y, h, () -> clicked(l));
		}
		if (lan.isEmpty()) {
			// a few dots that come and go while the game listens for LAN games
			int dots = (int) (System.currentTimeMillis() / 400 % 4);
			Component text = Ui.text(Ui.tr("slashclient-hud.serverList.scanning").getString() + ".".repeat(dots));
			Ui.icon(g, "world", x + 8, top + scanningAt + 3, 9, Ui.MUTED);
			Ui.draw(g, Ui.fit(text, w - 30), x + 22, top + scanningAt + 4, Ui.MUTED);
		}
		g.disableScissor();
		Ui.end();
		bar.hide();
		bar.draw(g, x + w + 3, y, h, scroll, maxScroll, mx, my);
	}

	/** A small heading with a line after it. */
	private void section(GuiGraphicsExtractor g, int x, int y, int w, Component text) {
		Component t = Ui.fit(text, w - 40);
		Ui.draw(g, t, x + 2, y + 3, Ui.TEXT_2);
		int after = x + 2 + Ui.width(t) + 6;
		if (after < x + w) g.fill(after, y + 7, x + w, y + 8, Ui.BORDER);
	}

	/** A card's clickable part: only what is inside the list (a half-hidden card is clicked where it shows). */
	private void clickable(int x, int ry, int w, int h, int listTop, int listH, Runnable action) {
		int top = Math.max(ry, listTop), bottom = Math.min(ry + h, listTop + listH);
		if (bottom > top) hits.add(new Hit(x, top, w, bottom - top, action));
	}

	private void cardBase(GuiGraphicsExtractor g, String id, boolean partner, ServerData d, int x, int y, int w, int h, boolean over, boolean sel, int warn) {
		float t = Ui.hover("srv:" + id, over || sel);
		Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
		if (partner) PartnerServers.drawBehind(g, d, x + 1, y + 1, w - 2, h - 2);
		int edge = sel ? 0xDD3B82F6 : warn != 0 ? warn : Ui.blend(Ui.BORDER, 0x663B82F6, t);
		if (partner && !sel) PartnerServers.drawFrame(g, x + 1, y + 1, w - 2, h - 2);
		else Ui.roundOutline(g, x, y, w, h, 5, edge);
		if (sel) Ui.round(g, x + 1, y + 7, 2, h - 14, 1, Ui.ACCENT_LIGHT);
	}

	private void serverCard(GuiGraphicsExtractor g, ServerData d, int x, int y, int w, int h, int mx, int my) {
		boolean over = Ui.inside(mx, my, x, y, w, h);
		boolean sel = selected == d;
		Status st = status(d);
		// a version that is only words: drawn as an online server (softIncompatible)
		if (softIncompatible(d)) st = Status.ONLINE;
		boolean partner = PartnerServers.isPartner(d);
		cardBase(g, "s" + System.identityHashCode(d), partner, d, x, y, w, h, over, sel, st == Status.INCOMPATIBLE ? 0x88EF4444 : 0);
		Ui.begin("card", x, y, w, h);

		// the icon: the partner's own animation, else the one the server sent (or the game's "unknown")
		int ix = x + 4, iy = y + (h - 32) / 2;
		if (!dev.slash3rss.slashclient.hud.PartnerIcons.draw(g, d, ix, iy, 32)) {
			ServerSelectionList.OnlineServerEntry e = entryOf(d);
			if (e != null) g.blit(RenderPipelines.GUI_TEXTURED, ((OnlineServerEntryAccessor) e).slashclient$icon().textureLocation(), ix, iy, 0, 0, 32, 32, 32, 32);
		}

		// the right column: ping on top, players (or the other version) under it
		int rw = 62, rx = x + w - rw - 6;
		int tx = x + 42, textW = rx - 6 - tx;
		signal(g, d, st, rx + rw - 16, y + 5, mx, my);
		if (st == Status.INCOMPATIBLE) {
			Component v = Ui.fit(Ui.text(d.version == null ? "?" : d.version.getString()), rw - 16);
			int vw = Ui.width(v) + 14;
			int vx = rx + rw - vw, vy = y + 19;
			Ui.round(g, vx, vy, vw, 12, 3, 0x40EF4444);
			Ui.icon(g, "ban", vx + 3, vy + 2, 8, 0xFFF87171);
			Ui.draw(g, v, vx + 12, vy + 2, 0xFFFCA5A5);
			if (Ui.inside(mx, my, vx, vy, vw, 12)) tipAt(List.of(Ui.tr("slashclient-hud.serverList.incompatible", d.version == null ? "?" : d.version.getString())), mx, my);
		} else if (st == Status.ONLINE && d.players != null) players(g, d, rx, y + 17, rw, mx, my);

		// the name, a pin for the pinned ones, the partner badge
		// the resource pack mode (ServerPacks), when it does not just ask: a small tag at the end of the name's line
		int tag = ServerPacks.of(d) == ServerPacks.Mode.PROMPT ? 0 : ServerPacks.tagWidth(d) + 4;
		if (tag > 0) ServerPacks.drawTag(g, d, tx, y + 2, rx - 4 - tx, 10);
		// friends playing there now (ServerFriends): their faces at the end of the name's line, who they are on hover
		List<dev.slash3rss.slashclient.hud.social.Social.Friend> friends = ServerFriends.on(d);
		int fw = ServerFriends.width(friends, FACE);
		if (fw > 0) {
			int fx = rx - 6 - tag - fw;
			ServerFriends.draw(g, friends, fx, y + 2, FACE);
			facesAt.put(d.name, new int[] { fx, y + 2, fw, FACE });
			if (Ui.inside(mx, my, fx - 1, y + 1, fw + 2, FACE + 2)) tipAt(ServerFriends.tip(friends), mx, my);
			fw += 6;
		}
		Component name = Ui.fit(Ui.bold(d.name == null ? "" : d.name), textW - tag - fw - (PinnedServer.is(d) ? 12 : 0) - (partner ? PartnerServers.pillWidth() + 4 : 0));
		Ui.draw(g, name, tx, y + 4, Ui.TEXT);
		int after = tx + Ui.width(name) + 4;
		if (PinnedServer.is(d)) {
			Ui.icon(g, "thumbtack", after, y + 3, 9, Ui.ACCENT_LIGHT);
			if (Ui.inside(mx, my, after, y + 3, 9, 9)) tipAt(List.of(Ui.tr("slashclient-hud.serverList.pinned")), mx, my);
			after += 12;
		}
		if (partner) PartnerServers.drawPill(g, after, y + 4);

		// the server's message in its own colours, two lines at most; while it is asked, a note
		int ly = y + 15;
		if (st == Status.PINGING) Ui.draw(g, Ui.tr("slashclient-hud.serverList.pinging"), tx, ly, Ui.MUTED);
		else {
			Component motd = d.motd == null || d.motd.getString().isBlank() ? (st == Status.UNREACHABLE ? Ui.tr("slashclient-hud.serverList.unreachable").copy().withStyle(ChatFormatting.RED) : Component.empty()) : d.motd;
			int lines = 0;
			for (var line : font.split(motd, Math.max(10, textW))) {
				if (lines++ == 2) break;
				g.text(font, line, tx, ly, Ui.TEXT_2, false);
				ly += 10;
			}
		}
		Ui.end();
	}

	/** Five bars for the ping, coloured by how quick it is; moving while the server is asked, red when it does not answer. */
	private void signal(GuiGraphicsExtractor g, ServerData d, Status st, int x, int y, int mx, int my) {
		int level;
		int color;
		if (st == Status.PINGING) {
			level = (int) (System.currentTimeMillis() / 150 % 8);
			level = level > 4 ? 8 - level : level;
			level += 1;
			color = Ui.MUTED;
		} else if (st == Status.UNREACHABLE) {
			level = 0;
			color = 0xFFF87171;
		} else {
			long p = d.ping;
			level = p < 150 ? 5 : p < 300 ? 4 : p < 600 ? 3 : p < 1000 ? 2 : 1;
			color = level >= 4 ? Ui.GREEN : level == 3 ? 0xFFFACC15 : level == 2 ? 0xFFFB923C : 0xFFF87171;
		}
		for (int i = 0; i < 5; i++) {
			int bh = 2 + i * 2;
			g.fill(x + i * 3, y + 10 - bh, x + i * 3 + 2, y + 10, i < level ? color : 0x30FFFFFF);
		}
		if (st == Status.UNREACHABLE) Ui.icon(g, "close", x + 4, y + 1, 7, 0xFFF87171);
		if (st == Status.ONLINE || st == Status.INCOMPATIBLE) {
			Component ms = Ui.text(d.ping + " ms");
			Ui.draw(g, ms, x - 4 - Ui.width(ms), y + 2, Ui.MUTED);
		}
		if (Ui.inside(mx, my, x - 30, y, 46, 11)) {
			Component text = switch (st) {
				case PINGING -> Ui.tr("slashclient-hud.serverList.pinging");
				case UNREACHABLE -> Ui.tr("slashclient-hud.serverList.unreachable");
				default -> Ui.tr("slashclient-hud.serverList.ping", d.ping);
			};
			tipAt(List.of(text), mx, my);
		}
	}

	/** "12/100" and a thin bar of how full the server is; the names the server lists show on hover. */
	private void players(GuiGraphicsExtractor g, ServerData d, int x, int y, int w, int mx, int my) {
		ServerStatus.Players p = d.players;
		Component count = Ui.text(p.online() + "/" + p.max());
		Ui.icon(g, "user", x + w - Ui.width(count) - 11, y, 8, Ui.MUTED);
		Ui.draw(g, count, x + w - Ui.width(count), y, Ui.TEXT_2);
		int by = y + 11;
		float full = p.max() <= 0 ? 0 : Math.min(1f, p.online() / (float) p.max());
		Ui.round(g, x + 14, by, w - 14, 3, 1, 0x30FFFFFF);
		if (full > 0) Ui.round(g, x + 14, by, Math.max(2, Math.round((w - 14) * full)), 3, 1, full >= 0.95f ? 0xFFF87171 : Ui.ACCENT);
		if (Ui.inside(mx, my, x, y - 1, w, 16)) {
			List<Component> lines = new ArrayList<>();
			lines.add(Ui.tr("slashclient-hud.serverList.players", p.online(), p.max()));
			if (d.playerList != null) lines.addAll(d.playerList);
			tipAt(lines, mx, my);
		}
	}

	private void lanCard(GuiGraphicsExtractor g, LanServer l, int x, int y, int w, int h, int mx, int my) {
		boolean over = Ui.inside(mx, my, x, y, w, h);
		cardBase(g, "l" + l.getAddress(), false, null, x, y, w, h, over, selected == l, 0);
		Ui.begin("lan card", x, y, w, h);
		Ui.round(g, x + 4, y + 2, 32, 32, 4, 0x332563EB);
		Ui.icon(g, "world", x + 12, y + 10, 16, Ui.ACCENT_LIGHT);
		int tx = x + 42;
		Ui.draw(g, Ui.fit(Ui.bold(l.getMotd()), w - 50), tx, y + 4, Ui.TEXT);
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.serverList.lanWorld"), w - 50), tx, y + 15, Ui.TEXT_2);
		String address = minecraft.options.hideServerAddress ? "" : l.getAddress();
		Ui.draw(g, Ui.fit(Ui.text(address), w - 50), tx, y + 25, Ui.MUTED);
		Ui.end();
	}

	private void drawFooter(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		ServerData server = selected instanceof ServerData d ? d : null;
		int index = server == null ? -1 : servers().indexOf(server);
		boolean canDelete = server != null && !PinnedServer.is(server);
		// the two arrows on the right, the named buttons sharing the rest
		int ax = x + w - h * 2 - 4;
		iconAction(g, "arrow-up", ax, y, h, "slashclient-hud.serverList.up", canMove(index, -1), mx, my, () -> move(-1));
		iconAction(g, "arrow-down", ax + h + 4, y, h, "slashclient-hud.serverList.down", canMove(index, 1), mx, my, () -> move(1));
		String[][] named = {
			{ "join", "play", "slashclient-hud.serverList.join" },
			{ "direct", "plug", "slashclient-hud.serverList.direct" },
			{ "add", "plus", "slashclient-hud.serverList.add" },
			{ "edit", "pen", "slashclient-hud.serverList.edit" },
			{ "delete", "trash", "slashclient-hud.serverList.delete" },
		};
		boolean[] on = { selected != null, true, true, server != null, canDelete };
		Runnable[] actions = { this::joinSelected, () -> press("selectServer.direct"), () -> press("selectServer.add"), this::editSelected, this::askDelete };
		int gap = 4, avail = ax - 8 - x;
		int bw = (avail - gap * (named.length - 1)) / named.length;
		// too narrow for the names: icons only, the names on hover
		boolean labels = true;
		for (String[] n : named) if (Ui.buttonWidth(Ui.tr(n[2]), n[1], h, 2) > bw) labels = false;
		for (int i = 0; i < named.length; i++) {
			int bx = x + i * (bw + gap);
			Component label = labels ? Ui.tr(named[i][2]) : Component.empty();
			button(g, "srvbtn:" + named[i][0], bx, y, bw, h, named[i][1], label, i == 0 ? 1 : i == 4 ? 2 : 0, on[i], mx, my, actions[i]);
			if (!labels && Ui.inside(mx, my, bx, y, bw, h)) tipAt(List.of(Ui.tr(named[i][2])), bx + bw / 2, y - 4);
		}
	}

	/** A button in our look: kind 1 is the blue one, 2 the red one; a greyed out one does nothing. */
	private void button(GuiGraphicsExtractor g, String id, int x, int y, int w, int h, String icon, Component label, int kind, boolean enabled, int mx, int my, Runnable action) {
		boolean over = enabled && Ui.inside(mx, my, x, y, w, h);
		float t = Ui.hover(id, over);
		if (!enabled) {
			Ui.round(g, x, y, w, h, 4, 0xFF131825);
			Ui.roundOutline(g, x, y, w, h, 4, 0x10FFFFFF);
		} else if (kind == 1) Ui.accent(g, x, y, w, h, 4, t);
		else {
			Ui.round(g, x, y, w, h, 4, Ui.blend(Ui.CARD, kind == 2 ? 0xFF2A1720 : Ui.CARD_HOVER, t));
			Ui.roundOutline(g, x, y, w, h, 4, Ui.blend(Ui.BORDER, kind == 2 ? 0x88EF4444 : 0x883B82F6, t));
		}
		int color = !enabled ? 0xFF4B5563 : kind == 1 ? 0xFFFFFFFF : kind == 2 ? Ui.blend(0xFFF87171, 0xFFFCA5A5, t) : Ui.blend(Ui.TEXT_2, Ui.TEXT, t);
		boolean hasLabel = !label.getString().isEmpty();
		int iconSize = Math.min(10, h - 8);
		Component fitted = hasLabel ? Ui.fit(label, w - 10 - iconSize - 5) : label;
		int total = iconSize + (hasLabel ? 5 + Ui.width(fitted) : 0);
		int left = x + (w - total) / 2;
		Ui.icon(g, icon, left, y + (h - iconSize) / 2, iconSize, color);
		if (hasLabel) Ui.draw(g, fitted, left + iconSize + 5, y + (h - 8) / 2, color);
		if (enabled) hits.add(new Hit(x, y, w, h, action));
	}

	private void iconAction(GuiGraphicsExtractor g, String icon, int x, int y, int s, String tipKey, boolean enabled, int mx, int my, Runnable action) {
		button(g, "srvbtn:" + icon, x, y, s, s, icon, Component.empty(), 0, enabled, mx, my, action);
		if (Ui.inside(mx, my, x, y, s, s)) tipAt(List.of(Ui.tr(tipKey)), x + s / 2, y - 4);
	}

	private void iconButton(GuiGraphicsExtractor g, String icon, int x, int y, int s, String tipKey, int mx, int my, Runnable action) {
		iconAction(g, icon, x, y, s, tipKey, true, mx, my, action);
	}

	/** Asking before a server is deleted: a small window over the list, in our look. */
	private void drawConfirm(GuiGraphicsExtractor g, int mx, int my) {
		Ui.layer(g);
		g.fill(0, 0, width, height, 0xA0000000);
		int dw = Math.min(260, width - 24);
		Component text = Ui.tr("slashclient-hud.serverList.deleteText", confirm.name);
		int lines = font.split(text, dw - 24).size();
		int bh = 18;
		int dh = 12 + 10 + 8 + lines * 11 + 10 + bh + 12;
		int dx = (width - dw) / 2, dy = (height - dh) / 2;
		Ui.panel(g, dx, dy, dw, dh);
		Ui.begin("delete question", dx, dy, dw, dh);
		Ui.icon(g, "trash", dx + 12, dy + 12, 10, 0xFFF87171);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.serverList.deleteTitle"), dw - 40), dx + 28, dy + 13, Ui.TEXT);
		int ty = Ui.wrapped(g, text, dx + 12, dy + 30, dw - 24, Ui.TEXT_2);
		int by = ty + 10, half = (dw - 24 - 6) / 2;
		button(g, "srvconfirm:cancel", dx + 12, by, half, bh, "close", Ui.tr("slashclient-hud.serverList.cancel"), 0, true, mx, my, () -> confirm = null);
		button(g, "srvconfirm:delete", dx + dw - 12 - half, by, half, bh, "trash", Ui.tr("slashclient-hud.serverList.delete"), 2, true, mx, my, this::deleteConfirmed);
		Ui.end();
	}

	private void tipAt(List<Component> lines, int x, int y) {
		tip = lines;
		tipX = x;
		tipY = y;
	}

	/** The tooltip in our look: a dark label, kept inside the screen, above everything. */
	private void drawTip(GuiGraphicsExtractor g) {
		if (tip == null || tip.isEmpty()) return;
		List<Component> lines = new ArrayList<>();
		for (Component c : tip.subList(0, Math.min(tip.size(), 12))) lines.add(Ui.fit(c, width - 24));
		int w = 0;
		for (Component c : lines) w = Math.max(w, Ui.width(c));
		w += 12;
		int h = lines.size() * 10 + 6;
		int x = Math.max(4, Math.min(width - w - 4, tipX - w / 2));
		int y = tipY - h - 2 >= 4 ? tipY - h - 2 : Math.min(height - h - 4, tipY + 14);
		Ui.layer(g);
		Ui.round(g, x, y, w, h, 4, 0xF0111622);
		Ui.roundOutline(g, x, y, w, h, 4, 0x403B82F6);
		int ly = y + 4;
		for (Component c : lines) {
			// a server's own lines keep their colours; ours are plain text
			if (c.getStyle().getColor() == null) Ui.draw(g, c, x + 6, ly, Ui.TEXT);
			else g.text(font, c, x + 6, ly, Ui.TEXT, false);
			ly += 10;
		}
	}

	// ---------- actions ----------

	private void clicked(Object item) {
		long now = System.currentTimeMillis();
		boolean twice = item == lastClicked && now - lastClickAt < 350;
		select(item);
		lastClicked = item;
		lastClickAt = now;
		if (twice) joinSelected();
	}

	/** Chooses a server; the game's hidden list follows, so its own edit and delete act on it. */
	private void select(Object item) {
		selected = item;
		ServerSelectionList.Entry entry = null;
		if (item instanceof ServerData d) entry = entryOf(d);
		else if (item instanceof LanServer l) {
			for (ServerSelectionList.NetworkServerEntry e : rows().slashclient$lan()) if (((NetworkServerEntryAccessor) e).slashclient$lan() == l) entry = e;
		}
		serverSelectionList.setSelected(entry);
	}

	private void joinSelected() {
		if (selected instanceof ServerData d) game().slashclient$join(d);
		else if (selected instanceof LanServer l) {
			//#if MC >= 1.20.2
			game().slashclient$join(new ServerData(l.getMotd(), l.getAddress(), ServerData.Type.LAN));
			//#else
			//$ game().slashclient$join(new ServerData(l.getMotd(), l.getAddress(), true));
			//#endif
		}
	}

	private void editSelected() {
		if (!(selected instanceof ServerData)) return;
		select(selected);
		press("selectServer.edit");
	}

	private void askDelete() {
		if (selected instanceof ServerData d && !PinnedServer.is(d)) confirm = d;
	}

	/** Deleting the game's way (it also saves the list), after the question was answered. */
	private void deleteConfirmed() {
		ServerData d = confirm;
		confirm = null;
		if (d == null) return;
		select(d);
		selected = null;
		game().slashclient$deleteCallback(true);
	}

	private boolean canMove(int index, int dir) {
		int to = index + dir;
		return index >= 0 && to >= 0 && to < getServers().size() && !PinnedServer.blocksSwap(servers(), index, to);
	}

	/** Moves the chosen server up or down the list (never past the pinned ones on top). */
	private void move(int dir) {
		if (!(selected instanceof ServerData d)) return;
		int index = servers().indexOf(d);
		if (!canMove(index, dir)) return;
		getServers().swap(index, index + dir);
		getServers().save();
		serverSelectionList.updateOnlineServers(getServers());
		select(d);
		reveal(d);
	}

	private void refresh() {
		SlashServerScreen next = new SlashServerScreen(game().slashclient$lastScreen());
		next.query = query;
		minecraft.setScreenAndShow(next);
	}

	/** One of the game's own buttons, pressed: its code opens its screens and saves the list. */
	private void press(String key) {
		Button b = vanilla.get(key);
		if (b == null) return;
		//#if MC >= 1.21.9
		b.onPress(new KeyEvent(InputConstants.KEY_RETURN, 0, 0));
		//#else
		//$ b.onPress();
		//#endif
	}

	/** Moves the choice by one, scrolling it into view. */
	private void step(int dir) {
		if (shown.isEmpty()) return;
		int i = shown.indexOf(selected);
		int next = i < 0 ? (dir > 0 ? 0 : shown.size() - 1) : Math.max(0, Math.min(shown.size() - 1, i + dir));
		select(shown.get(next));
		reveal(shown.get(next));
	}

	private void reveal(Object item) {
		Integer at = shownY.get(item);
		if (at == null) return;
		if (at - HEADER_H < scroll) scroll = Math.max(0, at - HEADER_H);
		else if (at + CARD_H > scroll + listH) scroll = Math.min(maxScroll, at + CARD_H - listH);
	}

	// ---------- input ----------

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		int k = e.key();
		boolean enter = k == InputConstants.KEY_RETURN || k == InputConstants.KEY_NUMPADENTER;
		if (confirm != null) {
			if (enter) deleteConfirmed();
			else if (k == InputConstants.KEY_ESCAPE) confirm = null;
			return true;
		}
		boolean shift = (e.modifiers() & MOD_SHIFT) != 0;
		boolean typing = search != null && search.isFocused();
		if (k == InputConstants.KEY_UP || k == InputConstants.KEY_DOWN) {
			int dir = k == InputConstants.KEY_UP ? -1 : 1;
			if (shift) move(dir);
			else step(dir);
			return true;
		}
		if (enter) {
			if (selected == null && !shown.isEmpty()) select(shown.get(0));
			joinSelected();
			return true;
		}
		if (k == InputConstants.KEY_DELETE && (!typing || query.isEmpty())) {
			askDelete();
			return true;
		}
		if (k == InputConstants.KEY_F5) {
			refresh();
			return true;
		}
		if (k == InputConstants.KEY_F && (e.modifiers() & MOD_CONTROL) != 0 && search != null) {
			setFocused(search);
			return true;
		}
		// Esc first empties the search, then leaves
		if (k == InputConstants.KEY_ESCAPE && typing && !query.isEmpty()) {
			search.setValue("");
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(keyCode, scanCode, modifiers);
		//#endif
	}

	// typing anywhere searches
	@Override
	//#if MC >= 1.21.9
	public boolean charTyped(net.minecraft.client.input.CharacterEvent e) {
		if (search != null && confirm == null && !search.isFocused()) setFocused(search);
		return super.charTyped(e);
	}
	//#else
	//$ public boolean charTyped(char c, int modifiers) {
	//$ 	if (search != null && confirm == null && !search.isFocused()) setFocused(search);
	//$ 	return super.charTyped(c, modifiers);
	//$ }
	//#endif

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (confirm == null && search != null && Ui.inside(e.x(), e.y(), search.getX() - 19, search.getY() - 5, search.getWidth() + 24, 18)) {
			setFocused(search);
			//#if MC >= 1.21.9
			return super.mouseClicked(e, doubleClick);
			//#else
			//$ return super.mouseClicked(mouseX, mouseY, button);
			//#endif
		}
		if (search != null) search.setFocused(false);
		setFocused(null);
		if (confirm == null && bar.press(e.x(), e.y())) {
			scroll = bar.drag(e.y());
			return true;
		}
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		// a click beside the question closes it
		if (confirm != null) confirm = null;
		return true;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
	//#else
	//$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (bar.dragging()) {
			scroll = bar.drag(e.y());
			return true;
		}
		//#if MC >= 1.21.9
		return super.mouseDragged(e, dx, dy);
		//#else
		//$ return super.mouseDragged(mouseX, mouseY, button, dx, dy);
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseReleased(MouseButtonEvent e) {
	//#else
	//$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		bar.release();
		//#if MC >= 1.21.9
		return super.mouseReleased(e);
		//#else
		//$ return super.mouseReleased(mouseX, mouseY, button);
		//#endif
	}

	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//#endif
		if (confirm == null) scroll = Math.max(0, Math.min(maxScroll, scroll - (float) v * 24));
		return true;
	}

	// ---------- for the test ----------

	/** The names (or LAN addresses) shown now, in order. */
	public List<String> shownForTest() {
		List<String> out = new ArrayList<>();
		for (Object o : shown) out.add(o instanceof ServerData d ? d.name : ((LanServer) o).getMotd());
		return out;
	}

	public String selectedForTest() {
		return selected instanceof ServerData d ? d.name : selected instanceof LanServer l ? l.getMotd() : "";
	}

	public boolean confirmingForTest() {
		return confirm != null;
	}

	/** The names of the friends whose faces show on that server's card (by the server's name). */
	public List<String> friendsForTest(String name) {
		List<String> out = new ArrayList<>();
		for (ServerData d : servers()) if (name.equals(d.name)) for (var f : ServerFriends.on(d)) out.add(f.name());
		return out;
	}

	/** Where that server's friends' faces were drawn last (x, y, width, height), or null. */
	public int[] facesForTest(String name) {
		return facesAt.get(name);
	}

	/** The tooltip's lines this frame, as text. */
	public List<String> tipForTest() {
		List<String> out = new ArrayList<>();
		if (tip != null) for (Component c : tip) out.add(c.getString());
		return out;
	}

	public void searchForTest(String text) {
		search.setValue(text);
	}

	public void selectForTest(String name) {
		for (Object o : shown) if (o instanceof ServerData d && name.equals(d.name)) select(d);
	}

	/** Made-up answers for the test servers ("*.test") and the partners, as if they had been pinged. */
	private static void sample(ServerData d) {
		//#if MC >= 1.21
		if (d.state() != ServerData.State.INITIAL) return;
		//#else
		//$ if (d.pinged) return;
		//$ d.pinged = true;
		//$ d.protocol = net.minecraft.SharedConstants.getCurrentVersion().getProtocolVersion();
		//#endif
		int seed = Math.abs((d.ip == null ? "" : d.ip).hashCode());
		String ip = d.ip == null ? "" : d.ip;
		d.ping = 18 + seed % 5 * 70;
		d.motd = Component.literal("Witaj na " + d.name + "! ").withStyle(ChatFormatting.GREEN).append(Component.literal("Survival · SkyBlock · PvP").withStyle(ChatFormatting.GRAY));
		int max = 50 + seed % 4 * 50;
		d.players = new ServerStatus.Players(max, Math.min(max, seed % 97 + 3), List.of());
		d.status = Component.literal(d.players.online() + "/" + d.players.max()).withStyle(ChatFormatting.GRAY);
		d.playerList = List.of(Component.literal("Slash3rss"), Component.literal("Steve"), Component.literal("Alex"));
		d.version = Component.literal("1.21");
		//#if MC >= 1.21
		ServerData.State state = ServerData.State.SUCCESSFUL;
		//#endif
		if (ip.startsWith("old.")) {
			d.version = Component.literal("1.8.9");
			d.protocol = 47;
			//#if MC >= 1.21
			state = ServerData.State.INCOMPATIBLE;
			//#endif
		}
		if (ip.startsWith("text.")) {
			d.version = Component.literal("NOWY SEZON w sobotę");
			d.protocol = 9999;
			//#if MC >= 1.21
			state = ServerData.State.INCOMPATIBLE;
			//#endif
		}
		if (ip.startsWith("down.")) {
			d.motd = Component.translatable("multiplayer.status.cannot_connect").withStyle(ChatFormatting.DARK_RED);
			d.ping = -1;
			d.players = null;
			d.status = Component.empty();
			//#if MC >= 1.21
			state = ServerData.State.UNREACHABLE;
			//#endif
		}
		if (ip.startsWith("long.")) d.motd = Component.literal("Bardzo długi opis serwera, który nie mieści się w jednej linijce i musi przejść do drugiej, a nawet trzeciej").withStyle(ChatFormatting.AQUA);
		//#if MC >= 1.21
		d.setState(state);
		//#endif
		d.setIconBytes(sampleIcon(seed));
	}

	private static byte[] sampleIcon(int seed) {
		try {
			java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(64, 64, java.awt.image.BufferedImage.TYPE_INT_ARGB);
			int hue = seed % 360;
			for (int x = 0; x < 64; x++) for (int y = 0; y < 64; y++) {
				float f = (x + y) / 128f;
				img.setRGB(x, y, java.awt.Color.HSBtoRGB((hue + f * 60) / 360f, 0.6f, 0.5f + f * 0.4f));
			}
			var out = new java.io.ByteArrayOutputStream();
			javax.imageio.ImageIO.write(img, "png", out);
			return out.toByteArray();
		} catch (java.io.IOException e) {
			return null;
		}
	}
}
