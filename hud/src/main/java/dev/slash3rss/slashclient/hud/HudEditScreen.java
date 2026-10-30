package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Catalog;
import dev.slash3rss.slashclient.hud.ui.Ui;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import dev.slash3rss.slashclient.hud.chat.ChatLook;
import dev.slash3rss.slashclient.hud.chat.ChatTabs;
import dev.slash3rss.slashclient.hud.chat.ChatTabsScreen;
import dev.slash3rss.slashclient.hud.servers.ServerLayouts;
import dev.slash3rss.slashclient.hud.servers.ServerLayoutsPanel;

/**
 * The HUD editor, laid out like Lunar's and Feather's but in the launcher's colours.
 *
 * Over the game: drag modules (they snap to edges and the centre lines), right-click one
 * for its settings. The button in the middle opens the settings window: categories on the
 * left, a search box, and a card per module or extra with a switch and a gear.
 */
public class HudEditScreen extends Screen {
	private static final int SNAP = 6;
	private static final int EDGE = 2;

	private HudModule dragging;
	/** The module last taken with the mouse: the arrows (or WASD) move it a pixel at a time, ten with Shift. */
	private HudModule selected;
	/**
	 * The module the mouse is on: drawn over the others and grabbed by a click. It stays the one
	 * while the mouse moves inside its box, also over another module lying on it, and changes only
	 * when the mouse leaves it.
	 */
	private HudModule hover;
	/** The module of the last click that moved nothing, and where it was: a second click there takes the one under it. */
	private HudModule clicked;
	private double clickX, clickY;
	/** Where the dragged module was grabbed, and whether it has moved since. */
	private double pressX, pressY;
	private boolean moved;
	private double grabX;
	private double grabY;
	private boolean snappedX;
	private boolean snappedY;
	/** Lines the dragged module lines up with on other modules: {0 = vertical at x, 1 = horizontal at y, coordinate}. */
	private final java.util.List<int[]> guides = new java.util.ArrayList<>();
	/** The gap left between modules snapped side by side. */
	private static final int GAP = 2;

	private boolean window;
	private String category = "all";
	/** The entry whose settings are open, or null for the cards. */
	private Catalog.Entry settingsOf;
	private float scroll;
	/** The bar of whichever list the window shows now. */
	private final dev.slash3rss.slashclient.hud.ui.Scrollbar bar = new dev.slash3rss.slashclient.hud.ui.Scrollbar();
	private float maxScroll;
	private Component status = Component.empty();
	private EditBox search;
	private Catalog.Slider draggingSlider;
	private int sliderX;
	private int sliderW;
	private List<Catalog.Entry> entries;
	/** The text fields of the open settings page (Catalog.Text rows), placed on their rows as they are drawn. */
	private final java.util.Map<Catalog.Text, EditBox> textFields = new java.util.LinkedHashMap<>();

	/** Clickable places of the last frame, checked from the top down. */
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final List<Hit> hits = new ArrayList<>();
	/** Where each card was drawn last (x, y, w, h): for the in-game test that puts the mouse on one. */
	static final java.util.Map<String, int[]> CARDS = new java.util.HashMap<>();
	/** Where each row of the open settings page was drawn last (x, y, w, h), and each slider (x, y, w): for the in-game test. */
	static final java.util.Map<String, int[]> ROWS = new java.util.HashMap<>();
	static final java.util.Map<String, int[]> SLIDERS = new java.util.HashMap<>();
	/** The settings list's visible band (top, height) as last drawn: for the test that scrolls a row into it. */
	private int listTopDrawn, listHDrawn;
	/** Where the key buttons on the settings page were drawn last, by the key's name; for the tests. */
	static final java.util.Map<String, int[]> KEYS = new java.util.HashMap<>();
	/** A key row on the settings page waiting for the new key, or null. */
	private Catalog.Key waitingKey;
	private static final int KEY_W = 90;

	/** Undo and redo for this opening of the editor. */
	private final EditHistory history = new EditHistory();
	/** History starts with the first frame: drawing fills in the places of modules seen for the first time. */
	private boolean historyStarted;
	/** When text was last typed in a field (ms), so a pause in typing makes one step; 0 when nothing waits. */
	private long typedAt;
	/** The undo and redo buttons as drawn last (x, y, size), null when not shown: for the in-game test. */
	private int[] undoAt, redoAt;
	/** The hovered button's tooltip this frame, and where its button is. */
	private Component tip;
	private int tipX, tipY;

	public HudEditScreen() {
		super(Component.translatable("slashclient-hud.editor"));
	}

	/** Opens straight on a module's or extra's settings. */
	public HudEditScreen(String entryId) {
		this();
		window = true;
		settingsOf = entries().stream().filter(e -> e.id().equals(entryId)).findFirst().orElse(null);
	}

	/** Straight into the settings window (from the main menu, where there is no HUD to drag). */
	public static HudEditScreen settingsWindow() {
		HudEditScreen s = new HudEditScreen();
		s.window = true;
		return s;
	}

	/** The settings window on a category ("share", "combat", …); for the screenshot test. */
	public static HudEditScreen category(String category) {
		HudEditScreen s = settingsWindow();
		s.category = category;
		return s;
	}

	private List<Catalog.Entry> entries() {
		// chat tabs are a page of this window, like any other settings
		if (entries == null) entries = Catalog.entries(() -> {
			settingsOf = entries.stream().filter(e -> e.id().equals("chatTabs")).findFirst().orElse(null);
			reopen();
		});
		return entries;
	}

	// ---------- chat tabs page ----------

	private static final int MAX_TABS = 8;
	private static final int TAB_ROW = 24;
	/** The text fields of the shown tabs: name, patterns and exclusions, three each. */
	private final List<EditBox> tabFields = new ArrayList<>();
	private int tabsTop;
	private int tabsFit;
	/** The tab whose more settings (reply prefix, typing line) show in a line under it (-1 = none). */
	private int tabMore = -1;
	/** That line's prefix field. */
	private EditBox prefixField;

	/** The chat tabs page with a tab's more settings open (for the screenshot test). */
	public HudEditScreen tabMore(int index) {
		tabMore = index;
		return this;
	}

	/** A tab row's top: the rows under the opened one move down by the extra line. */
	private int tabRowY(int i) {
		return tabsTop + i * TAB_ROW + (tabMore >= 0 && i > tabMore ? 2 * TAB_ROW : 0);
	}

	private boolean chatTabsPage() {
		return window && settingsOf != null && settingsOf.id().equals("chatTabs");
	}

	private void tabsChanged() {
		SlashHud.config.save();
		ChatTabs.changed();
	}

	/** The text / regex switch of a chat tab's row: as wide as its longer word needs, not more. */
	private static int modeWidth() {
		return Math.max(Ui.buttonWidth(Ui.tr("slashclient-hud.chat.regex"), null, 18, 4), Ui.buttonWidth(Ui.tr("slashclient-hud.chat.text"), null, 18, 4));
	}

	private void initChatTabs() {
		int cx = winX() + 132, cy = winY() + 42, cw = winW() - 144, ch = winH() - 50;
		int help = font.split(Ui.tr("slashclient-hud.chat.help"), cw).size();
		tabsTop = cy + 26 + help * 11 + 4;
		tabsFit = Math.max(1, (cy + ch - 26 - tabsTop) / TAB_ROW);
		List<HudConfig.ChatTab> tabs = SlashHud.config.chatTabs;
		prefixField = null;
		if (tabMore >= Math.min(tabs.size(), tabsFit)) tabMore = -1;
		// the opened tab's two extra lines take two rows' room
		if (tabMore >= 0) tabsFit = Math.max(tabMore + 1, tabsFit - 2);
		for (int i = 0; i < Math.min(tabs.size(), tabsFit); i++) {
			HudConfig.ChatTab tab = tabs.get(i);
			int y = tabRowY(i) + 5;
			// the name is short (a tab's label): most of the row goes to what the tab catches
			EditBox name = new EditBox(font, cx + 6, y, 44, 12, Ui.tr("slashclient-hud.chat.name"));
			name.setBordered(false);
			name.setTextColor(Ui.TEXT);
			name.setMaxLength(16);
			name.setValue(tab.name);
			fitHint(name, Ui.tr("slashclient-hud.chat.name"));
			name.setResponder(v -> {
				tab.name = v;
				tabsChanged();
				typed();
			});
			// "catches" takes most of the room, "but not" the rest
			int room = cw - 64 - (modeWidth() + 58), pw = Math.round((room - 10) * 0.6f);
			EditBox patterns = new EditBox(font, cx + 64, y, pw, 12, Ui.tr("slashclient-hud.chat.patterns"));
			patterns.setBordered(false);
			patterns.setTextColor(Ui.TEXT);
			patterns.setMaxLength(256);
			patterns.setValue(ChatTabsScreen.joined(tab));
			fitHint(patterns, Ui.tr(tab.regex ? "slashclient-hud.chat.hint.regex" : "slashclient-hud.chat.hint.text"));
			patterns.setResponder(v -> {
				ChatTabsScreen.setPatterns(tab, v);
				tabsChanged();
				typed();
			});
			EditBox excludes = new EditBox(font, cx + 64 + pw + 10, y, room - pw - 10, 12, Ui.tr("slashclient-hud.chat.excludes"));
			excludes.setBordered(false);
			excludes.setTextColor(Ui.TEXT);
			excludes.setMaxLength(256);
			excludes.setValue(ChatTabsScreen.joinedExcludes(tab));
			fitHint(excludes, Ui.tr("slashclient-hud.chat.hint.excludes"));
			excludes.setResponder(v -> {
				ChatTabsScreen.setExcludes(tab, v);
				tabsChanged();
				typed();
			});
			addRenderableWidget(name);
			addRenderableWidget(patterns);
			addRenderableWidget(excludes);
			tabFields.add(name);
			tabFields.add(patterns);
			tabFields.add(excludes);
			if (i == tabMore) {
				// the line under the tab: what goes in front of messages sent from it
				int lw = Ui.width(Ui.tr("slashclient-hud.chat.prefix"));
				int toggleRoom = Ui.width(Ui.tr("slashclient-hud.chat.input")) + 40;
				EditBox prefix = new EditBox(font, cx + 6 + lw + 10, y + TAB_ROW, Math.max(40, cw - lw - 26 - toggleRoom), 12, Ui.tr("slashclient-hud.chat.prefix"));
				prefix.setBordered(false);
				prefix.setTextColor(Ui.TEXT);
				prefix.setMaxLength(64);
				prefix.setValue(tab.prefix());
				fitHint(prefix, Ui.tr("slashclient-hud.chat.hint.prefix"));
				prefix.setResponder(v -> {
					tab.replyPrefix = v;
					tabsChanged();
					typed();
				});
				addRenderableWidget(prefix);
				prefixField = prefix;
			}
		}
	}

	/** Hints longer than their field: the whole text, scrolled along each frame (marquee). */
	private final java.util.Map<EditBox, Component> longHints = new java.util.HashMap<>();
	/** When the window's fields were made: every scroll starts at the hint's beginning. */
	private long hintsFrom;

	/** A field's grey hint; one too long for the field scrolls through it instead of running into the next field. */
	private void fitHint(EditBox box, Component hint) {
		box.setHint(hint);
		if (Ui.width(hint) > box.getWidth() - 4) {
			if (longHints.isEmpty()) hintsFrom = System.currentTimeMillis();
			longHints.put(box, hint);
			scrollHint(box, hint, 0);
		}
	}

	/** The hint's window `ms` into the scroll: a pause at the start, a letter at a time to its end, a pause, and back. */
	private void scrollHint(EditBox box, Component hint, long ms) {
		String text = hint.getString();
		var style = hint.getStyle();
		int room = box.getWidth() - 4;
		// the furthest it moves: until the end of the text fits
		int last = 0;
		while (last < text.length() && Ui.width(Component.literal(text.substring(last)).withStyle(style)) > room) last++;
		int at = Ui.bounce(ms, last, 1500, last * 120L);
		String from = text.substring(at), shown = "";
		for (int n = 1; n <= from.length(); n++) {
			if (Ui.width(Component.literal(from.substring(0, n)).withStyle(style)) > room) break;
			shown = from.substring(0, n);
		}
		box.setHint(Component.literal(shown).withStyle(style));
	}

