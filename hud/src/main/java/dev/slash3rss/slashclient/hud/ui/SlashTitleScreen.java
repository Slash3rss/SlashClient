package dev.slash3rss.slashclient.hud.ui;

import com.mojang.realmsclient.RealmsMainScreen;
import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.LanguageSelectScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.List;

/**
 * The SlashClient main menu, styled like the launcher: a sidebar with the logo and the
 * menu, then a greeting card and the first servers from the server list to join in one
 * click. "Minecraft menu" at the bottom switches back to the game's own title screen.
 * Everything sits on solid panels, so it reads well over any panorama.
 */
public class SlashTitleScreen extends Screen {
	private static final Identifier LOGO = Identifier.fromNamespaceAndPath("slashclient-hud", "icon.png");

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private record Nav(String key, String icon, Runnable action) {}

	private final List<Hit> hits = new ArrayList<>();
	private final List<ServerData> servers = new ArrayList<>();

	private SkinPreview skin;

	public SlashTitleScreen() {
		super(Component.translatable("slashclient-hud.menu.title"));
	}

	@Override
	protected void init() {
		servers.clear();
		ServerList list = new ServerList(minecraft);
		list.load();
		for (int i = 0; i < Math.min(4, list.size()); i++) servers.add(list.get(i));
	}

