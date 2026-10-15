package dev.slash3rss.slashclient.hud;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Editing chat tabs: a name, what to catch, and whether that is plain text (several,
 * separated by commas) or one regular expression. "{nick}" stands for your name.
 */
public class ChatTabsScreen extends Screen {
	private static final int MAX_TABS = 8;
	private final List<HudConfig.ChatTab> tabs;
	private String error = "";
	/** Tabs that do not fit in a small window. */
	private int hidden;
	/** Where "Done" goes back to; null = the chat. */
	private final Screen parent;

	public ChatTabsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.chat.tabs"));
		this.parent = parent;
		// edited on a copy, saved on "Done"
		tabs = new ArrayList<>();
		for (HudConfig.ChatTab t : SlashHud.config.chatTabs) {
			HudConfig.ChatTab copy = new HudConfig.ChatTab(t.name, t.regex);
			copy.patterns.addAll(t.patterns);
			tabs.add(copy);
		}
	}

	private static String joined(HudConfig.ChatTab t) {
		return t.regex ? (t.patterns.isEmpty() ? "" : t.patterns.get(0)) : String.join(", ", t.patterns);
	}

	private static void setPatterns(HudConfig.ChatTab t, String value) {
		t.patterns.clear();
		if (t.regex) t.patterns.add(value);
		else Arrays.stream(value.split(",")).map(String::trim).filter(s -> !s.isEmpty()).forEach(t.patterns::add);
	}

	@Override
	protected void init() {
		int rowW = Math.min(width - 20, 420);
		int left = (width - rowW) / 2;
		// rows start under the (possibly wrapped) help text and stop above "Done"
		int y = 24 + font.split(Component.translatable("slashclient-hud.chat.help"), width - 20).size() * 10 + 6;
		int fit = Math.max(1, (height - 44 - 26 - y) / 22);
		hidden = Math.max(0, tabs.size() - fit);
		for (HudConfig.ChatTab tab : tabs.subList(0, Math.min(tabs.size(), fit))) {
			EditBox name = new EditBox(font, left, y, 70, 18, Component.translatable("slashclient-hud.chat.name"));
			name.setMaxLength(16);
			name.setValue(tab.name);
			name.setResponder(v -> tab.name = v);
			addRenderableWidget(name);

			EditBox patterns = new EditBox(font, left + 74, y, rowW - 74 - 96, 18, Component.translatable("slashclient-hud.chat.patterns"));
			patterns.setMaxLength(256);
			patterns.setValue(joined(tab));
			patterns.setHint(Component.translatable(tab.regex ? "slashclient-hud.chat.hint.regex" : "slashclient-hud.chat.hint.text"));
			patterns.setResponder(v -> {
				setPatterns(tab, v);
				validate();
			});
			addRenderableWidget(patterns);

			addRenderableWidget(Button.builder(Component.translatable(tab.regex ? "slashclient-hud.chat.regex" : "slashclient-hud.chat.text"), b -> {
				String current = patterns.getValue();
				tab.regex = !tab.regex;
				setPatterns(tab, current);
				rebuildWidgets();
			}).bounds(left + rowW - 92, y, 64, 18).build());
			addRenderableWidget(Button.builder(Component.literal("✕"), b -> {
				tabs.remove(tab);
				rebuildWidgets();
			}).bounds(left + rowW - 24, y, 24, 18).build());
			y += 22;
		}
		if (tabs.size() < Math.min(MAX_TABS, fit)) {
			addRenderableWidget(Button.builder(Component.translatable("slashclient-hud.chat.add"), b -> {
				tabs.add(new HudConfig.ChatTab(Component.translatable("slashclient-hud.chat.new").getString(), false));
				rebuildWidgets();
			}).bounds(left, y + 4, 120, 20).build());
		}
		addRenderableWidget(Button.builder(Component.translatable("gui.done"), b -> onClose()).bounds(width / 2 - 50, height - 28, 100, 20).build());
		validate();
	}

	private void validate() {
		error = "";
		for (HudConfig.ChatTab t : tabs) {
			if (!t.regex) continue;
			for (String p : t.patterns) {
				String problem = ChatTabs.problem(p);
				if (problem != null) error = t.name + ": " + problem;
			}
		}
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta) {
		super.extractRenderState(g, mouseX, mouseY, delta);
		g.centeredText(font, title, width / 2, 12, 0xFFFFFFFF);
		int hy = 24;
		for (var line : font.split(Component.translatable("slashclient-hud.chat.help"), width - 20)) {
			g.centeredText(font, line, width / 2, hy, 0xFFAAAAAA);
			hy += 10;
		}
		if (!error.isEmpty()) g.centeredText(font, Component.literal(error), width / 2, height - 42, 0xFFFF5555);
		else if (hidden > 0) g.centeredText(font, Component.translatable("slashclient-hud.chat.more", hidden), width / 2, height - 42, 0xFFAAAAAA);
	}

	@Override
	public void onClose() {
		tabs.removeIf(t -> t.name.isBlank());
		SlashHud.config.chatTabs = tabs;
		SlashHud.config.save();
		ChatTabs.changed();
		minecraft.setScreenAndShow(parent != null ? parent : new ChatScreen("", false));
	}
}