	private void drawChatTabs(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		Catalog.Entry e = settingsOf;
		Ui.button(g, "back", x, y, 70, 18, "back", Ui.tr("slashclient-hud.ui.back"), false, mx, my);
		hits.add(new Hit(x, y, 70, 18, () -> {
			SlashHud.config.chatTabs.removeIf(t -> t.name.isBlank());
			tabsChanged();
			settingsOf = null;
			reopen();
		}));
		List<HudConfig.ChatTab> tabs = SlashHud.config.chatTabs;
		// only the tabs as a code to share, and a code pasted back (tabs of the same name are replaced),
		// on the right of the title: with their names when there is room, else as icons
		Component copy = Ui.tr("slashclient-hud.chat.copyTabs"), paste = Ui.tr("slashclient-hud.chat.pasteTabs");
		boolean named = Ui.buttonWidth(copy, "copy", 18, 6) + Ui.buttonWidth(paste, "paste", 18, 6) + 6 < w - 106 - 90;
		int copyW = named ? Ui.buttonWidth(copy, "copy", 18, 6) : 22, pasteW = named ? Ui.buttonWidth(paste, "paste", 18, 6) : 22;
		int pasteX = x + w - pasteW, copyX = pasteX - 6 - copyW;
		Ui.button(g, "copyTabs", copyX, y, copyW, 18, "copy", named ? copy : Component.empty(), false, mx, my);
		hits.add(new Hit(copyX, y, copyW, 18, () -> {
			minecraft.keyboardHandler.setClipboard(ShareCode.encodeTabs(tabs));
			tabsStatus = Ui.tr("slashclient-hud.chat.tabsCopied");
		}));
		Ui.button(g, "pasteTabs", pasteX, y, pasteW, 18, "paste", named ? paste : Component.empty(), false, mx, my);
		hits.add(new Hit(pasteX, y, pasteW, 18, () -> {
			List<HudConfig.ChatTab> pasted = ShareCode.decodeTabs(minecraft.keyboardHandler.getClipboard());
			if (pasted == null) {
				tabsStatus = Ui.tr("slashclient-hud.chat.tabsInvalid").withStyle(st -> st.withColor(Ui.DANGER));
				return;
			}
			int added = importTabs(tabs, pasted);
			tabMore = -1;
			tabsChanged();
			reopen();
			tabsStatus = Ui.tr("slashclient-hud.chat.tabsPasted", added);
		}));
		Ui.round(g, x + 78, y, 20, 18, 4, 0xFF1B2B4D);
		Ui.icon(g, e.icon(), x + 82, y + 3, 12, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold(e.nameKey()), copyX - x - 110), x + 104, y + 5, Ui.TEXT);
		Ui.wrapped(g, Ui.tr("slashclient-hud.chat.help"), x, y + 26, w, Ui.TEXT_2);

