package dev.slash3rss.slashclient.hud;

import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Chat tabs: "All" plus the player's own tabs, each catching lines by text or regex.
 * The game's chat already has a filter for visible lines; switching tabs sets it.
 * Tabs that are not open count the lines they caught since they were last looked at.
 */
public final class ChatTabs {
	private ChatTabs() {}

	/** -1 = "All". */
	private static int active = -1;
	/** What the search box over the open chat looks for ("" = nothing). */
	private static String search = "";
	private static final Map<Integer, Integer> unread = new HashMap<>();
	/** Lines that named the player since the chat was last open. */
	private static int mentions;
	private static long lastChime;
	private static final Map<String, Pattern> compiled = new HashMap<>();

	static void register() {
		ScreenEvents.AFTER_INIT.register((mc, screen, width, height) -> {
			if (!(screen instanceof ChatScreen)) return;
			chatOpened();
			int x = 2;
			int y = height - 29;
			int h = 13;
			List<Button> buttons = new ArrayList<>();
			if (active >= 0 && active < SlashHud.config.chatTabs.size() && SlashHud.config.chatTabs.get(active).window != null) select(-1);
			for (int i = -1; i < SlashHud.config.chatTabs.size(); i++) {
				int index = i;
				if (i >= 0 && SlashHud.config.chatTabs.get(i).window != null) continue;
				// room for the label and a two-digit count, so the row does not move as lines come in
				int w = ChatTabButton.widthFor(label(i), Math.max(10, unread.getOrDefault(i, 0)));
				buttons.add(new ChatTabButton(x, y, w, h, () -> label(index), () -> unread.getOrDefault(index, 0), () -> active == index, null, btn -> select(index)).mention(mentionTab(index)).detachable(index, y));
				x += w + 3;
			}
			ChatTabButton edit = new ChatTabButton(x, y, 17, h, () -> Component.translatable("slashclient-hud.chat.tabs"), () -> 0, () -> false, "sliders",
				btn -> mc.setScreenAndShow(new HudEditScreen("chatTabs")));
			edit.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.translatable("slashclient-hud.chat.tabs")));
			buttons.add(edit);
			Screens.getWidgets(screen).addAll(buttons);
			// pulled-out tabs: drag them by their title, dock them back with the ×
			ChatWindows.addHandles(screen, width, height, () -> mc.execute(() -> Compat.relayout(screen)));
			// a tab being dragged out shows where its window will go
			ScreenEvents.afterExtract(screen).register((s, g, mouseX, mouseY, delta) -> drawDrag(g, mouseX, mouseY));
			// a search box on the right of the same row; it filters the chat until it is closed
			if (SlashHud.config.chatSearch) {
				int bw = 130, bx = width - bw - 2;
				// borderless text on our own rounded field, like the HUD window's search
				// clicked to search; the arrow keys and Tab never move into it (they belong to the chat's input)
				EditBox box = new EditBox(mc.font, bx + 16, y + 3, bw - 20, 9, Component.translatable("slashclient-hud.chat.search")) {
					@Override
					public net.minecraft.client.gui.ComponentPath nextFocusPath(net.minecraft.client.gui.navigation.FocusNavigationEvent event) {
						return null;
					}
				};
				box.setBordered(false);
				box.setTextColor(dev.slash3rss.slashclient.hud.ui.Ui.TEXT);
				box.setHint(Component.translatable("slashclient-hud.chat.search"));
				box.setMaxLength(64);
				box.setResponder(ChatTabs::searchFor);
				Screens.getWidgets(screen).add(box);
				ScreenEvents.beforeExtract(screen).register((s, g, mouseX, mouseY, delta) -> {
					dev.slash3rss.slashclient.hud.ui.Ui.round(g, bx, y, bw, h, 5, 0xD0111622);
					dev.slash3rss.slashclient.hud.ui.Ui.roundOutline(g, bx, y, bw, h, 5, box.isFocused() ? 0x993B82F6 : dev.slash3rss.slashclient.hud.ui.Ui.BORDER);
					dev.slash3rss.slashclient.hud.ui.Ui.icon(g, "search", bx + 5, y + 3, 7, dev.slash3rss.slashclient.hud.ui.Ui.MUTED);
				});
				ScreenEvents.remove(screen).register(s -> {
					if (search.isEmpty()) return;
					search = "";
					apply();
				});
			}
		});
	}

	private static Component label(int index) {
		if (index < 0) return Component.translatable("slashclient-hud.chat.all");
		if (index >= SlashHud.config.chatTabs.size()) return Component.empty();
		return Component.literal(SlashHud.config.chatTabs.get(index).name);
	}

	static void select(int index) {
		active = index;
		unread.remove(index);
		apply();
	}

	/** The search box's text (also for the in-game test). */
	public static void searchFor(String text) {
		search = text.strip().toLowerCase(Locale.ROOT);
		apply();
	}

	// ---------- pulling a tab out ----------

	/** The tab being dragged out of the row (-1 = none). */
	static int dragging = -1;

	/** While dragging: the window's outline where it would land, once it is above the row. */
	private static void drawDrag(net.minecraft.client.gui.GuiGraphicsExtractor g, int mx, int my) {
		if (dragging < 0 || dragging >= SlashHud.config.chatTabs.size()) return;
		int w = ChatWindows.width(1f), h = ChatWindows.height(1f);
		int x = Math.max(0, Math.min(g.guiWidth() - w, mx - w / 2)), y = Math.max(0, Math.min(g.guiHeight() - h, my - 6));
		dev.slash3rss.slashclient.hud.ui.Ui.round(g, x, y, w, h, 6, 0x603B82F6);
		dev.slash3rss.slashclient.hud.ui.Ui.roundOutline(g, x, y, w, h, 6, 0xC060A5FA);
		Component hint = dev.slash3rss.slashclient.hud.ui.Ui.tr("slashclient-hud.chat.window.drop", SlashHud.config.chatTabs.get(dragging).name);
		dev.slash3rss.slashclient.hud.ui.Ui.centered(g, dev.slash3rss.slashclient.hud.ui.Ui.fit(hint, w - 12), x + w / 2, y + h / 2 - 4, 0xFFFFFFFF);
	}

	/** A tab let go above the row: its own window there, and the chat shown without its lines. */
	static void detach(int index, int mx, int my) {
		dragging = -1;
		if (index < 0 || index >= SlashHud.config.chatTabs.size()) return;
		Minecraft mc = Minecraft.getInstance();
		var screen = Compat.screen(mc);
		if (screen == null) return;
		HudConfig.ChatTab tab = SlashHud.config.chatTabs.get(index);
		tab.window = HudConfig.Placement.at(0, 0);
		int w = ChatWindows.width(1f), h = ChatWindows.height(1f);
		ChatWindows.moveTo(tab, mx - w / 2, my - 6, screen.width, screen.height);
		unread.remove(index);
		if (active == index) active = -1;
		SlashHud.config.save();
		apply();
		mc.execute(() -> Compat.relayout(screen));
	}

	/** Sets the game's chat filter for the open tab. */
	static void apply() {
		var chat = Compat.chat(Minecraft.getInstance());
		if (active >= SlashHud.config.chatTabs.size()) active = -1;
		HudConfig.ChatTab tab = active < 0 ? null : SlashHud.config.chatTabs.get(active);
		String query = search;
		// "All" leaves out what pulled-out tabs show in their own windows
		List<HudConfig.ChatTab> out = SlashHud.config.chatTabs.stream().filter(t -> t.window != null).toList();
		Compat.setChatFilter(chat, m -> {
			String text = m.content().getString();
			boolean inTab = tab == null ? out.stream().noneMatch(t -> matches(t, text)) : matches(tab, text);
			return inTab && (query.isEmpty() || text.toLowerCase(Locale.ROOT).contains(query));
		});
	}

	/** A new line in chat: tabs that catch it and are not open count it; a line with our nick chimes. */
	public static void onMessage(String text) {
		Minecraft mc = Minecraft.getInstance();
		if (SlashHud.config.chatMentions && mc.player != null && mentions(text, mc.player.getName().getString())) {
			if (!(Compat.screen(mc) instanceof ChatScreen)) mentions++;
			long now = System.currentTimeMillis();
			// several lines at once ring once
			if (now - lastChime > 700) {
				lastChime = now;
				mc.getSoundManager().play(net.minecraft.client.resources.sounds.SimpleSoundInstance.forUI(net.minecraft.sounds.SoundEvents.NOTE_BLOCK_BELL.value(), 1.4f, 0.7f));
			}
		}
		List<HudConfig.ChatTab> tabs = SlashHud.config.chatTabs;
		for (int i = 0; i < tabs.size(); i++) {
			if (i != active && tabs.get(i).window == null && matches(tabs.get(i), text)) unread.merge(i, 1, Integer::sum);
		}
	}

	/**
	 * Whether a line belongs in the tab: it matches one of the patterns (or there are none, but there
	 * are exclusions: "everything except"), and none of the exclusions.
	 */
	/**
	 * Whether a line names the player: the nick as a word, not counting the line's own sender
	 * ("<Nick> …", "[VIP] Nick: …", "Nick » …"), so your own messages do not ring.
	 */
	public static boolean mentions(String text, String nick) {
		if (nick == null || nick.isEmpty() || text == null) return false;
		String q = Pattern.quote(nick);
		String rest = Pattern.compile("^(?:\\[[^\\]]{0,24}\\]\\s*)*<?" + q + ">?\\s*[:»>\\-]", Pattern.CASE_INSENSITIVE).matcher(text).replaceFirst("");
		return Pattern.compile("(?<![A-Za-z0-9_])" + q + "(?![A-Za-z0-9_])", Pattern.CASE_INSENSITIVE).matcher(rest).find();
	}

	/** The open chat shows them in the "@" tab: the badge over the closed chat starts again. */
	static void chatOpened() {
		mentions = 0;
	}

	/** Over the closed chat, where the tabs sit when it is open: a red "@ 2" while someone named you. */
	public static void drawMentionBadge(net.minecraft.client.gui.GuiGraphicsExtractor g, Minecraft mc) {
		if (mentions <= 0 || !SlashHud.config.chatMentions || Compat.screen(mc) instanceof ChatScreen) return;
		Component text = dev.slash3rss.slashclient.hud.ui.Ui.bold("@ " + (mentions > 99 ? "99+" : mentions));
		int w = dev.slash3rss.slashclient.hud.ui.Ui.width(text) + 12, h = 13, x = 2, y = g.guiHeight() - 29;
		// a slow pulse so it is seen without being in the way
		float pulse = 0.5f + 0.5f * (float) Math.sin(System.currentTimeMillis() / 300.0);
		dev.slash3rss.slashclient.hud.ui.Ui.round(g, x - 1, y - 1, w + 2, h + 2, 6, dev.slash3rss.slashclient.hud.ui.Ui.blend(0x30EF4444, 0x80EF4444, pulse));
		dev.slash3rss.slashclient.hud.ui.Ui.round(g, x, y, w, h, 5, 0xFFDC2626);
		g.fillGradient(x + 2, y + 1, x + w - 2, y + h - 1, 0xFFF87171, 0xFFDC2626);
		dev.slash3rss.slashclient.hud.ui.Ui.draw(g, text, x + 6, y + 3, 0xFFFFFFFF);
	}

	/** Tabs that catch the player's nick count in red, like a mention. */
	static boolean mentionTab(int index) {
		if (index < 0 || index >= SlashHud.config.chatTabs.size()) return false;
		return SlashHud.config.chatTabs.get(index).patterns.stream().anyMatch(p -> p != null && p.contains("{nick}"));
	}

	public static boolean matches(HudConfig.ChatTab tab, String text) {
		List<String> excludes = tab.excludes();
		boolean any = tab.patterns.stream().anyMatch(p -> p != null && !p.isBlank());
		boolean caught = any ? anyMatches(tab.regex, tab.patterns, text) : excludes.stream().anyMatch(p -> p != null && !p.isBlank());
		return caught && !anyMatches(tab.regex, excludes, text);
	}

	private static boolean anyMatches(boolean regex, List<String> patterns, String text) {
		String nick = Minecraft.getInstance().player == null ? "" : Minecraft.getInstance().player.getName().getString();
		for (String raw : patterns) {
			if (raw == null || raw.isBlank()) continue;
			if (regex) {
				Pattern p = pattern(raw.replace("{nick}", Pattern.quote(nick)));
				if (p != null && p.matcher(text).find()) return true;
			} else {
				String needle = raw.replace("{nick}", nick).toLowerCase(Locale.ROOT);
				if (!needle.isEmpty() && text.toLowerCase(Locale.ROOT).contains(needle)) return true;
			}
		}
		return false;
	}

	/** Compiled once per pattern; a broken pattern simply catches nothing. */
	private static Pattern pattern(String regex) {
		return compiled.computeIfAbsent(regex, r -> {
			try {
				return Pattern.compile(r);
			} catch (PatternSyntaxException e) {
				return null;
			}
		});
	}

	/** Checks a pattern for the editor; null when it is fine, else the problem. */
	static String problem(String regex) {
		try {
			Pattern.compile(regex);
			return null;
		} catch (PatternSyntaxException e) {
			return e.getDescription();
		}
	}

	/** After tabs were edited: counts belong to positions, so they start over. */
	static void changed() {
		unread.clear();
		compiled.clear();
		apply();
	}
}