	private List<Nav> nav() {
		return List.of(
			new Nav("menu.singleplayer", "user", () -> minecraft.setScreenAndShow(new SelectWorldScreen(this))),
			new Nav("menu.multiplayer", "server", () -> minecraft.setScreenAndShow(new JoinMultiplayerScreen(this))),
			new Nav("slashclient-hud.friends", "user", () -> minecraft.setScreenAndShow(new dev.slash3rss.slashclient.hud.social.FriendsScreen(this))),
			new Nav("menu.online", "cloud", () -> minecraft.setScreenAndShow(new RealmsMainScreen(this))),
			new Nav("menu.options", "gear", () -> minecraft.setScreenAndShow(new OptionsScreen(this, minecraft.options))),
			new Nav("options.language", "language", () -> minecraft.setScreenAndShow(new LanguageSelectScreen(this, minecraft.options, minecraft.getLanguageManager()))),
			new Nav("slashclient-hud.editor", "sliders", () -> minecraft.setScreenAndShow(HudEditScreen.settingsWindow())));
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		extractPanorama(g, delta);
		// the launcher's dark blue over the panorama, deeper towards the bottom
		g.fill(0, 0, width, height, 0x800A0D14);
		g.fillGradient(0, height / 2, width, height, 0x000A0D14, 0xB00A0D14);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		super.extractRenderState(g, mx, my, delta);
		hits.clear();
		int margin = 12;
		int sw = Math.min(210, Math.max(160, width / 4));
		int sx = margin, sy = margin, sh = height - margin * 2;
		Ui.panel(g, sx, sy, sw, sh);
		Ui.begin("menu sidebar", sx, sy, sw, sh);

		// logo and name, as at the top of the launcher's sidebar; small windows get only the name
		List<Nav> items = nav();
		boolean roomy = sh >= 300;
		int top;
		if (roomy) {
			int logo = 34;
			g.blit(RenderPipelines.GUI_TEXTURED, LOGO, sx + (sw - logo) / 2, sy + 14, 0, 0, logo, logo, logo, logo);
			Ui.brand(g, sx + (sw - Ui.brandWidth(1.3f)) / 2, sy + 54, 1.3f);
			top = sy + 74;
		} else {
			Ui.brand(g, sx + (sw - Ui.brandWidth(1.2f)) / 2, sy + 12, 1.2f);
			top = sy + 30;
		}
		g.fill(sx + 12, top, sx + sw - 12, top + 1, Ui.BORDER);

		// the menu fills what is left above "Quit", rows shrinking a little when space is short
		int bottomArea = 50;
		int room = sh - (top - sy) - bottomArea - 10;
		int nh = Math.max(17, Math.min(24, room / items.size() - 4));
		int gap = Math.max(2, Math.min(5, room / items.size() - nh));
		int ny = top + 9;
		boolean first = true;
		for (Nav n : items) {
			navRow(g, mx, my, sx + 10, ny, sw - 20, nh, n.icon(), Ui.tr(n.key()), first, false, n.action());
			first = false;
			ny += nh + gap;
		}

		// leaving the game sits apart, in red like the launcher's danger buttons
		navRow(g, mx, my, sx + 10, sy + sh - 44, sw - 20, nh, "power", Ui.tr("menu.quit"), false, true, minecraft::stop);

		Component vanilla = Ui.tr("slashclient-hud.menu.vanilla");
		boolean overVanilla = Ui.inside(mx, my, sx + 10, sy + sh - 17, sw - 20, 13);
		Ui.centered(g, Ui.fit(vanilla, sw - 16), sx + sw / 2, sy + sh - 15, overVanilla ? Ui.ACCENT_LIGHT : Ui.TEXT_2);
		hits.add(new Hit(sx + 10, sy + sh - 17, sw - 20, 13, () -> {
			SlashHud.config.customMenu = false;
			SlashHud.config.save();
			minecraft.setScreenAndShow(new TitleScreen());
		}));
		Ui.end();

		// right side: a greeting card, then the servers
		int cx = sx + sw + margin;
		int avail = width - cx - margin;
		// your skin gets a column on the right, looking at the mouse: in small windows the cards
		// get narrower for it (down to 150), and only the very smallest leave it out
		int skinCol = Math.min(130, avail - 150 - margin);
		if (skinCol < 56) skinCol = 0;
		int cw = Math.min(360, avail - (skinCol > 0 ? skinCol + margin : 0));
		if (cw < 150) return;
		if (skinCol > 0) {
			if (skin == null) skin = new SkinPreview(minecraft);
			int free = width - (cx + cw) - margin * 2;
			int fh = Math.min(sh - 20, Math.min(240, free * 2));
			int fw = fh / 2;
			int fx = cx + cw + margin + (free - fw) / 2;
			skin.draw(g, fx, sy + sh - fh, fw, fh, mx, my);
		}
		int gy = sy;
		// just the greeting: the game version and the client name are said elsewhere already
		int gh = 36;
		Ui.panel(g, cx, gy, cw, gh);
		Ui.begin("greeting", cx, gy, cw, gh);
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(cx + 14, gy + 11);
		pose.scale(1.6f, 1.6f);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.menu.hello", minecraft.getUser().getName()), Math.round((cw - 28) / 1.6f)), 0, 0, Ui.TEXT);
		pose.popMatrix();
		Ui.end();

		int listY = gy + gh + margin;
		int rowH = 30;
		int shown = Math.max(0, Math.min(servers.size(), (sy + sh - listY - 30) / (rowH + 4)));
		int panelH = 26 + (shown == 0 ? 22 : shown * (rowH + 4));
		if (listY + panelH > sy + sh) return;
		Ui.panel(g, cx, listY, cw, panelH);
		Ui.begin("servers", cx, listY, cw, panelH);
		Ui.icon(g, "server", cx + 14, listY + 9, 9, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.trBold("slashclient-hud.menu.servers"), cx + 28, listY + 9, Ui.TEXT);
		if (shown == 0) Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.menu.noServers"), cw - 28), cx + 14, listY + 26, Ui.TEXT_2);
		int y = listY + 24;
		for (int i = 0; i < shown; i++) {
			ServerData s = servers.get(i);
			int rx = cx + 8, rw = cw - 16;
			boolean over = Ui.inside(mx, my, rx, y, rw, rowH);
			float t = Ui.hover("server:" + s.ip, over);
			Ui.round(g, rx, y, rw, rowH, 5, Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
			Ui.roundOutline(g, rx, y, rw, rowH, 5, Ui.blend(Ui.BORDER, 0x883B82F6, t));
			Component join = Ui.tr("slashclient-hud.menu.join");
			int jw = Ui.buttonWidth(join, "play", 18, 4);
			Ui.draw(g, Ui.fit(Ui.bold(s.name), rw - jw - 24), rx + 10, y + 6, Ui.TEXT);
			Ui.draw(g, Ui.fit(Ui.text(s.ip), rw - jw - 24), rx + 10, y + 17, Ui.TEXT_2);
			Ui.button(g, "join:" + s.ip, rx + rw - jw - 6, y + 6, jw, 18, "play", join, over, mx, my);
			hits.add(new Hit(rx, y, rw, rowH, () -> ConnectScreen.startConnecting(this, minecraft, ServerAddress.parseString(s.ip), s, false, null)));
			y += rowH + 4;
		}
		Ui.end();
	}

	/** One row of the sidebar, like the launcher's navigation: icon, label, a light border on hover. */
	private void navRow(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h, String icon, Component label, boolean primary, boolean danger, Runnable action) {
		boolean over = Ui.inside(mx, my, x, y, w, h);
		float t = Ui.hover("nav:" + icon, over);
		if (primary) Ui.accent(g, x, y, w, h, 5, t);
		else {
			Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.CARD, danger ? 0xFF2A1720 : Ui.CARD_HOVER, t));
			Ui.roundOutline(g, x, y, w, h, 5, Ui.blend(Ui.BORDER, danger ? 0x88EF4444 : 0x883B82F6, t));
		}
		int color = primary ? 0xFFFFFFFF : danger ? 0xFFFCA5A5 : Ui.blend(Ui.TEXT_2, Ui.TEXT, t);
		Ui.icon(g, icon, x + 10, y + (h - 10) / 2, 10, primary ? 0xFFFFFFFF : danger ? 0xFFF87171 : Ui.blend(Ui.MUTED, Ui.ACCENT_LIGHT, t));
		Ui.draw(g, Ui.fit(label, w - 40), x + 28 + Math.round(t * 2), y + (h - 8) / 2, color);
		hits.add(new Hit(x, y, w, h, action));
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (super.mouseClicked(e, doubleClick)) return true;
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}

	@Override
	public boolean shouldCloseOnEsc() {
		return false;
	}
}