		String error = "";
		for (int i = 0; i < tabFields.size() / 3 && i < tabs.size(); i++) {
			HudConfig.ChatTab tab = tabs.get(i);
			int ry = tabRowY(i);
			EditBox name = tabFields.get(i * 3), patterns = tabFields.get(i * 3 + 1), excludes = tabFields.get(i * 3 + 2);
			for (EditBox box : List.of(name, patterns, excludes)) {
				Ui.round(g, box.getX() - 5, ry, box.getWidth() + 10, 18, 4, Ui.CARD);
				// the exclusions field has a faint red edge: what is written there keeps lines out
				int edge = box == excludes ? 0x40F87171 : Ui.BORDER;
				Ui.roundOutline(g, box.getX() - 5, ry, box.getWidth() + 10, 18, 4, box.isFocused() ? Ui.withAlpha(Ui.ACCENT, 0x99) : edge);
			}
			int mw = modeWidth(), bx = x + w - 48 - mw;
			Ui.button(g, "mode:" + i, bx, ry, mw, 18, Ui.tr(tab.regex ? "slashclient-hud.chat.regex" : "slashclient-hud.chat.text"), tab.regex, mx, my);
			hits.add(new Hit(bx, ry, mw, 18, () -> {
				String current = patterns.getValue(), currentEx = excludes.getValue();
				tab.regex = !tab.regex;
				ChatTabsScreen.setPatterns(tab, current);
				ChatTabsScreen.setExcludes(tab, currentEx);
				tabsChanged();
				reopen();
			}));
			// more settings of the tab: its reply prefix and the typing line of its window
			int index = i;
			Ui.button(g, "more:" + i, x + w - 46, ry, 22, 18, "sliders", Component.empty(), tabMore == i, mx, my);
			hits.add(new Hit(x + w - 46, ry, 22, 18, () -> {
				tabMore = tabMore == index ? -1 : index;
				reopen();
			}));
			if (i == tabMore && prefixField != null) drawTabMore(g, tab, mx, my, x, ry + TAB_ROW, w);
			Ui.button(g, "remove:" + i, x + w - 22, ry, 22, 18, "close", Component.empty(), false, mx, my);
			hits.add(new Hit(x + w - 22, ry, 22, 18, () -> {
				tabs.remove(tab);
				tabMore = -1;
				tabsChanged();
				reopen();
			}));
			if (tab.regex) for (String p : java.util.stream.Stream.concat(tab.patterns.stream(), tab.excludes().stream()).toList()) {
				String problem = ChatTabs.problem(p);
				if (problem != null) error = tab.name + ": " + problem;
			}
		}
		int below = tabRowY(Math.min(tabs.size(), tabsFit)) + 2;
		if (tabs.size() < Math.min(MAX_TABS, tabsFit)) {
			Component add = Ui.tr("slashclient-hud.chat.add");
			int aw = Ui.buttonWidth(add, null, 18, 6);
			Ui.button(g, "addTab", x, below, aw, 18, add, true, mx, my);
			hits.add(new Hit(x, below, aw, 18, () -> {
				tabs.add(new HudConfig.ChatTab(Component.translatable("slashclient-hud.chat.new").getString(), false));
				tabsChanged();
				reopen();
			}));
		}
		int hidden = Math.max(0, tabs.size() - tabsFit);
		if (!error.isEmpty()) Ui.draw(g, Ui.fit(Ui.text(error), w), x, y + h - 10, Ui.DANGER);
		else if (tabsStatus != null) Ui.draw(g, Ui.fit(tabsStatus, w), x, y + h - 10, Ui.GREEN);
		else if (hidden > 0) Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.chat.more", hidden), w), x, y + h - 10, Ui.MUTED);
	}

	/** A tab moved to another place; its settings stay open. */
	private void moveTab(int from, int to) {
		List<HudConfig.ChatTab> tabs = SlashHud.config.chatTabs;
		tabs.add(to, tabs.remove(from));
		tabMore = to;
		tabsChanged();
		reopen();
	}

	/** What copying or pasting the tabs did, under them (null: nothing yet). */
	private Component tabsStatus;

	/** Pasted tabs added to the player's: one of the same name is replaced, the rest added while there is room. How many came in. */
	static int importTabs(List<HudConfig.ChatTab> tabs, List<HudConfig.ChatTab> pasted) {
		int n = 0;
		for (HudConfig.ChatTab t : pasted) {
			int same = -1;
			for (int i = 0; i < tabs.size(); i++) if (tabs.get(i).name.equalsIgnoreCase(t.name)) same = i;
			if (same >= 0) tabs.set(same, t);
			else if (tabs.size() < MAX_TABS) tabs.add(t);
			else continue;
			n++;
		}
		return n;
	}

	/** The opened tab's extra lines: "Reply prefix" with its field, the switch for its window's typing line, and its mention sound. */
	private void drawTabMore(GuiGraphicsExtractor g, HudConfig.ChatTab tab, int mx, int my, int x, int y, int w) {
		Ui.draw(g, Ui.tr("slashclient-hud.chat.prefix"), x + 6, y + 5, Ui.TEXT_2);
		EditBox box = prefixField;
		Ui.round(g, box.getX() - 5, y, box.getWidth() + 10, 18, 4, Ui.CARD);
		Ui.roundOutline(g, box.getX() - 5, y, box.getWidth() + 10, 18, 4, box.isFocused() ? Ui.withAlpha(Ui.ACCENT, 0x99) : Ui.BORDER);
		Component input = Ui.tr("slashclient-hud.chat.input");
		int iw = Ui.width(input), tx = x + w - 22;
		Ui.draw(g, input, tx - 6 - iw, y + 5, Ui.TEXT_2);
		Ui.toggle(g, "chatInput:" + tab.name, tx, y + 4, tab.input);
		hits.add(new Hit(tx - 6 - iw, y, iw + 28, 18, () -> {
			tab.input = !tab.input;
			tabsChanged();
		}));
		// the second line: the sound of a mention this tab catches, heard when changed
		int sy = y + TAB_ROW;
		Ui.draw(g, Ui.tr("slashclient-hud.chat.sound"), x + 6, sy + 5, Ui.TEXT_2);
		Component now = Ui.tr("slashclient-hud.chat.sound." + (tab.sound().isEmpty() ? "default" : tab.sound()));
		String icon = "none".equals(tab.sound()) ? "bell-slash" : "bell";
		int bw = Math.max(90, Ui.buttonWidth(now, icon, 18, 6)), bx = Math.max(box.getX() - 5, x + 6 + Ui.width(Ui.tr("slashclient-hud.chat.sound")) + 10);
		Ui.button(g, "chatSound:" + tab.name, bx, sy, bw, 18, icon, now, false, mx, my);
		// the tab's place among the others (in the chat's row of tabs too)
		List<HudConfig.ChatTab> tabs = SlashHud.config.chatTabs;
		int at = tabs.indexOf(tab), ux = x + w - 46;
		if (at > 0) {
			Ui.button(g, "tabUp", ux, sy, 22, 18, "arrow-up", Component.empty(), false, mx, my);
			hits.add(new Hit(ux, sy, 22, 18, () -> moveTab(at, at - 1)));
		}
		if (at >= 0 && at < tabs.size() - 1) {
			Ui.button(g, "tabDown", ux + 24, sy, 22, 18, "arrow-down", Component.empty(), false, mx, my);
			hits.add(new Hit(ux + 24, sy, 22, 18, () -> moveTab(at, at + 1)));
		}
		hits.add(new Hit(bx, sy, bw, 18, () -> {
			List<String> all = List.of(ChatTabs.SOUNDS);
			tab.sound = all.get((all.indexOf(tab.sound()) + 1) % all.size());
			ChatTabs.playSound(minecraft, tab.sound());
			tabsChanged();
		}));
	}

	// ---------- crosshair page ----------

	/** The painting grid of the last frame: where it is and how big one of its pixels is. */
	private int gridX, gridY, gridCell;
	/** While the mouse paints the grid: true draws pixels, false erases them. */
	private Boolean painting;

	private boolean crosshairPage() {
		return window && settingsOf != null && settingsOf.id().equals("crosshair");
	}

	private Catalog.Setting crosshairSetting(String labelKey) {
		return settingsOf.settings().stream().filter(s -> s.labelKey().equals(labelKey)).findFirst().orElseThrow();
	}

	/** Presets to pick from on the right, and on the left the crosshair big, to paint pixel by pixel. */
	private void drawCrosshairPage(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		Catalog.Entry e = settingsOf;
		HudConfig cfg = SlashHud.config;
		Ui.button(g, "back", x, y, 70, 18, "back", Ui.tr("slashclient-hud.ui.back"), false, mx, my);
		hits.add(new Hit(x, y, 70, 18, () -> {
			settingsOf = null;
			reopen();
		}));
		Ui.round(g, x + 78, y, 20, 18, 4, 0xFF1B2B4D);
		Ui.icon(g, e.icon(), x + 82, y + 3, 12, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold(e.nameKey()), w - 134), x + 104, y + 5, Ui.TEXT);
		boolean on = e.get().get();
		Ui.toggle(g, "crosshair:on", x + w - 20, y + 4, on);
		hits.add(new Hit(x + w - 26, y, 26, 18, () -> e.set().accept(!e.get().get())));

		String style = Crosshair.style();
		boolean[] shown = Crosshair.current();
		int color = cfg.crosshairColor;
		int top = y + 26, bodyH = h - 26;

		// the grid, as big as the height allows, with the clear button under it
		int cell = Math.max(3, Math.min(10, (bodyH - 30) / Crosshair.N));
		int grid = cell * Crosshair.N;
		gridX = x + 2;
		gridY = top + 2;
		gridCell = cell;
		Ui.round(g, x, top, grid + 4, grid + 4, 4, 0xFF0B0F18);
		for (int cy = 0; cy < Crosshair.N; cy++) for (int cx = 0; cx < Crosshair.N; cx++) {
			boolean middle = cx == Crosshair.MID || cy == Crosshair.MID;
			int bg = (cx + cy) % 2 == 0 ? (middle ? 0xFF182238 : 0xFF131926) : (middle ? 0xFF141D30 : 0xFF0F141F);
			g.fill(gridX + cx * cell, gridY + cy * cell, gridX + (cx + 1) * cell, gridY + (cy + 1) * cell, bg);
		}
		Crosshair.draw(g, gridX, gridY, shown, cell, on ? color : Ui.blend(color, 0xFF0F141F, 0.5f), false);
		Ui.roundOutline(g, x, top, grid + 4, grid + 4, 4, painting != null ? Ui.withAlpha(Ui.ACCENT, 0x99) : Ui.BORDER);
		int by = top + grid + 8;
		Component clear = Ui.tr("slashclient-hud.crosshair.clear");
		Ui.button(g, "crosshair:clear", x, by, grid + 4, 16, "reset", clear, false, mx, my);
		hits.add(new Hit(x, by, grid + 4, 16, () -> {
			cfg.crosshair = Crosshair.CUSTOM;
			cfg.crosshairPattern = Crosshair.encode(new boolean[Crosshair.N * Crosshair.N]);
		}));

		// on the right, scrolled when the window is small: presets, colour, outline, size and gap
		int rx = x + grid + 16, rw = x + w - rx;
		g.enableScissor(rx, top, rx + rw, top + bodyH);
		Ui.beginClip("crosshair options", rx, top, rw, bodyH);
		int ry = top - Math.round(scroll);
		Component name = Ui.tr("slashclient-hud.crosshair." + style);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.crosshair.presets").append(Ui.text("  ")).append(name.copy().withStyle(st -> st.withColor(Ui.ACCENT_LIGHT))), rw), rx, ry + 2, Ui.TEXT);
		ry += 14;
		List<String> styles = new ArrayList<>(List.of(Crosshair.PRESETS));
		if (cfg.crosshairPattern != null) styles.add(Crosshair.CUSTOM);
		int tile = 27, cols = Math.max(1, (rw + 4) / (tile + 4));
		for (int i = 0; i < styles.size(); i++) {
			String st = styles.get(i);
			int tx = rx + (i % cols) * (tile + 4), ty = ry + (i / cols) * (tile + 4);
			boolean over = Ui.inside(mx, my, tx, ty, tile, tile) && my >= top && my < top + bodyH;
			boolean active = st.equals(style);
			Ui.round(g, tx, ty, tile, tile, 4, over ? 0xFF1C2435 : 0xFF0B0F18);
			Ui.roundOutline(g, tx, ty, tile, tile, 4, active ? Ui.ACCENT_LIGHT : over ? 0x40FFFFFF : Ui.BORDER);
			// each at its real size, one pixel of the grid for one of the game's
			Crosshair.draw(g, tx + 3, ty + 3, Crosshair.pixels(st), 1, color, cfg.crosshairOutline);
			if (ty >= top && ty + tile <= top + bodyH) hits.add(new Hit(tx, ty, tile, tile, () -> cfg.crosshair = st));
		}
		ry += (styles.size() + cols - 1) / cols * (tile + 4) + 6;

		// colour
		Catalog.Colors colors = (Catalog.Colors) crosshairSetting("slashclient-hud.crosshairColor");
		Ui.draw(g, Ui.fit(Ui.tr(colors.labelKey()), rw), rx, ry, Ui.TEXT_2);
		ry += 12;
		int per = Math.max(1, (rw + 4) / 16);
		for (int i = 0; i < colors.colors().length; i++) {
			int c = colors.colors()[i];
			int sx = rx + (i % per) * 16, sy = ry + (i / per) * 16;
			if (c == color) Ui.round(g, sx - 1, sy, 14, 14, 4, 0xFFFFFFFF);
			Ui.round(g, sx, sy + 1, 12, 12, 3, c);
			if (sy >= top && sy + 14 <= top + bodyH) hits.add(new Hit(sx, sy + 1, 12, 12, () -> colors.set().accept(c)));
		}
		ry += (colors.colors().length + per - 1) / per * 16 + 6;

		// outline
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.crosshair.outline"), rw - 28), rx, ry + 1, Ui.TEXT_2);
		Ui.toggle(g, "crosshair:outline", rx + rw - 20, ry, cfg.crosshairOutline);
		if (ry >= top && ry + 12 <= top + bodyH) hits.add(new Hit(rx, ry - 2, rw, 14, () -> cfg.crosshairOutline = !cfg.crosshairOutline));
		ry += 18;

		// size and gap shape the presets; a painted crosshair is what it is
		if (Crosshair.CUSTOM.equals(style)) {
			ry = Ui.wrapped(g, Ui.tr("slashclient-hud.crosshair.customHint"), rx, ry, rw, Ui.MUTED) + 4;
		} else for (String key : new String[] { "slashclient-hud.set.size", "slashclient-hud.set.gap" }) {
			Catalog.Slider sl = (Catalog.Slider) crosshairSetting(key);
			float value = sl.get().get();
			Component v = Ui.text(String.format(Locale.ROOT, sl.format(), value));
			Ui.draw(g, Ui.fit(Ui.tr(key), rw - Ui.width(v) - 6), rx, ry, Ui.TEXT_2);
			Ui.draw(g, v, rx + rw - Ui.width(v), ry, Ui.TEXT);
			ry += 12;
			int sw = rw - 4;
			Ui.slider(g, rx + 2, ry, sw, (value - sl.min()) / (sl.max() - sl.min()));
			int sx = rx + 2;
			if (ry >= top && ry + 12 <= top + bodyH) hits.add(new Hit(rx, ry - 2, rw, 14, () -> {
				draggingSlider = sl;
				sliderX = sx;
				sliderW = sw;
			}));
			ry += 18;
		}
		ry = Ui.wrapped(g, Ui.tr("slashclient-hud.crosshair.paintHint"), rx, ry, rw, Ui.MUTED);
		maxScroll = Math.max(0, ry + Math.round(scroll) - top - bodyH);
		Ui.end();
		g.disableScissor();
		// the options go on below the window's edge: a bar says so, as on the other pages
		if (maxScroll > 0) {
			Ui.end();
			bar.draw(g, x + w + 4, top, bodyH, scroll, maxScroll, mx, my);
			Ui.begin("content", x, y, w, h);
		}
	}

	/** For the in-game test: the middle of one of the grid's pixels, in GUI coordinates. */
	double[] gridCellCenter(int cx, int cy) {
		return new double[] { gridX + (cx + 0.5) * gridCell, gridY + (cy + 0.5) * gridCell };
	}

	/** For the in-game test: the middle of a module's ×. */
	double[] closeCenter(String id) {
		HudModule m = SlashHud.MODULES.stream().filter(x -> x.id().equals(id)).findFirst().orElseThrow();
		int[] c = closeBox(m);
		return new double[] { c[0] + c[2] / 2.0, c[1] + c[2] / 2.0 };
	}

	/** The grid's pixel painted last, so a quick drag fills the pixels it jumped over. */
	private int lastCellX = -1, lastCellY = -1;

	/** Draws or erases the grid's pixels from the last one painted to the one under the mouse. */
	private void paintAt(double mx, double my) {
		int cx = (int) Math.floor((mx - gridX) / gridCell), cy = (int) Math.floor((my - gridY) / gridCell);
		if (painting == null || cx < 0 || cy < 0 || cx >= Crosshair.N || cy >= Crosshair.N) return;
		HudConfig cfg = SlashHud.config;
		boolean[] p = Crosshair.CUSTOM.equals(cfg.crosshair) ? Crosshair.decode(cfg.crosshairPattern) : Crosshair.editable();
		int fromX = lastCellX < 0 ? cx : lastCellX, fromY = lastCellY < 0 ? cy : lastCellY;
		int steps = Math.max(Math.abs(cx - fromX), Math.abs(cy - fromY));
		for (int i = 0; i <= steps; i++) {
			int x = steps == 0 ? cx : Math.round(fromX + (cx - fromX) * (float) i / steps);
			int y = steps == 0 ? cy : Math.round(fromY + (cy - fromY) * (float) i / steps);
			p[y * Crosshair.N + x] = painting;
		}
		lastCellX = cx;
		lastCellY = cy;
		cfg.crosshairPattern = Crosshair.encode(p);
	}


	// ---------- window geometry ----------

	private int winW() {
		return Math.min(580, width - 24);
	}

	private int winH() {
		return Math.min(340, height - 24);
	}

	private int winX() {
		return (width - winW()) / 2;
	}

	private int winY() {
		return (height - winH()) / 2;
	}

	@Override
	protected void init() {
		// what changed while the widgets were away (a page switched by a click) is a step of its own
		history.commit();
		entries();
		search = null;
		tabFields.clear();
		textFields.clear();
		longHints.clear();
		if (chatTabsPage()) initChatTabs();
		else if (window && settingsOf != null && !crosshairPage()) initTextFields();
		if (window && settingsOf == null && !category.equals("share")) {
			search = new EditBox(font, winX() + winW() - 176, winY() + 12, 132, 12, Ui.tr("slashclient-hud.ui.search"));
			search.setBordered(false);
			search.setTextColor(Ui.TEXT);
			fitHint(search, Ui.tr("slashclient-hud.ui.search"));
			search.setResponder(v -> scroll = 0);
			addRenderableWidget(search);
		}
	}

	private void initTextFields() {
		for (Catalog.Setting s : settingsOf.settings()) {
			if (!(s instanceof Catalog.Text t)) continue;
			EditBox box = new EditBox(font, 0, 0, 100, 12, Ui.tr(t.labelKey()));
			box.setBordered(false);
			box.setTextColor(Ui.TEXT);
			box.setMaxLength(t.maxLength());
			box.setValue(t.get().get());
			fitHint(box, Ui.tr(t.hintKey()));
			box.setResponder(v -> {
				t.set().accept(v);
				typed();
			});
			// shown once drawSettings has put it on its row
			box.visible = false;
			addRenderableWidget(box);
			textFields.put(t, box);
		}
	}

	private void reopen() {
		// back from a module's settings to the same category: the list scrolled and searched as it was left
		boolean back = settingsOf == null && listCategory != null && listCategory.equals(category);
		scroll = 0;
		waitingKey = null;
		status = Component.empty();
		String keep = back ? listQuery : search == null ? "" : search.getValue();
		rebuildWidgets();
		if (search != null) search.setValue(keep);
		if (back) scroll = listScroll;
		if (settingsOf == null) listCategory = null;
	}

	// ---------- drawing ----------

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		long now = System.currentTimeMillis() - hintsFrom;
		// only an empty field shows its hint: the scroll runs while it is seen
		longHints.forEach((box, hint) -> {
			if (box.getValue().isEmpty()) scrollHint(box, hint, now);
		});
		bar.hide();
		g.fill(0, 0, width, height, window ? 0xB0050710 : 0x30000000);
		if (dragging != null) {
			g.fill(width / 2, 0, width / 2 + 1, height, snappedX ? Ui.withAlpha(Ui.ACCENT_LIGHT, 0xAA) : 0x30FFFFFF);
			g.fill(0, height / 2, width, height / 2 + 1, snappedY ? Ui.withAlpha(Ui.ACCENT_LIGHT, 0xAA) : 0x30FFFFFF);
			for (int[] line : guides) {
				if (line[0] == 0) g.fill(line[1], 0, line[1] + 1, height, 0xCCFACC15);
				else g.fill(0, line[1], width, line[1] + 1, 0xCCFACC15);
			}
		}
		if (!window) updateHover(mx, my);
		SlashHud.drawAll(g, minecraft, true, window ? null : hover);
		tip = null;
		undoAt = redoAt = null;
		if (!window) drawLayout(g, mx, my);
		else {
			//#if MC >= 1.21.6
			// the window in a layer over the HUD: the GUI draws a layer's texts after its shapes, so the modules'
			// texts and the game parts' names showed on top of the window's edge
			g.nextStratum();
			//#endif
			drawWindow(g, mx, my);
		}
		super.extractRenderState(g, mx, my, delta);
		drawTip(g);
		if (!historyStarted) {
			historyStarted = true;
			history.reset();
		}
	}

	// ---------- undo and redo ----------

	/** Ctrl+Z (Cmd+Z on a Mac) and the like: the shortcut as the tooltip names it. */
	private static String shortcut(boolean redo) {
		if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("mac")) return redo ? "Cmd+Shift+Z" : "Cmd+Z";
		return redo ? "Ctrl+Y" : "Ctrl+Z";
	}

	/** Ctrl held, or Cmd on a Mac: as the game's own text fields take their shortcuts. */
	private static boolean command(KeyEvent e) {
		//#if MC >= 1.21.9
		return (e.modifiers() & net.minecraft.client.input.InputQuirks.EDIT_SHORTCUT_KEY_MODIFIER) != 0;
		//#else
		//$ return (e.modifiers() & (net.minecraft.client.Minecraft.ON_OSX ? org.lwjgl.glfw.GLFW.GLFW_MOD_SUPER : org.lwjgl.glfw.GLFW.GLFW_MOD_CONTROL)) != 0;
		//#endif
	}

	private static boolean shift(KeyEvent e) {
		//#if MC >= 1.21.9
		return e.hasShiftDown();
		//#else
		//$ return (e.modifiers() & org.lwjgl.glfw.GLFW.GLFW_MOD_SHIFT) != 0;
		//#endif
	}

	/** The key types this letter: from 26.3 by the keyboard's own layout, before it by the key's place on a US keyboard. */
	private static boolean letter(KeyEvent e, char c) {
		//#if MC >= 26.3
		return e.shortcutKey() == c;
		//#else
		//$ return e.key() == (c == 'z' ? InputConstants.KEY_Z : InputConstants.KEY_Y);
		//#endif
	}

	private void typed() {
		typedAt = System.currentTimeMillis();
	}

	/** Text typed and not yet a step becomes one now, before the next action. */
	private void settleTyping() {
		if (typedAt == 0) return;
		typedAt = 0;
		history.commit();
	}

	@Override
	public void tick() {
		super.tick();
		// a second without typing closes the step: a word typed is undone at once, not letter by letter
		if (typedAt != 0 && System.currentTimeMillis() - typedAt > 1000) settleTyping();
	}

	private void undo() {
		typedAt = 0;
		if (history.undo()) afterHistory();
	}

	private void redo() {
		typedAt = 0;
		if (history.redo()) afterHistory();
	}

	/** The settings were put back: the cards, the open page and its fields show them, the place in the list stays. */
	private void afterHistory() {
		dragging = null;
		draggingSlider = null;
		painting = null;
		String open = settingsOf == null ? null : settingsOf.id();
		entries = null;
		entries();
		settingsOf = open == null ? null : entries.stream().filter(e -> e.id().equals(open)).findFirst().orElse(null);
		float keep = scroll;
		String query = search == null ? "" : search.getValue();
		rebuildWidgets();
		if (search != null) search.setValue(query);
		scroll = keep;
	}

	/** A small square button for undo or redo: greyed out, and not clickable, when there is nothing to take back or bring back. */
	private void historyButton(GuiGraphicsExtractor g, int x, int y, boolean redo, int mx, int my) {
		boolean enabled = redo ? history.canRedo() : history.canUndo();
		String icon = redo ? "redo" : "undo";
		if (enabled) {
			Ui.button(g, icon, x, y, 18, 18, icon, Component.empty(), false, mx, my);
			hits.add(new Hit(x, y, 18, 18, redo ? this::redo : this::undo));
		} else {
			Ui.round(g, x, y, 18, 18, 4, 0x80161C2A);
			Ui.roundOutline(g, x, y, 18, 18, 4, Ui.BORDER);
			Ui.icon(g, icon, x + 4, y + 4, 10, 0x806B7280);
		}
		if (redo) redoAt = new int[] { x, y, 18 };
		else undoAt = new int[] { x, y, 18 };
		if (Ui.inside(mx, my, x, y, 18, 18)) {
			tip = Ui.tr(redo ? "slashclient-hud.ui.redo" : "slashclient-hud.ui.undo", shortcut(redo));
			tipX = x + 9;
			tipY = y;
		}
	}

	/** The hovered undo or redo button's name and shortcut, in a small label above it (below at the top of the screen). */
	private void drawTip(GuiGraphicsExtractor g) {
		if (tip == null) return;
		int w = Ui.width(tip) + 12, h = 15;
		int x = Math.max(4, Math.min(width - w - 4, tipX - w / 2));
		int y = tipY - h - 3 >= 2 ? tipY - h - 3 : tipY + 21;
		Ui.layer(g);
		Ui.round(g, x, y, w, h, 4, 0xF0111622);
		Ui.roundOutline(g, x, y, w, h, 4, Ui.withAlpha(Ui.ACCENT, 0x40));
		Ui.draw(g, tip, x + 6, y + 4, Ui.TEXT);
	}

	/** For the in-game test: "steps back, steps forward". */
	String historySizes() {
		return history.sizes();
	}

	/** For the in-game test: the middle of the undo or redo button, or null when it is not shown. */
	double[] historyButtonCenter(boolean redo) {
		int[] b = redo ? redoAt : undoAt;
		return b == null ? null : new double[] { b[0] + b[2] / 2.0, b[1] + b[2] / 2.0 };
	}

	/**
	 * The drag view: outlines, names on hover, and a toolbar where it covers no module (on a
	 * solid panel, so it reads well over any world) with the way into the settings.
	 */
	private void drawLayout(GuiGraphicsExtractor g, int mx, int my) {
		HudModule hovered = hover;
		// the hovered module's outline, name, × and gear over everything else's
		List<HudModule> order = new ArrayList<>(SlashHud.MODULES);
		if (hovered != null && order.remove(hovered)) order.add(hovered);
		List<HudModule> under = dragging == null ? stack(mx, my) : List.of();
		for (HudModule m : order) {
			HudConfig.Placement p = SlashHud.config.placement(m.id());
			if (!p.enabled) continue;
			int[] b = box(m);
			boolean hot = m == hovered;
			// the one the arrows move: in blue even when the mouse is elsewhere
			Ui.roundOutline(g, b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4, 3, hot || m == selected ? Ui.ACCENT_LIGHT : 0x66FFFFFF);
			if (hot) {
				Component name = Ui.tr("slashclient-hud.module." + m.id());
				// modules lying on each other: which of them this is, e.g. "FPS 1/2"
				if (under.size() > 1 && under.contains(m)) name = Ui.tr("slashclient-hud.ui.stacked", name, under.indexOf(m) + 1, under.size());
				int tw = Ui.width(name) + 10;
				int ty = b[1] > 16 ? b[1] - 15 : b[1] + b[3] + 3;
				Ui.round(g, b[0] - 2, ty, tw, 13, 3, Ui.ACCENT_DARK);
				Ui.draw(g, name, b[0] + 3, ty + 3, 0xFFFFFFFF);
				if (dragging == null) {
					// × on the corner hides the module; it comes back from its card in the settings
					int[] c = closeBox(m);
					boolean over = Ui.inside(mx, my, c[0], c[1], c[2], c[2]);
					Ui.round(g, c[0], c[1], c[2], c[2], 3, over ? Ui.DANGER : 0xE0161C2A);
					Ui.roundOutline(g, c[0], c[1], c[2], c[2], 3, over ? Ui.DANGER : 0x66FFFFFF);
					Ui.icon(g, "close", c[0] + 2, c[1] + 2, c[2] - 4, 0xFFFFFFFF);
					hits.add(new Hit(c[0], c[1], c[2], c[2], () -> {
						p.enabled = false;
						SlashHud.config.save();
					}));
					// a gear beside it opens the module's settings, when it has any
					Catalog.Entry entry = settingsEntry(m);
					if (entry != null) {
						int[] s = gearBox(m);
						boolean onGear = Ui.inside(mx, my, s[0], s[1], s[2], s[2]);
						Ui.round(g, s[0], s[1], s[2], s[2], 3, onGear ? Ui.ACCENT_DARK : 0xE0161C2A);
						Ui.roundOutline(g, s[0], s[1], s[2], s[2], 3, onGear ? Ui.ACCENT_LIGHT : 0x66FFFFFF);
						Ui.icon(g, "gear", s[0] + 2, s[1] + 2, s[2] - 4, 0xFFFFFFFF);
						hits.add(new Hit(s[0], s[1], s[2], s[2], () -> {
							window = true;
							settingsOf = entry;
							reopen();
						}));
					}
				}
			}
		}
		if (dragging != null) return;
		Component open = Ui.trBold("slashclient-hud.ui.open");
		Component done = Ui.tr("gui.done");
		int openW = Ui.width(open) + 30;
		int doneW = Ui.width(done) + 20;
		int brandW = Ui.brandWidth(1f);
		int barW = 12 + brandW + 14 + openW + 6 + doneW + 8 + 18 + 4 + 18 + 10;
		int barH = 28;
		int bx = (width - barW) / 2;
		int by = toolbarY(bx, barW, barH + 4 + 14);
		Ui.panel(g, bx, by, barW, barH);
		Ui.begin("toolbar", bx, by, barW, barH);
		Ui.brand(g, bx + 12, by + 10, 1f);
		int x = bx + 12 + brandW + 14;
		Ui.button(g, "open", x, by + 5, openW, 18, "gear", open, true, mx, my);
		hits.add(new Hit(x, by + 5, openW, 18, () -> {
			window = true;
			reopen();
		}));
		x += openW + 6;
		Ui.button(g, "done", x, by + 5, doneW, 18, done, false, mx, my);
		hits.add(new Hit(x, by + 5, doneW, 18, this::onClose));
		x += doneW + 8;
		historyButton(g, x, by + 5, false, mx, my);
		historyButton(g, x + 22, by + 5, true, mx, my);
		Ui.end();
		// over modules lying on each other the hint says how to reach the one below
		Component hint = Ui.tr(under.size() > 1 ? "slashclient-hud.ui.stackedHint" : "slashclient-hud.ui.dragHint");
		int hw = Ui.width(hint) + 16;
		Ui.round(g, (width - hw) / 2, by + barH + 4, hw, 14, 4, 0xCC0A0D14);
		Ui.centered(g, hint, width / 2, by + barH + 7, Ui.TEXT_2);
	}


	private void drawWindow(GuiGraphicsExtractor g, int mx, int my) {
		int x = winX(), y = winY(), w = winW(), h = winH();
		Ui.panel(g, x, y, w, h);
		Ui.begin("window", x, y, w, h);
		// header: brand, search, close
		Ui.brand(g, x + 14, y + 12, 1.15f);
		g.fill(x + 1, y + 32, x + w - 1, y + 33, Ui.BORDER);
		if (search != null) {
			boolean focused = search.isFocused();
			Ui.round(g, x + w - 196, y + 7, 156, 18, 4, Ui.CARD);
			Ui.roundOutline(g, x + w - 196, y + 7, 156, 18, 4, focused ? Ui.withAlpha(Ui.ACCENT, 0x99) : Ui.BORDER);
			Ui.icon(g, "search", x + w - 190, y + 11, 10, focused ? Ui.ACCENT_LIGHT : Ui.MUTED);
		}
		Ui.button(g, "close", x + w - 32, y + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(x + w - 32, y + 7, 18, 18, this::onClose));
		// undo and redo left of the search box, when the brand leaves room for them
		int hx = x + w - 196 - 8 - 40;
		if (hx >= x + 14 + Ui.brandWidth(1.15f) + 8) {
			historyButton(g, hx, y + 7, false, mx, my);
			historyButton(g, hx + 22, y + 7, true, mx, my);
		}

		// sidebar with the launcher's icons
		Ui.begin("sidebar", x, y + 33, 122, h - 33);
		int sy = y + 40;
		// rows get shorter in a small window, so "Edit HUD layout" keeps its place at the bottom
		int rowH = Math.max(14, Math.min(20, (h - 40 - 34) / Catalog.CATEGORIES.length - 2));
		for (String cat : Catalog.CATEGORIES) {
			boolean active = cat.equals(category) && settingsOf == null;
			boolean over = Ui.inside(mx, my, x + 8, sy, 106, rowH);
			float t = Ui.hover("cat:" + cat, over);
			if (active) {
				Ui.round(g, x + 8, sy, 106, rowH, 4, 0xFF1B2B4D);
				g.fill(x + 8, sy + 3, x + 10, sy + rowH - 3, Ui.ACCENT_LIGHT);
			} else if (t > 0) Ui.round(g, x + 8, sy, 106, rowH, 4, Ui.blend(Ui.PANEL, Ui.CARD_HOVER, t));
			int color = active ? Ui.ACCENT_LIGHT : Ui.blend(Ui.TEXT_2, Ui.TEXT, t);
			Ui.icon(g, CATEGORY_ICONS[java.util.Arrays.asList(Catalog.CATEGORIES).indexOf(cat)], x + 16, sy + (rowH - 9) / 2, 9, color);
			Ui.draw(g, Ui.tr("slashclient-hud.cat." + cat), x + 31, sy + (rowH - 8) / 2, active ? Ui.TEXT : color);
			String target = cat;
			hits.add(new Hit(x + 8, sy, 106, rowH, () -> {
				category = target;
				settingsOf = null;
				reopen();
			}));
			sy += rowH + 2;
		}
		Ui.button(g, "layout", x + 8, y + h - 26, 106, 18, "move", Ui.tr("slashclient-hud.ui.editLayout"), false, mx, my);
		hits.add(new Hit(x + 8, y + h - 26, 106, 18, () -> {
			window = false;
			rebuildWidgets();
		}));
		Ui.end();
		g.fill(x + 122, y + 33, x + 123, y + h - 1, Ui.BORDER);

		int cx = x + 132, cy = y + 42, cw = w - 144, ch = h - 50;
		Ui.begin("content", cx, cy, cw, ch);
		if (chatTabsPage()) drawChatTabs(g, mx, my, cx, cy, cw, ch);
		else if (crosshairPage()) drawCrosshairPage(g, mx, my, cx, cy, cw, ch);
		else if (settingsOf != null) drawSettings(g, mx, my, cx, cy, cw, ch);
		else if (category.equals("share")) drawShare(g, mx, my, cx, cy, cw, ch);
		else drawCards(g, mx, my, cx, cy, cw, ch);
		Ui.end();
		Ui.end();
	}

	private static final String[] CATEGORY_ICONS = { "all", "info", "combat", "world", "layout", "extras", "skyup", "chat", "share" };


	/** The names searched: each in the game's language, in Polish and in English, without the marks of Polish letters. */
	private static final java.util.Map<String, String> SEARCHED = new java.util.HashMap<>();

	/** Whether a card's name has what was typed, in either language ("zegar" and "clock" both find the clock; "zrodlo" finds "Źródło"). */
	static boolean found(String nameKey, String query) {
		String q = dev.slash3rss.slashclient.hud.inventory.InventorySearch.plain(query.trim());
		if (q.isEmpty()) return true;
		return SEARCHED.computeIfAbsent(nameKey, k -> {
			return dev.slash3rss.slashclient.hud.inventory.InventorySearch.plain(Component.translatable(k).getString() + "\n"
				+ dev.slash3rss.slashclient.hud.inventory.InventorySearch.bothLanguages(k));
		}).contains(q);
	}

	/** The cards of the category open, as searched: the starred ones first, the rest in their usual order. */
	private List<Catalog.Entry> shownCards() {
		String query = search == null ? "" : search.getValue().trim();
		List<Catalog.Entry> shown = new ArrayList<>();
		for (Catalog.Entry e : entries()) {
			// "all" is everything for any server; a server's own tab (SkyUp) only in that tab
			if (category.equals("all") ? e.category().equals("skyup") : !e.category().equals(category)) continue;
			if (!query.isEmpty() && !found(e.nameKey(), query)) continue;
			shown.add(e);
		}
		shown.sort(java.util.Comparator.comparing(e -> !favorite(e.id())));
		return shown;
	}

	private static boolean favorite(String id) {
		return SlashHud.config.favoriteModules.contains(id);
	}

	/** A card starred or not (saved with the rest of the settings). */
	private static void toggleFavorite(String id) {
		List<String> favorites = SlashHud.config.favoriteModules;
		if (!favorites.remove(id)) favorites.add(id);
		SlashHud.config.save();
	}

	/** For the in-game test: this card starred (or not), and the ids of the cards as listed now. */
	String favoriteForTest(String id) {
		toggleFavorite(id);
		return String.join(",", shownCards().stream().map(Catalog.Entry::id).toList());
	}

	private void drawCards(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		List<Catalog.Entry> shown = shownCards();
		int gap = 6;
		int cols = Math.max(1, (w + gap) / (104 + gap));
		int cardW = (w - gap * (cols - 1)) / cols;
		int cardH = 72;
		int rows = (shown.size() + cols - 1) / cols;
		maxScroll = Math.max(0, rows * (cardH + gap) - gap - h);
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		if (shown.isEmpty()) Ui.centered(g, Ui.tr("slashclient-hud.ui.nothing"), x + w / 2, y + 30, Ui.MUTED);
		g.enableScissor(x, y, x + w, y + h);
		Ui.beginClip("card list", x, y, w, h);
		CARDS.clear();
		for (int i = 0; i < shown.size(); i++) {
			Catalog.Entry e = shown.get(i);
			int px = x + (i % cols) * (cardW + gap);
			int py = y + (i / cols) * (cardH + gap) - Math.round(scroll);
			if (py + cardH < y || py > y + h) continue;
			Ui.begin("card " + e.id(), px, py, cardW, cardH);
			drawCard(g, mx, my, e, px, py, cardW, cardH, my >= y && my < y + h);
			Ui.end();
		}
		Ui.end();
		g.disableScissor();
		if (maxScroll > 0) {
			Ui.end();
			bar.draw(g, x + w + 4, y, h, scroll, maxScroll, mx, my);
			Ui.begin("content", x, y, w, h);
		}
	}

	private void drawCard(GuiGraphicsExtractor g, int mx, int my, Catalog.Entry e, int x, int y, int w, int h, boolean clickable) {
		CARDS.put(e.id(), new int[] { x, y, w, h });
		boolean on = e.hasSwitch() && e.get().get();
		float t = Ui.hover("card:" + e.id(), clickable && Ui.inside(mx, my, x, y, w, h));
		Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
		Ui.roundOutline(g, x, y, w, h, 5, on ? Ui.withAlpha(Ui.ACCENT, 0xAA) : Ui.blend(Ui.BORDER, 0x40FFFFFF, t));
		// the icon sits on a small tile, blue when the module is on: the same icons as the launcher and the menu
		Ui.round(g, x + w / 2 - 13, y + 7, 26, 26, 5, on ? 0xFF1B2B4D : 0xFF202839);
		Ui.icon(g, e.icon(), x + w / 2 - 8, y + 12, 16, on ? Ui.ACCENT_LIGHT : Ui.blend(Ui.TEXT_2, Ui.TEXT, t));
		// a name too long for the card slides through while the mouse is on it
		Ui.marquee(g, "card:" + e.id(), Ui.trBold(e.nameKey()), x + w / 2, y + 38, w - 10, Ui.TEXT, clickable && Ui.inside(mx, my, x, y, w, h));
		// the star in the corner: gold on a favourite, faint on the others while the mouse is on the card
		boolean star = favorite(e.id());
		boolean onStar = clickable && Ui.inside(mx, my, x + 3, y + 3, 14, 14);
		if (star || t > 0.01f) Ui.icon(g, star ? "star" : "star-regular", x + 5, y + 5, 10,
			star ? 0xFFFBBF24 : onStar ? 0xFFFDE68A : Ui.blend(0x00FFFFFF, 0x99B4BCC8, t));
		boolean gear = !e.settings().isEmpty();
		if (e.hasSwitch()) {
			Ui.toggle(g, e.id(), x + 8, y + h - 16, on);
			Ui.draw(g, Ui.tr(on ? "slashclient-hud.ui.on" : "slashclient-hud.ui.off"), x + 32, y + h - 16, on ? Ui.ACCENT_LIGHT : Ui.MUTED);
			// the whole card switches the module; the gear on it opens its settings. Clicks are matched
			// from the last added, so the gear goes in after the card or the card would take its clicks
			if (clickable) hits.add(new Hit(x, y, w, h, () -> e.set().accept(!e.get().get())));
			if (gear) {
				Ui.button(g, "gear:" + e.id(), x + w - 24, y + h - 21, 16, 16, "gear", Component.empty(), false, mx, my);
				if (clickable) hits.add(new Hit(x + w - 24, y + h - 21, 16, 16, () -> openSettings(e)));
			}
		} else {
			boolean settings = gear && e.open() == null;
			Component action = Ui.tr(settings ? "slashclient-hud.ui.settings" : "slashclient-hud.ui.openIt");
			int aw = Ui.width(action) + 22;
			Ui.icon(g, settings ? "gear" : "arrow", x + (w - aw) / 2, y + h - 16, 9, Ui.ACCENT_LIGHT);
			Ui.draw(g, action, x + (w - aw) / 2 + 13, y + h - 16, Ui.ACCENT_LIGHT);
			if (clickable) hits.add(new Hit(x, y, w, h, () -> {
				if (e.open() != null) e.open().run();
				else openSettings(e);
			}));
			// a card that opens something and has settings too (its keys): the gear opens them
			if (e.open() != null && gear) {
				Ui.button(g, "gear:" + e.id(), x + w - 24, y + 4, 16, 16, "gear", Component.empty(), false, mx, my);
				if (clickable) hits.add(new Hit(x + w - 24, y + 4, 16, 16, () -> openSettings(e)));
			}
		}
		// last, so the star takes its clicks before the card does
		if (clickable) hits.add(new Hit(x + 3, y + 3, 14, 14, () -> toggleFavorite(e.id())));
	}


	/** The list as it was when a module's settings opened (its category, scroll and search): back from them, it is so again. */
	private String listCategory;
	private float listScroll;
	private String listQuery = "";

	private void openSettings(Catalog.Entry e) {
		listCategory = category;
		listScroll = scroll;
		listQuery = search == null ? "" : search.getValue();
		settingsOf = e;
		reopen();
	}

	/** For the in-game test: "k" searched and the list scrolled, a module's settings opened and left with "Back": "search scroll". */
	String listKeptForTest() {
		search.setValue("k");
		scroll = 30;
		openSettings(entries().get(0));
		settingsOf = null;
		reopen();
		return search.getValue() + " " + scroll;
	}

	/** How many lines a switch's label takes beside its switch (at most two; a longer one still ends in "…"). */
	private int toggleLines(Catalog.Setting s, int w) {
		return Math.min(2, font.split(Ui.tr(s.labelKey()), w - 46).size());
	}

	/** Width the controls of a setting need on one line. */
	private static int controlsWidth(Catalog.Setting s) {
		if (s instanceof Catalog.Toggle || s instanceof Catalog.Info) return 20;
		if (s instanceof Catalog.Note || s instanceof Catalog.Order) return 0;
		if (s instanceof Catalog.Slider) return 150;
		if (s instanceof Catalog.Text) return 150;
		if (s instanceof Catalog.Key) return KEY_W + 4 + 17;
		if (s instanceof Catalog.Choice ch) {
			int total = 0;
			for (String v : ch.values()) total += Ui.width(Ui.tr(ch.valueKeyPrefix() + v)) + 16;
			return total - 4;
		}
		return ((Catalog.Colors) s).colors().length * 16;
	}

	/** The line under a key row: what to press while it waits, or the other bindings on the same key; null for none. */
	private Component keyLine(Catalog.Key k) {
		if (k.equals(waitingKey)) return Ui.tr("slashclient-hud.keyRow.press");
		var key = Catalog.keyMapping(k.labelKey());
		if (key == null) return null;
		List<net.minecraft.client.KeyMapping> others = Catalog.clashes(key);
		if (others.isEmpty()) return null;
		net.minecraft.network.chat.MutableComponent names = Component.empty();
		for (int i = 0; i < others.size(); i++) {
			if (i > 0) names.append(", ");
			names.append(Component.translatable(others.get(i).getName()));
		}
		return Ui.tr("slashclient-hud.keyRow.clash", names);
	}

	/**
	 * A key of the game's controls on a module's page: the button shows the key (red when another
	 * binding has it too), a click waits for the next key or mouse button, the arrow sets it back.
	 */
	private void drawKey(GuiGraphicsExtractor g, int mx, int my, Catalog.Key k, int right, int cy, int lineY, int lineW, int lineX) {
		var key = Catalog.keyMapping(k.labelKey());
		if (key == null) return;
		boolean waiting = k.equals(waitingKey);
		boolean clash = !Catalog.clashes(key).isEmpty();
		Component label = waiting ? Ui.text("> … <") : key.isUnbound() ? Ui.tr("slashclient-hud.keybinds.none") : key.getTranslatedKeyMessage();
		int kx = right - 17 - 4 - KEY_W;
		Ui.button(g, "key:" + k.labelKey(), kx, cy, KEY_W, 16, null, label.copy().withStyle(st -> clash && !waiting ? st.withColor(0xF87171) : st), waiting, mx, my);
		KEYS.put(k.labelKey(), new int[] { kx, cy, KEY_W, 16 });
		hits.add(new Hit(kx, cy, KEY_W, 16, () -> waitingKey = waiting ? null : k));
		boolean changed = !key.getDefaultKey().equals(Catalog.keyOf(key));
		Ui.button(g, "key:reset:" + k.labelKey(), right - 17, cy, 17, 16, "reset", Component.empty(), false, mx, my);
		if (changed) hits.add(new Hit(right - 17, cy, 17, 16, () -> {
			Catalog.setKey(key, key.getDefaultKey());
			waitingKey = null;
		}));
		Component line = keyLine(k);
		if (line != null) Ui.wrapped(g, line, lineX, lineY, lineW, waiting ? Ui.ACCENT_LIGHT : 0xFFF87171);
	}

	/** The key waiting on the settings page gets this one (UNKNOWN: none) and stops waiting. */
	private void bindWaiting(InputConstants.Key to) {
		var key = Catalog.keyMapping(waitingKey.labelKey());
		waitingKey = null;
		if (key != null) Catalog.setKey(key, to);
	}

	/** A note's height: its text wrapped beside the icon. */
	private static int infoHeight(Catalog.Info info, int w) {
		return Math.max(26, 7 + net.minecraft.client.Minecraft.getInstance().font.split(Ui.tr(info.text().get()), w - 36).size() * 11 + 6);
	}

	private void drawSettings(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		Catalog.Entry e = settingsOf;
		Ui.button(g, "back", x, y, 70, 18, "back", Ui.tr("slashclient-hud.ui.back"), false, mx, my);
		hits.add(new Hit(x, y, 70, 18, () -> {
			settingsOf = null;
			reopen();
		}));
		Ui.round(g, x + 78, y, 20, 18, 4, 0xFF1B2B4D);
		Ui.icon(g, e.icon(), x + 82, y + 3, 12, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold(e.nameKey()), w - 106), x + 104, y + 5, Ui.TEXT);
		List<Catalog.Setting> rows = new ArrayList<>(e.settings());
		if (e.hasSwitch()) {
			rows.add(0, new Catalog.Toggle("slashclient-hud.ui.enabled", e.get(), e.set()));
		}
		boolean isModule = SlashHud.MODULES.stream().anyMatch(m -> m.id().equals(e.id()));

		// a row is one line, or two when its controls do not fit beside the label (narrow windows)
		int[] heights = new int[rows.size()];
		boolean[] split = new boolean[rows.size()];
		int sliderFrom = 0, valueBox = 0;
		int contentH = (isModule ? 28 : 0) + (rows.isEmpty() ? 14 : 0);
		for (int i = 0; i < rows.size(); i++) {
			Catalog.Setting s = rows.get(i);
			int labelW = Ui.width(Ui.tr(s.labelKey())) + 24;
			boolean oneLine = s instanceof Catalog.Toggle || labelW + controlsWidth(s) <= w - 20;
			heights[i] = s instanceof Catalog.Info info ? infoHeight(info, w) : oneLine ? 26 : 44;
			// a switch's label too long for its line goes on into a second one instead of ending in "…"
			if (s instanceof Catalog.Toggle) heights[i] = 26 + 11 * (toggleLines(s, w) - 1);
			split[i] = !oneLine;
			// a key: a line more under it while it waits for a key, or when another binding has the same one
			if (s instanceof Catalog.Key k && keyLine(k) != null) heights[i] += 1 + 11 * font.split(keyLine(k), w - 20).size();
			// the sliders on one line all start where the longest of their labels ends, one under another
			if (s instanceof Catalog.Slider && oneLine) sliderFrom = Math.max(sliderFrom, labelW - 10);
			// and their values in boxes of one width, so the tracks end one under another too
			if (s instanceof Catalog.Slider sl) valueBox = Math.max(valueBox, Math.max(Ui.width(Ui.text(String.format(Locale.ROOT, sl.format(), sl.min()))),
				Ui.width(Ui.text(String.format(Locale.ROOT, sl.format(), sl.max())))) + 10);
			// a note: as many lines as its text needs
			if (s instanceof Catalog.Note n) heights[i] = Math.max(26, 14 + 11 * font.split(Ui.tr(n.labelKey(), n.args().get()), w - 20).size());
			// a list in order: its label, then a line for each of its items (or for why it is empty)
			if (s instanceof Catalog.Order o) heights[i] = 26 + 20 * Math.max(1, o.items().get().size());
			contentH += heights[i] + 4;
		}
		int listTop = y + 26;
		int listH = h - 26;
		maxScroll = Math.max(0, contentH - listH);
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		listTopDrawn = listTop;
		listHDrawn = listH;
		g.enableScissor(x, listTop, x + w, listTop + listH);
		Ui.beginClip("settings list", x, listTop, w, listH);
		int ry = listTop + 2 - Math.round(scroll);
		boolean inList = my >= listTop && my < listTop + listH;
		ROWS.clear();
		SLIDERS.clear();
		KEYS.clear();
		for (EditBox box : textFields.values()) box.visible = false;
		for (int i = 0; i < rows.size(); i++) {
			Catalog.Setting s = rows.get(i);
			int rh = heights[i];
			boolean twoLines = s instanceof Catalog.Note ? rh > 26 : split[i];
			if (s instanceof Catalog.Info info) {
				// a note: an icon and its text wrapped, on a quieter card
				Ui.round(g, x, ry, w, rh, 4, 0xFF13203A);
				Ui.begin("row " + s.labelKey(), x, ry, w, rh);
				Ui.icon(g, "info", x + 9, ry + 8, 10, Ui.ACCENT_LIGHT);
				Ui.wrapped(g, Ui.tr(info.text().get()), x + 26, ry + 9, w - 36, Ui.TEXT_2);
				Ui.end();
				ry += rh + 4;
				continue;
			}
			Ui.round(g, x, ry, w, rh, 4, Ui.CARD);
			ROWS.put(s.labelKey(), new int[] { x, ry, w, rh });
			Ui.begin("row " + s.labelKey(), x, ry, w, rh);
			// a switch's label stops before the switch (a long one ends in "…" instead of running under it)
			Component label = Ui.fit(Ui.tr(s.labelKey()), s instanceof Catalog.Toggle ? w - 46 : w - 20);
			if (s instanceof Catalog.Note n) Ui.wrapped(g, Ui.tr(n.labelKey(), n.args().get()), x + 10, ry + 8, w - 20, Ui.TEXT_2);
			else if (s instanceof Catalog.Toggle && toggleLines(s, w) > 1) Ui.wrapped(g, Ui.tr(s.labelKey()), x + 10, ry + 9, w - 46, Ui.TEXT);
			else Ui.draw(g, label, x + 10, ry + 9, Ui.TEXT);
			int labelEnd = x + 10 + Ui.width(label) + 14;
			int right = x + w - 10;
			// controls start after the label, or at the left edge of the second line
			int left = twoLines ? x + 10 : labelEnd;
			int cy = twoLines ? ry + 24 : ry + 5;
			int hitsBefore = hits.size();
			if (s instanceof Catalog.Toggle tg) {
				boolean on = tg.get().get();
				Ui.toggle(g, e.id() + ":" + s.labelKey(), right - 20, ry + (rh - 10) / 2, on);
				hits.add(new Hit(x, ry, w, rh, () -> tg.set().accept(!tg.get().get())));
			} else if (s instanceof Catalog.Slider sl) {
				float value = sl.get().get();
				Component shownValue = Ui.text(String.format(Locale.ROOT, sl.format(), value));
				// the value's box as wide as its widest value, so the track does not change length while dragged
				int vw = Math.max(Ui.width(shownValue) + 10, valueBox);
				int sx = twoLines ? left + 4 : Math.max(Math.max(left, x + 10 + sliderFrom), right - 196);
				int sw = Math.max(30, right - vw - 12 - sx);
				Ui.slider(g, sx, cy + 3, sw, (value - sl.min()) / (sl.max() - sl.min()));
				SLIDERS.put(s.labelKey(), new int[] { sx, cy + 3, sw });
				Ui.round(g, right - vw, cy + 1, vw, 14, 4, 0xFF202839);
				Ui.draw(g, shownValue, right - vw + 5, cy + 4, Ui.TEXT);
				hits.add(new Hit(sx - 4, cy - 1, sw + 8, 18, () -> {
					draggingSlider = sl;
					sliderX = sx;
					sliderW = sw;
				}));
			} else if (s instanceof Catalog.Choice ch) {
				if (controlsWidth(s) <= right - left) {
					// every option as a button, right-aligned
					int bx = right;
					for (int k = ch.values().length - 1; k >= 0; k--) {
						String v = ch.values()[k];
						Component option = Ui.tr(ch.valueKeyPrefix() + v);
						int bw = Ui.width(option) + 12;
						bx -= bw;
						boolean active = v.equals(ch.get().get());
						if (active) {
							Ui.accent(g, bx, cy, bw, 16, 4, 0);
							Ui.centered(g, option, bx + bw / 2, cy + 4, 0xFFFFFFFF);
						} else Ui.button(g, "choice:" + v, bx, cy, bw, 16, option, false, mx, my);
						hits.add(new Hit(bx, cy, bw, 16, () -> ch.set().accept(v)));
						bx -= 4;
					}
				} else {
					// too narrow even for its own line: one button that steps through the options
					List<String> values = List.of(ch.values());
					String current = values.contains(ch.get().get()) ? ch.get().get() : values.get(0);
					Component option = Ui.text("‹  ").append(Ui.tr(ch.valueKeyPrefix() + current)).append(Ui.text("  ›"));
					Ui.button(g, "choice:" + s.labelKey(), left, cy, right - left, 16, option, true, mx, my);
					hits.add(new Hit(left, cy, right - left, 16, () -> ch.set().accept(values.get((values.indexOf(current) + 1) % values.size()))));
				}
			} else if (s instanceof Catalog.Text tx && textFields.containsKey(tx)) {
				// a text field: the box is drawn here, the field (a widget) over it after the window
				EditBox box = textFields.get(tx);
				int fx = twoLines ? left : Math.max(left, right - 200);
				Ui.round(g, fx, cy, right - fx, 16, 4, 0xFF202839);
				Ui.roundOutline(g, fx, cy, right - fx, 16, 4, box.isFocused() ? Ui.withAlpha(Ui.ACCENT, 0x99) : Ui.BORDER);
				box.setX(fx + 5);
				box.setY(cy + 4);
				box.setWidth(right - fx - 10);
				// only while its whole row is in the list's box: the widget is not clipped by the scissor
				box.visible = ry >= listTop && ry + rh <= listTop + listH;
			} else if (s instanceof Catalog.Colors co) {
				int bx = twoLines ? left : right - co.colors().length * 16 + 4;
				for (int c : co.colors()) {
					boolean active = c == co.get().get();
					if (active) Ui.round(g, bx - 1, cy + 1, 14, 14, 4, 0xFFFFFFFF);
					Ui.round(g, bx, cy + 2, 12, 12, 3, c);
					hits.add(new Hit(bx, cy + 2, 12, 12, () -> co.set().accept(c)));
					bx += 16;
				}
			} else if (s instanceof Catalog.Key k) {
				drawKey(g, mx, my, k, right, cy, twoLines ? ry + 44 - 2 : ry + 26 - 2, w - 20, x + 10);
			} else if (s instanceof Catalog.Order o) {
				// each item on its line, numbered, with arrows moving it up and down (none past the ends)
				List<String> items = o.items().get();
				if (items.isEmpty()) Ui.draw(g, Ui.fit(Ui.tr(o.emptyKey()), w - 30), x + 14, ry + 30, Ui.MUTED);
				for (int k = 0; k < items.size(); k++) {
					int iy = ry + 24 + k * 20, place = k;
					Ui.round(g, x + 8, iy, w - 16, 18, 4, 0xFF202839);
					Ui.draw(g, Ui.fit(Ui.text((k + 1) + ". " + items.get(k)), w - 70), x + 14, iy + 5, Ui.TEXT);
					if (k > 0) {
						Ui.button(g, "order:up:" + k, right - 38, iy + 1, 18, 16, "arrow-up", Component.empty(), false, mx, my);
						hits.add(new Hit(right - 38, iy + 1, 18, 16, () -> o.move().accept(place, -1)));
					}
					if (k < items.size() - 1) {
						Ui.button(g, "order:down:" + k, right - 18, iy + 1, 18, 16, "arrow-down", Component.empty(), false, mx, my);
						hits.add(new Hit(right - 18, iy + 1, 18, 16, () -> o.move().accept(place, 1)));
					}
				}
			}
			// controls on the label's line must not cover it
			if (!twoLines && !(s instanceof Catalog.Toggle) && !(s instanceof Catalog.Note)) Ui.expect(labelEnd - 14 <= right - controlsWidth(s) || s instanceof Catalog.Slider, "controls cover the label of " + s.labelKey());
			Ui.end();
			// rows scrolled out of the box cannot be clicked
			if (!inList) while (hits.size() > hitsBefore) hits.remove(hits.size() - 1);
			ry += rh + 4;
		}
		if (rows.isEmpty()) Ui.draw(g, Ui.tr("slashclient-hud.ui.noSettings"), x, ry, Ui.MUTED);
		// modules can also be moved from here
		if (isModule) {
			int bw = Math.min(150, w);
			Ui.button(g, "move", x, ry, bw, 18, "move", Ui.tr("slashclient-hud.ui.moveIt"), false, mx, my);
			if (inList) hits.add(new Hit(x, ry, bw, 18, () -> {
				window = false;
				rebuildWidgets();
			}));
		}
		Ui.end();
		g.disableScissor();
		if (maxScroll > 0) {
			Ui.end();
			bar.draw(g, x + w + 4, listTop, listH, scroll, maxScroll, mx, my);
			Ui.begin("content", x, y, w, h);
		}
	}


	private void drawShare(GuiGraphicsExtractor g, int mx, int my, int x, int top, int w, int h) {
		// scrolled when the window is too low for the codes and the servers' layouts together
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		int y = top - Math.round(scroll);
		int hitsBefore = hits.size();
		g.enableScissor(x, top, x + w, top + h);
		Ui.beginClip("share page", x, top, w, h);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.share.title"), w), x, y + 2, Ui.TEXT);
		int ty = Ui.wrapped(g, Ui.tr("slashclient-hud.share.help"), x, y + 16, w, Ui.TEXT_2) + 8;
		HudConfig cfg = SlashHud.config;
		// three buttons side by side, or one under another when they would be cut
		boolean stacked = w < 300;
		int bw = stacked ? w : (w - 12) / 3;
		int[][] at = stacked
			? new int[][] { { x, ty }, { x, ty + 26 }, { x, ty + 52 } }
			: new int[][] { { x, ty }, { x + bw + 6, ty }, { x + (bw + 6) * 2, ty } };
		Ui.button(g, "copy", at[0][0], at[0][1], bw, 22, "copy", Ui.tr("slashclient-hud.share.copy"), true, mx, my);
		hits.add(new Hit(at[0][0], at[0][1], bw, 22, () -> {
			minecraft.keyboardHandler.setClipboard(ShareCode.encode(cfg));
			status = Ui.tr("slashclient-hud.share.copied");
		}));
		Ui.button(g, "paste", at[1][0], at[1][1], bw, 22, "paste", Ui.tr("slashclient-hud.share.paste"), false, mx, my);
		hits.add(new Hit(at[1][0], at[1][1], bw, 22, () -> {
			HudConfig pasted = ShareCode.decode(minecraft.keyboardHandler.getClipboard());
			if (pasted == null) status = Ui.tr("slashclient-hud.share.invalid").withStyle(st -> st.withColor(Ui.DANGER));
			else {
				cfg.copyFrom(pasted);
				ChatTabs.changed();
				entries = null;
				entries();
				status = Ui.tr("slashclient-hud.share.pasted");
			}
		}));
		Ui.button(g, "reset", at[2][0], at[2][1], bw, 22, "reset", Ui.tr("slashclient-hud.reset"), false, mx, my);
		hits.add(new Hit(at[2][0], at[2][1], bw, 22, () -> {
			cfg.copyFrom(HudConfig.defaults());
			ChatTabs.changed();
			entries = null;
			entries();
			status = Ui.tr("slashclient-hud.share.reset");
		}));
		int below = Math.max(at[2][1] + 30, Ui.wrapped(g, status, x, at[2][1] + 30, w, Ui.GREEN)) + 4;
		// a layout of its own for the server the game is on
		int end = ServerLayoutsPanel.draw(g, mx, my, x, below, w, (hx, hy, hw, hh, action) -> hits.add(new Hit(hx, hy, hw, hh, action)), () -> {
			entries = null;
			entries();
			// another server's layout (or the player's own) is on: undo would mix the two
			history.reset();
		});
		Ui.end();
		g.disableScissor();
		maxScroll = Math.max(0, end + Math.round(scroll) - top - h);
		// what is scrolled out of the box cannot be clicked
		for (int i = hits.size() - 1; i >= hitsBefore; i--) {
			Hit hit = hits.get(i);
			int y1 = Math.max(hit.y(), top), y2 = Math.min(hit.y() + hit.h(), top + h);
			if (y2 <= y1) hits.remove(i);
			else hits.set(i, new Hit(hit.x(), y1, hit.w(), y2 - y1, hit.action()));
		}
		if (maxScroll > 0) {
			Ui.end();
			bar.draw(g, x + w + 4, top, h, scroll, maxScroll, mx, my);
			Ui.begin("content", x, top, w, h);
		}
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
		// a key row waiting: the next mouse button, any of them, is its new key
		if (waitingKey != null) {
			bindWaiting(InputConstants.Type.MOUSE.getOrCreate(e.button()));
			return true;
		}
		settleTyping();
		//#if MC >= 1.21.9
		if (super.mouseClicked(e, doubleClick)) return true;
		//#else
		//$ if (super.mouseClicked(e.x(), e.y(), e.button())) return true;
		//#endif
		if (search != null) search.setFocused(false);
		for (EditBox box : textFields.values()) box.setFocused(false);
		HudModule last = clicked;
		clicked = null;
		if (e.button() == InputConstants.MOUSE_BUTTON_RIGHT && !window) {
			HudModule m = moduleAt(e.x(), e.y());
			if (m != null) {
				window = true;
				settingsOf = entries().stream().filter(x -> x.id().equals(m.id())).findFirst().orElse(null);
				reopen();
				return true;
			}
		}
		if (e.button() != InputConstants.MOUSE_BUTTON_LEFT) return false;
		if (window && bar.press(e.x(), e.y())) {
			scroll = bar.drag(e.y());
			return true;
		}
		int span = gridCell * Crosshair.N;
		if (crosshairPage() && Ui.inside(e.x(), e.y(), gridX, gridY, span, span)) {
			// the first pixel decides: drag from an empty one to draw, from a full one to erase
			int cx = (int) ((e.x() - gridX) / gridCell), cy = (int) ((e.y() - gridY) / gridCell);
			painting = !Crosshair.current()[cy * Crosshair.N + cx];
			if (!Crosshair.CUSTOM.equals(SlashHud.config.crosshair)) Crosshair.editable();
			paintAt(e.x(), e.y());
			return true;
		}
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				if (draggingSlider != null) dragSlider(e.x());
				return true;
			}
		}
		if (window) {
			// a click beside the window closes it, as in the launcher's dialogs
			if (!Ui.inside(e.x(), e.y(), winX(), winY(), winW(), winH())) {
				window = false;
				settingsOf = null;
				rebuildWidgets();
			}
			return true;
		}
		HudModule m = moduleAt(e.x(), e.y());
		// modules lying on each other: Alt+click, or a second click in the same place without moving,
		// takes the next one down (and from the lowest the top one again)
		List<HudModule> under = stack(e.x(), e.y());
		boolean again = m != null && m == last && Math.abs(e.x() - clickX) <= 2 && Math.abs(e.y() - clickY) <= 2;
		if (m != null && under.size() > 1 && (again || altDown(e))) {
			m = under.get((under.indexOf(m) + 1) % under.size());
			hover = m;
		}
		if (m == null) return false;
		// the chat stays where the game draws it, but a click on it still counts for reaching what lies under it
		if (GameParts.fixed(m)) {
			clicked = m;
			clickX = e.x();
			clickY = e.y();
			return true;
		}
		int[] b = box(m);
		dragging = m;
		selected = m;
		grabX = e.x() - b[0];
		grabY = e.y() - b[1];
		pressX = e.x();
		pressY = e.y();
		moved = false;
		return true;
	}

	private void dragSlider(double mouseX) {
		Catalog.Slider s = draggingSlider;
		float f = (float) Math.max(0, Math.min(1, (mouseX - sliderX) / sliderW));
		float v = s.min() + f * (s.max() - s.min());
		v = Math.round(v / s.step()) * s.step();
		s.set().accept(Math.max(s.min(), Math.min(s.max(), v)));
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
	//#else
	//$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (painting != null) {
			paintAt(e.x(), e.y());
			return true;
		}
		if (draggingSlider != null) {
			dragSlider(e.x());
			return true;
		}
		if (bar.dragging()) {
			scroll = bar.drag(e.y());
			return true;
		}
		//#if MC >= 1.21.9
		if (dragging == null) return super.mouseDragged(e, dx, dy);
		//#else
		//$ if (dragging == null) return super.mouseDragged(e.x(), e.y(), e.button(), dx, dy);
		//#endif
		// a click that wobbles by a pixel moves nothing (and a second one in place reaches the module under it)
		if (!moved) {
			if (Math.abs(e.x() - pressX) <= 1 && Math.abs(e.y() - pressY) <= 1) return true;
			moved = true;
		}
		int[] b = box(dragging);
		HudConfig.Placement p = SlashHud.config.placement(dragging.id());
		int rawX = (int) Math.round(e.x() - grabX), rawY = (int) Math.round(e.y() - grabY);
		int x = snap(rawX, b[2], width, true);
		int y = snap(rawY, b[3], height, false);
		// not held by the screen's edge or centre: line up with the other modules (edges, centres, side by side)
		guides.clear();
		if (x == Math.max(0, Math.min(width - b[2], rawX))) x = alignTo(x, b[2], y, b[3], true);
		if (y == Math.max(0, Math.min(height - b[3], rawY))) y = alignTo(y, b[3], x, b[2], false);
		// keep to the third of the screen the module is in, so it stays there when the window changes
		p.ax = anchor(x + b[2] / 2.0, width);
		p.ay = anchor(y + b[3] / 2.0, height);
		p.dx = x - Math.round(p.ax * (width - b[2]));
		p.dy = y - Math.round(p.ay * (height - b[3]));
		return true;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseReleased(MouseButtonEvent e) {
	//#else
	//$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (dragging != null && !moved) {
			clicked = dragging;
			clickX = pressX;
			clickY = pressY;
		}
		dragging = null;
		draggingSlider = null;
		bar.release();
		painting = null;
		lastCellX = lastCellY = -1;
		snappedX = snappedY = false;
		guides.clear();
		// a click, a drag of a module or a slider, a stroke on the crosshair: one step each
		if (typedAt == 0) history.commit();
		//#if MC >= 1.21.9
		return super.mouseReleased(e);
		//#else
		//$ return super.mouseReleased(e.x(), e.y(), e.button());
		//#endif
	}

	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//$ 	double h = 0;
	//#endif
		if (window) {
			scroll = Math.max(0, Math.min(maxScroll, scroll - (float) v * 24));
			return true;
		}
		//#if MC >= 1.20.2
		return super.mouseScrolled(x, y, h, v);
		//#else
		//$ return super.mouseScrolled(x, y, v);
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		// a key row waiting: Esc gives up, Backspace or Delete leaves it without a key, any other key is the new one
		if (waitingKey != null) {
			if (e.key() == InputConstants.KEY_ESCAPE) waitingKey = null;
			else if (e.key() == InputConstants.KEY_BACKSPACE || e.key() == InputConstants.KEY_DELETE) bindWaiting(InputConstants.UNKNOWN);
			//#if MC >= 1.21.9
			else bindWaiting(InputConstants.getKey(e));
			//#else
			//$ else bindWaiting(InputConstants.getKey(e.key(), e.scancode()));
			//#endif
			return true;
		}
		// Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo (Cmd on a Mac), also while typing in a field
		boolean command = command(e), shift = shift(e);
		if (command && letter(e, 'z')) {
			if (shift) redo();
			else undo();
			return true;
		}
		if (command && letter(e, 'y') && !shift) {
			redo();
			return true;
		}
		// the arrows or WASD move the module last taken, a pixel at a time (ten with Shift), not while typing
		int[] step = nudgeStep(e);
		if (step != null && !window && selected != null && SlashHud.config.placement(selected.id()).enabled
			&& !(getFocused() instanceof EditBox field && field.isFocused())) {
			int by = shift || shiftHeld() ? 10 : 1;
			nudge(selected, step[0] * by, step[1] * by);
			history.commit();
			return true;
		}
		// Esc closes the window first, then the editor
		if (e.key() == InputConstants.KEY_ESCAPE && window) {
			if (settingsOf != null) settingsOf = null;
			else window = false;
			reopen();
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
		//#endif
	}

	/** Shift held on the keyboard (the key's own event may not carry it). */
	private boolean shiftHeld() {
		//#if MC >= 1.21.9
		return minecraft.hasShiftDown();
		//#else
		//$ return Screen.hasShiftDown();
		//#endif
	}

	/** Which way a key moves a module (x, y), or null when it is not an arrow or W, A, S, D. */
	private static int[] nudgeStep(KeyEvent e) {
		return switch (e.key()) {
			case InputConstants.KEY_LEFT, InputConstants.KEY_A -> new int[] { -1, 0 };
			case InputConstants.KEY_RIGHT, InputConstants.KEY_D -> new int[] { 1, 0 };
			case InputConstants.KEY_UP, InputConstants.KEY_W -> new int[] { 0, -1 };
			case InputConstants.KEY_DOWN, InputConstants.KEY_S -> new int[] { 0, 1 };
			default -> null;
		};
	}

	/** Moves a module by so many pixels, on the screen, kept to the third of it it ends in (as a drag does). */
	private void nudge(HudModule m, int dx, int dy) {
		int[] b = box(m);
		HudConfig.Placement p = SlashHud.config.placement(m.id());
		int x = Math.max(0, Math.min(width - b[2], b[0] + dx)), y = Math.max(0, Math.min(height - b[3], b[1] + dy));
		p.ax = anchor(x + b[2] / 2.0, width);
		p.ay = anchor(y + b[3] / 2.0, height);
		p.dx = x - Math.round(p.ax * (width - b[2]));
		p.dy = y - Math.round(p.ay * (height - b[3]));
	}

	/** For the in-game test: "Edit layout" pressed in the settings window. */
	void layoutForTest() {
		window = false;
		rebuildWidgets();
	}

	/**
	 * For the in-game test: the settings list scrolled (if need be) so the row is in view, as a player would; where
	 * the row is then (x, y, w, h), or null when the page has no such row.
	 */
	static int[] rowInViewForTest(String labelKey) {
		int[] r = ROWS.get(labelKey);
		if (r == null || !(Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof HudEditScreen s)) return r;
		float before = s.scroll;
		if (r[1] + r[3] > s.listTopDrawn + s.listHDrawn) s.scroll += r[1] + r[3] - (s.listTopDrawn + s.listHDrawn) + 2;
		else if (r[1] < s.listTopDrawn) s.scroll -= s.listTopDrawn - r[1] + 2;
		s.scroll = Math.max(0, Math.min(s.maxScroll, s.scroll));
		int moved = Math.round(s.scroll) - Math.round(before);
		return new int[] { r[0], r[1] - moved, r[2], r[3] };
	}

	/** For the in-game test: the module the arrows move. */
	String selectedId() {
		return selected == null ? null : selected.id();
	}

	// ---------- module boxes ----------

	/** The module a click here takes: the hovered one while the mouse is inside it, else the topmost. */
	private HudModule moduleAt(double x, double y) {
		updateHover(x, y);
		return hover != null && inside(hover, x, y) ? hover : null;
	}

	/** The shown modules whose box holds the point, the topmost first: the order a second click goes down through them. */
	private List<HudModule> stack(double x, double y) {
		List<HudModule> out = new ArrayList<>();
		for (int i = SlashHud.MODULES.size() - 1; i >= 0; i--) {
			HudModule m = SlashHud.MODULES.get(i);
			if (SlashHud.config.placement(m.id()).enabled && inside(m, x, y)) out.add(m);
		}
		return out;
	}

	private boolean inside(HudModule m, double x, double y) {
		int[] b = box(m);
		return Ui.inside(x, y, b[0], b[1], b[2], b[3]);
	}

	/** On the module's × or gear: they stick out of its box, and still count as on the module. */
	private boolean onButtons(HudModule m, double x, double y) {
		int[] c = closeBox(m), s = gearBox(m);
		return Ui.inside(x, y, c[0], c[1], c[2], c[2]) || settingsEntry(m) != null && Ui.inside(x, y, s[0], s[1], s[2], s[2]);
	}

	/**
	 * Keeps the hovered module while the mouse stays inside it (or on its × or gear), so moving over
	 * a part where another module lies on it does not switch to that one; outside it, the topmost
	 * module under the mouse.
	 */
	private void updateHover(double x, double y) {
		if (dragging != null) {
			hover = dragging;
			return;
		}
		if (hover != null && SlashHud.config.placement(hover.id()).enabled && (inside(hover, x, y) || onButtons(hover, x, y))) return;
		List<HudModule> under = stack(x, y);
		hover = under.isEmpty() ? null : under.get(0);
		if (hover == null) for (HudModule m : SlashHud.MODULES) {
			if (SlashHud.config.placement(m.id()).enabled && onButtons(m, x, y)) hover = m;
		}
	}

	private boolean altDown(MouseButtonEvent e) {
		//#if MC >= 1.21.9
		return e.hasAltDown() || minecraft.hasAltDown();
		//#else
		//$ return Screen.hasAltDown();
		//#endif
	}

	/** For the in-game test: the module the mouse is on, or null. */
	String hoveredId() {
		return hover == null ? null : hover.id();
	}

	/** x, y, width, height of a module on screen, with its scale. */
	/**
	 * Where the toolbar (and the hint under it) covers no module: just above the crosshair first
	 * (the middle is where the HUD usually leaves room), then under it, then the top and the
	 * bottom. While a module is dragged the bar is hidden anyway.
	 */
	private int toolbarY(int bx, int bw, int bh) {
		int[] candidates = { height / 2 - 14 - bh, height / 2 + 14, 12, height - 56 - bh };
		for (int y : candidates) {
			if (y < 4 || y + bh > height - 4) continue;
			boolean free = true;
			for (HudModule m : SlashHud.MODULES) {
				if (!SlashHud.config.placement(m.id()).enabled) continue;
				int[] b = box(m);
				if (b[0] - 4 < bx + bw && b[0] + b[2] + 4 > bx && b[1] - 4 < y + bh && b[1] + b[3] + 4 > y) {
					free = false;
					break;
				}
			}
			if (free) return y;
		}
		return candidates[0];
	}

	/** x, y and size of the × that hides a module: on its top-right corner, kept on the screen. */
	private int[] closeBox(HudModule m) {
		int[] b = box(m);
		int size = 11;
		int x = Math.max(0, Math.min(width - size, b[0] + b[2] - size + 5));
		int y = Math.max(0, Math.min(height - size, b[1] - 6));
		return new int[] { x, y, size };
	}

	/** The gear that opens a module's settings: left of its ×. */
	private int[] gearBox(HudModule m) {
		int[] c = closeBox(m);
		return new int[] { Math.max(0, c[0] - c[2] - 2), c[1], c[2] };
	}

	/** The module's card in the settings, when it has settings of its own. */
	private Catalog.Entry settingsEntry(HudModule m) {
		for (Catalog.Entry e : entries()) if (e.id().equals(m.id())) return e.settings().isEmpty() ? null : e;
		return null;
	}

	/** For the in-game test: the middle of a module's gear. */
	double[] gearCenter(String id) {
		HudModule m = SlashHud.MODULES.stream().filter(x -> x.id().equals(id)).findFirst().orElseThrow();
		int[] c = gearBox(m);
		return new double[] { c[0] + c[2] / 2.0, c[1] + c[2] / 2.0 };
	}

	/** A module's box on this screen, for the test. */
	public int[] boxOf(String id) {
		for (HudModule m : SlashHud.MODULES) if (m.id().equals(id)) return box(m);
		return null;
	}

	private int[] box(HudModule m) {
		HudConfig.Placement p = SlashHud.config.placement(m.id());
		int[] size = SlashHud.size(m, minecraft, p);
		int[] at = SlashHud.position(p, size[0], size[1], width, height);
		return new int[] { at[0], at[1], size[0], size[1] };
	}

	private static float anchor(double center, int screen) {
		return center < screen / 3.0 ? 0f : center > screen * 2 / 3.0 ? 1f : 0.5f;
	}

	/**
	 * Pulls the dragged module onto another module's line when it is close: the same left, right or
	 * centre (or top, bottom, middle), or right beside it with a small gap when they sit next to
	 * each other. The line it took is drawn while dragging.
	 */
	private int alignTo(int pos, int size, int cross, int crossSize, boolean horizontal) {
		int best = pos, bestD = SNAP + 1, line = Integer.MIN_VALUE;
		for (HudModule m : SlashHud.MODULES) {
			if (m == dragging || !SlashHud.config.placement(m.id()).enabled) continue;
			int[] o = box(m);
			int op = horizontal ? o[0] : o[1], os = horizontal ? o[2] : o[3];
			int cp = horizontal ? o[1] : o[0], cs = horizontal ? o[3] : o[2];
			// side by side only with a module level with this one
			boolean level = cross < cp + cs + 30 && cross + crossSize > cp - 30;
			int[][] candidates = {
				{ op, op }, { op + os - size, op + os }, { op + (os - size) / 2, op + os / 2 },
				level ? new int[] { op + os + GAP, op + os } : null, level ? new int[] { op - size - GAP, op } : null };
			for (int[] c : candidates) {
				if (c == null) continue;
				int d = Math.abs(c[0] - pos);
				if (d < bestD) {
					bestD = d;
					best = c[0];
					line = c[1];
				}
			}
		}
		if (line != Integer.MIN_VALUE) guides.add(new int[] { horizontal ? 0 : 1, line });
		return best;
	}

	/** Pulls a position onto the screen edge or the centre line when it is close. */
	private int snap(int pos, int size, int screen, boolean horizontal) {
		pos = Math.max(0, Math.min(screen - size, pos));
		boolean centre = false;
		if (pos < EDGE + SNAP) pos = EDGE;
		else if (pos > screen - size - EDGE - SNAP) pos = screen - size - EDGE;
		else if (Math.abs(pos - (screen - size) / 2) < SNAP) {
			pos = (screen - size) / 2;
			centre = true;
		}
		if (horizontal) snappedX = centre;
		else snappedY = centre;
		return pos;
	}

	/** For the screenshot test: switches every module on. */
	public static void enableAll() {
		SlashHud.MODULES.forEach(m -> SlashHud.config.placement(m.id()).enabled = true);
	}

	@Override
	public void onClose() {
		// a tab left without a name would be an empty button above the chat
		if (SlashHud.config.chatTabs.removeIf(t -> t.name.isBlank())) ChatTabs.changed();
		SlashHud.config.save();
		// on a server with its own layout, the changes are that layout's
		ServerLayouts.remember();
		ChatLook.saveOptions(minecraft);
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
		// in game the world stays visible and sharp behind the editor; opened from the main menu
		// there is no world, so the menu's panorama with the launcher's blue, as in our menus
		if (minecraft.level != null) return;
		extractPanorama(g, delta);
		g.fill(0, 0, width, height, 0x800A0D14);
		g.fillGradient(0, height / 2, width, height, 0x000A0D14, 0xB00A0D14);
	}
}
