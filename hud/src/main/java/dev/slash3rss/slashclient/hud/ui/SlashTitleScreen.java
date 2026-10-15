package dev.slash3rss.slashclient.hud.ui;

import com.mojang.realmsclient.RealmsMainScreen;
import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.SharedConstants;
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
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.List;

/**
 * The SlashClient main menu, styled like the launcher: a sidebar with the logo and the
 * menu, a greeting, and the first servers from the server list to join in one click.
 * "Minecraft menu" at the bottom switches back to the game's own title screen.
 */
public class SlashTitleScreen extends Screen {
	private static final Identifier LOGO = Identifier.fromNamespaceAndPath("slashclient-hud", "icon.png");

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private record Nav(String key, Item icon, String symbol, Runnable action) {}

	private final List<Hit> hits = new ArrayList<>();
	private final List<ServerData> servers = new ArrayList<>();

	public SlashTitleScreen() {
		super(Component.translatable("slashclient-hud.menu.title"));
	}

	@Override
	protected void init() {
		servers.clear();
		ServerList list = new ServerList(minecraft);
		list.load();
		for (int i = 0; i < Math.min(3, list.size()); i++) servers.add(list.get(i));
	}

	private List<Nav> nav() {
		return List.of(
			new Nav("menu.singleplayer", Items.GRASS_BLOCK, "⛏", () -> minecraft.setScreenAndShow(new SelectWorldScreen(this))),
			new Nav("menu.multiplayer", Items.COMPASS, "☰", () -> minecraft.setScreenAndShow(new JoinMultiplayerScreen(this))),
			new Nav("menu.online", Items.ENDER_PEARL, "✦", () -> minecraft.setScreenAndShow(new RealmsMainScreen(this))),
			new Nav("menu.options", Items.COMPARATOR, "⚙", () -> minecraft.setScreenAndShow(new OptionsScreen(this, minecraft.options))),
			new Nav("options.language", Items.BOOK, "A", () -> minecraft.setScreenAndShow(new LanguageSelectScreen(this, minecraft.options, minecraft.getLanguageManager()))),
			new Nav("slashclient-hud.editor", Items.SPYGLASS, "▣", () -> minecraft.setScreenAndShow(HudEditScreen.settingsWindow())));
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		extractPanorama(g, delta);
		// darker on the left where the menu is, as the launcher's sidebar over the stars
		g.fill(0, 0, width, height, 0x660A0D14);
		g.fillGradient(0, 0, width, height, 0x000A0D14, 0xCC0A0D14);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		super.extractRenderState(g, mx, my, delta);
		hits.clear();
		int sw = Math.min(200, Math.max(150, width / 4));
		int sx = 12, sy = 12, sh = height - 24;
		Ui.panel(g, sx, sy, sw, sh);

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
		int nh = Math.max(16, Math.min(22, room / items.size() - 4));
		int gap = Math.max(2, Math.min(4, room / items.size() - nh));
		int ny = top + 9;
		for (Nav n : items) {
			boolean over = Ui.inside(mx, my, sx + 10, ny, sw - 20, nh);
			float t = Ui.hover("nav:" + n.key(), over);
			Ui.round(g, sx + 10, ny, sw - 20, nh, 5, Ui.blend(0x05FFFFFF, Ui.GLASS_HOVER, t));
			Ui.roundOutline(g, sx + 10, ny, sw - 20, nh, 5, Ui.blend(Ui.BORDER, 0x553B82F6, t));
			Ui.icon(g, n.icon(), n.symbol(), sx + 15, ny + (nh - 16) / 2);
			Ui.draw(g, Ui.fit(Ui.tr(n.key()), sw - 60), sx + 37 + Math.round(t * 2), ny + (nh - 8) / 2, Ui.blend(Ui.TEXT_2, Ui.TEXT, t));
			hits.add(new Hit(sx + 10, ny, sw - 20, nh, n.action()));
			ny += nh + gap;
		}

		// leaving the game sits apart, in red like the launcher's danger buttons
		int qy = sy + sh - 44;
		boolean overQuit = Ui.inside(mx, my, sx + 10, qy, sw - 20, nh);
		float tq = Ui.hover("nav:quit", overQuit);
		Ui.round(g, sx + 10, qy, sw - 20, nh, 5, Ui.blend(0x05FFFFFF, 0x1AEF4444, tq));
		Ui.roundOutline(g, sx + 10, qy, sw - 20, nh, 5, Ui.blend(Ui.BORDER, 0x59EF4444, tq));
		Ui.icon(g, Items.BARRIER, "✕", sx + 15, qy + (nh - 16) / 2);
		Ui.draw(g, Ui.tr("menu.quit"), sx + 37, qy + (nh - 8) / 2, 0xFFFCA5A5);
		hits.add(new Hit(sx + 10, qy, sw - 20, nh, minecraft::stop));

		Component vanilla = Ui.tr("slashclient-hud.menu.vanilla");
		boolean overVanilla = Ui.inside(mx, my, sx + 10, sy + sh - 17, sw - 20, 13);
		Ui.centered(g, Ui.fit(vanilla, sw - 16), sx + sw / 2, sy + sh - 15, overVanilla ? Ui.ACCENT_LIGHT : Ui.MUTED);
		hits.add(new Hit(sx + 10, sy + sh - 17, sw - 20, 13, () -> {
			SlashHud.config.customMenu = false;
			SlashHud.config.save();
			minecraft.setScreenAndShow(new TitleScreen());
		}));

		// right side: greeting and quick join
		int cx = sx + sw + 24;
		int cw = width - cx - 16;
		String nick = minecraft.getUser().getName();
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(cx, sy + 18);
		pose.scale(2f, 2f);
		Ui.draw(g, Ui.trBold("slashclient-hud.menu.hello", nick), 0, 0, Ui.TEXT);
		pose.popMatrix();
		Ui.draw(g, Ui.tr("slashclient-hud.menu.subtitle", SharedConstants.getCurrentVersion().name()), cx, sy + 44, Ui.TEXT_2);

		if (!servers.isEmpty() && cw > 160) {
			Ui.draw(g, Ui.trBold("slashclient-hud.menu.servers"), cx, sy + 72, Ui.TEXT);
			int cardW = Math.min(220, cw);
			int y = sy + 86;
			for (ServerData s : servers) {
				boolean over = Ui.inside(mx, my, cx, y, cardW, 34);
				float t = Ui.hover("server:" + s.ip, over);
				Ui.round(g, cx, y, cardW, 34, 6, Ui.blend(0xCC111622, 0xE01A2233, t));
				Ui.roundOutline(g, cx, y, cardW, 34, 6, Ui.blend(Ui.BORDER, 0x663B82F6, t));
				Ui.draw(g, Ui.fit(Ui.bold(s.name), cardW - 70), cx + 10, y + 7, Ui.TEXT);
				Ui.draw(g, Ui.fit(Ui.text(s.ip), cardW - 70), cx + 10, y + 19, Ui.MUTED);
				Component join = Ui.tr("slashclient-hud.menu.join");
				int jw = Ui.width(join) + 14;
				if (over) Ui.accent(g, cx + cardW - jw - 8, y + 9, jw, 16, 4, t);
				Ui.centered(g, join, cx + cardW - jw / 2 - 8, y + 13, over ? 0xFFFFFFFF : Ui.ACCENT_LIGHT);
				hits.add(new Hit(cx, y, cardW, 34, () -> ConnectScreen.startConnecting(this, minecraft, ServerAddress.parseString(s.ip), s, false, null)));
				y += 40;
			}
		}

		Component info = Ui.text("Minecraft " + SharedConstants.getCurrentVersion().name() + " · SlashClient HUD");
		Ui.draw(g, info, width - Ui.width(info) - 8, height - 14, 0x99FFFFFF);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (super.mouseClicked(e, doubleClick)) return true;
		for (Hit h : hits) {
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
