package dev.slash3rss.slashclient.hud.ui;

import com.mojang.realmsclient.RealmsMainScreen;
import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.LanguageSelectScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.List;

/**
 * The SlashClient main menu, laid out like the game's own (everything in the middle) in the
 * launcher's look: logo, name and greeting, the main buttons with their names, the less used
 * ones as icons (names on hover), and your skin beside them, looking at the mouse.
 * Everything sits on solid panels, so it reads well over any panorama.
 */
public class SlashTitleScreen extends MenuScreen {
	private static final Identifier LOGO = Identifier.fromNamespaceAndPath("slashclient-hud", "icon.png");

	private SkinPreview skin;

	public SlashTitleScreen() {
		super(Component.translatable("slashclient-hud.menu.title"));
	}

	@Override
	protected void init() {
		// back from switching accounts: the skin is looked up again for the new one
		skin = null;
	}

	/** The main things, with their names. */
	private List<Nav> nav() {
		return List.of(
			new Nav(Ui.tr("menu.singleplayer"), "world", () -> minecraft.setScreenAndShow(new SelectWorldScreen(this))),
			new Nav(Ui.tr("menu.multiplayer"), "server", () -> minecraft.setScreenAndShow(new JoinMultiplayerScreen(this))),
			new Nav(Ui.tr("slashclient-hud.friends"), "user", () -> minecraft.setScreenAndShow(new dev.slash3rss.slashclient.hud.social.FriendsScreen(this))),
			new Nav(Ui.tr("slashclient-hud.editor"), "sliders", () -> minecraft.setScreenAndShow(HudEditScreen.settingsWindow())),
			new Nav(Ui.tr("menu.options"), "gear", () -> minecraft.setScreenAndShow(dev.slash3rss.slashclient.hud.Compat.options(minecraft, this))));
	}

	/** Less used things: icons only, their names show on hover. Quitting is the last, in red. */
	private List<Nav> tools() {
		return List.of(
			new Nav(Ui.tr("slashclient-hud.accounts.switch"), "m-accounts", () -> minecraft.setScreenAndShow(new dev.slash3rss.slashclient.hud.AccountsScreen(this))),
			new Nav(Ui.tr("menu.online"), "cloud", () -> minecraft.setScreenAndShow(new RealmsMainScreen(this))),
			new Nav(Ui.tr("options.language"), "language", () -> minecraft.setScreenAndShow(new LanguageSelectScreen(this, minecraft.options, minecraft.getLanguageManager()))),
			new Nav(Ui.tr("slashclient-hud.menu.vanilla"), "back", () -> {
				SlashHud.config.customMenu = false;
				SlashHud.config.save();
				minecraft.setScreenAndShow(new TitleScreen());
			}),
			new Nav(Ui.tr("menu.quit"), "power", minecraft::stop, true));
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		extractPanorama(g, delta);
		// the launcher's dark blue over the panorama, deeper towards the bottom
		g.fill(0, 0, width, height, 0x800A0D14);
		g.fillGradient(0, height / 2, width, height, 0x000A0D14, 0xB00A0D14);
		Season.sky(g, width, height, System.currentTimeMillis(), minecraft.options.screenEffectScale().get() <= 0.0);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		super.extractRenderState(g, mx, my, delta);
		beginFrame();
		List<Nav> items = nav();
		List<Nav> tools = tools();

		// sizes: a column in the middle like the game's own menu, rows shrinking in small windows
		int pw = Math.min(220, width - 24);
		int panelH = panelHeight(items.size());
		boolean logo = height >= 320;
		int brandH = (logo ? 42 : 0) + 22 + 14;
		int top = Math.max(6, (height - brandH - 10 - panelH) / 2);

		// logo, name and a greeting, centred above the buttons
		int y = top;
		if (logo) {
			int size = 34;
			g.blit(RenderPipelines.GUI_TEXTURED, Season.logo(LOGO), (width - size) / 2, y, 0, 0, size, size, size, size);
			y += 42;
		}
		Ui.brand(g, (width - Ui.brandWidth(1.6f)) / 2, y, 1.6f);
		Season.lanterns(g, (width - Ui.brandWidth(1.6f)) / 2, y - 1, Ui.brandWidth(1.6f));
		y += 22;
		Component hello = Ui.tr("slashclient-hud.menu.hello", minecraft.getUser().getName());
		Ui.drawOnWorld(g, Ui.fit(hello, width - 20), (width - Math.min(Ui.width(hello), width - 20)) / 2, y, Ui.TEXT_2);
		y += 14 + 10;

		// the buttons on one panel
		int px = (width - pw) / 2, py = y;
		drawMenu(g, mx, my, px, py, pw, items, tools);

		// your skin beside the buttons, looking at the mouse, and under it the way to your cosmetics,
		// when there is room for them
		int free = width - (px + pw) - 12;
		if (free >= 64) {
			if (skin == null) skin = new SkinPreview(minecraft);
			int bh = 18, gap = 6;
			// level with the top of the panel; the figure and the button together no taller than it
			int fh = Math.min(Math.min(160, panelH - bh - gap), (free - 12) * 2);
			int fw = fh / 2;
			int area = Math.min(free, 180);
			int fx = px + pw + Math.max(12, (area - fw) / 2);
			skin.draw(g, fx, py, fw, fh, mx, my);
			Component label = Ui.tr("slashclient-hud.cosmetics");
			int bw = Math.min(free - 8, Math.max(fw + 16, Ui.buttonWidth(label, "m-appearance", bh, 6)));
			int bx = Math.max(px + pw + 8, Math.min(width - bw - 4, fx + fw / 2 - bw / 2));
			int by = py + fh + gap;
			Ui.button(g, "menu:cosmetics", bx, by, bw, bh, "m-appearance", label, false, mx, my);
			hits.add(new Hit(bx, by, bw, bh, () -> minecraft.setScreenAndShow(new dev.slash3rss.slashclient.hud.cosmetics.CosmeticsScreen(this))));
		}
		drawTooltip(g);
	}

	@Override
	public boolean shouldCloseOnEsc() {
		return false;
	}
}
