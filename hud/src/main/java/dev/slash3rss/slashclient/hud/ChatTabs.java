package dev.slash3rss.slashclient.hud;

import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
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
	private static final Map<Integer, Integer> unread = new HashMap<>();
	private static final Map<String, Pattern> compiled = new HashMap<>();

	static void register() {
		ScreenEvents.AFTER_INIT.register((mc, screen, width, height) -> {
			if (!(screen instanceof ChatScreen)) return;
			int x = 2;
			int y = height - 27;
			List<Button> buttons = new ArrayList<>();
			for (int i = -1; i < SlashHud.config.chatTabs.size(); i++) {
				int index = i;
				Component label = label(i);
				int w = mc.font.width(label) + 10;
				Button b = Button.builder(label, btn -> select(index)).bounds(x, y, w, 12).build();
				buttons.add(b);
				x += w + 2;
			}
			Button edit = Button.builder(Component.literal("+"), btn -> mc.setScreenAndShow(new HudEditScreen("chatTabs"))).bounds(x, y, 14, 12).build();
			buttons.add(edit);
			Screens.getWidgets(screen).addAll(buttons);
			ScreenEvents.afterExtract(screen).register((s, g, mouseX, mouseY, delta) -> {
				// the open tab is underlined; the labels keep their counts fresh
				for (int i = 0; i < buttons.size() - 1; i++) {
					Button b = buttons.get(i);
					b.setMessage(label(i - 1));
					if (i - 1 == active) g.fill(b.getX() + 2, b.getY() + b.getHeight() - 2, b.getX() + b.getWidth() - 2, b.getY() + b.getHeight() - 1, 0xFF60A5FA);
				}
			});
		});
	}

	private static Component label(int index) {
		if (index < 0) return Component.translatable("slashclient-hud.chat.all");
		String name = SlashHud.config.chatTabs.get(index).name;
		int n = unread.getOrDefault(index, 0);
		return n > 0 ? Component.literal(name + " (" + (n > 99 ? "99+" : n) + ")") : Component.literal(name);
	}

	static void select(int index) {
		active = index;
		unread.remove(index);
		apply();
	}

	/** Sets the game's chat filter for the open tab. */
	static void apply() {
		var chat = Minecraft.getInstance().gui.hud.getChat();
		if (active < 0 || active >= SlashHud.config.chatTabs.size()) {
			active = -1;
			chat.setVisibleMessageFilter(m -> true);
			return;
		}
		HudConfig.ChatTab tab = SlashHud.config.chatTabs.get(active);
		chat.setVisibleMessageFilter(m -> matches(tab, m.content().getString()));
	}

	/** A new line in chat: tabs that catch it and are not open count it. */
	public static void onMessage(String text) {
		List<HudConfig.ChatTab> tabs = SlashHud.config.chatTabs;
		for (int i = 0; i < tabs.size(); i++) {
			if (i != active && matches(tabs.get(i), text)) unread.merge(i, 1, Integer::sum);
		}
	}

	public static boolean matches(HudConfig.ChatTab tab, String text) {
		String nick = Minecraft.getInstance().player == null ? "" : Minecraft.getInstance().player.getName().getString();
		for (String raw : tab.patterns) {
			if (raw == null || raw.isBlank()) continue;
			if (tab.regex) {
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
