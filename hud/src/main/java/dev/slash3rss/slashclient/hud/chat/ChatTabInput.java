package dev.slash3rss.slashclient.hud.chat;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.fabric.api.client.message.v1.ClientSendMessageEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Typing from a chat tab. A tab can have a reply prefix ("/msg Steve ", "/g ", "@") put in front
 * of what the player writes: in the line of its pulled-out window (when the tab has one), and in the
 * chat's own line while that tab is the open one. A line the player starts with "/" is his own
 * command and goes as it is. The game's limit of 256 characters counts the prefix too.
 */
public final class ChatTabInput {
	private ChatTabInput() {}

	static final int MAX = 256;
	/** The height of a window's typing line (before the window's scale). */
	static final int ROW = 13;

	/** For the in-game test: what would have gone to the server ("chat:…", "command:/…") instead of it; null = it goes. */
	public static List<String> captured;
	/** Our own send in progress: the chat's prefix is not put in front again. */
	private static boolean sending;

	/** What a line typed in a tab sends; null when nothing is left to send. */
	public static String line(String prefix, String typed) {
		String text = typed == null ? "" : typed.strip();
		if (text.isEmpty()) return null;
		if (prefix == null) prefix = "";
		// a command prefix written without its space ("/g") still leaves one before the message
		if (prefix.startsWith("/") && !prefix.endsWith(" ")) prefix += " ";
		String out = text.startsWith("/") ? text : prefix + text;
		return out.length() > MAX ? out.substring(0, MAX) : out;
	}

	static void register() {
		// the chat's own line, while a tab with a prefix is open: the message goes with the prefix
		ClientSendMessageEvents.ALLOW_CHAT.register(message -> {
			Minecraft mc = Minecraft.getInstance();
			HudConfig.ChatTab tab = ChatTabs.activeTab();
			if (!sending && tab != null && !tab.prefix().isEmpty() && Compat.screen(mc) instanceof ChatScreen) {
				String out = line(tab.prefix(), message);
				if (out != null) send(out);
				return false;
			}
			if (captured != null) {
				captured.add("chat:" + message);
				return false;
			}
			return true;
		});
		ClientSendMessageEvents.ALLOW_COMMAND.register(command -> {
			if (captured == null) return true;
			captured.add("command:/" + command);
			return false;
		});
	}

	/** Sends a finished line: a command when it starts with "/", else a chat message. */
	static void send(String line) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || line == null) return;
		sending = true;
		try {
			if (line.startsWith("/")) mc.player.connection.sendCommand(line.substring(1));
			else mc.player.connection.sendChat(line);
		} finally {
			sending = false;
		}
	}

	/** The prefix of the open tab ("" for "All" or a tab without one). */
	static String mainPrefix() {
		HudConfig.ChatTab tab = ChatTabs.activeTab();
		return tab == null ? "" : tab.prefix();
	}

	/** The chat's own line. */
	public static EditBox mainInput(Screen screen) {
		return screen instanceof ChatScreen chat ? ((dev.slash3rss.slashclient.hud.mixin.ChatScreenAccessor) chat).slashclient$input() : null;
	}

	/** The width the prefix label takes in front of a line (0 = no prefix). */
	private static int labelWidth(String prefix, int room) {
		if (prefix.isEmpty()) return 0;
		return Math.min(room / 3, Ui.width(Ui.text(prefix.strip())) + 5);
	}

	/**
	 * The chat's own line moves over for the open tab's prefix, which is written dim in front of it,
	 * so the player sees what goes before his message. Called when the chat opens and on a tab switch.
	 */
	static void fitMain(Screen screen) {
		EditBox in = mainInput(screen);
		if (in == null) return;
		int pw = labelWidth(mainPrefix(), screen.width);
		in.setX(4 + pw);
		in.setWidth(screen.width - 4 - pw);
	}

	/** The dim prefix in front of the chat's line (drawn after the chat, over its dark bar). */
	static void drawMainLabel(GuiGraphicsExtractor g, Screen screen) {
		String prefix = mainPrefix();
		EditBox in = mainInput(screen);
		if (prefix.isEmpty() || in == null) return;
		// a command the player writes himself goes without the prefix: it fades further
		int color = in.getValue().startsWith("/") ? 0x50FFFFFF : 0xFF7C8699;
		Ui.draw(g, Ui.fit(Ui.text(prefix.strip()), labelWidth(prefix, screen.width) - 3), 4, in.getY(), color);
	}

	// ---------- the typing line of a pulled-out window ----------

	/** A window's line: the chat's look without a border, with its own way through the sent messages. */
	public static final class Field extends EditBox {
		public final HudConfig.ChatTab tab;
		/** Where Up/Down are in the sent messages (-1 = the line being written), and that line meanwhile. */
		private int historyPos = -1;
		private String buffer = "";

		Field(HudConfig.ChatTab tab) {
			super(Minecraft.getInstance().font, 0, 0, 100, 9, Component.translatable("slashclient-hud.chat.input.hint", tab.name));
			this.tab = tab;
			setBordered(false);
			setTextColor(Ui.TEXT);
			setMaxLength(Math.max(1, MAX - tab.prefix().length()));
			setHint(Component.translatable("slashclient-hud.chat.input.hint", tab.name));
		}

		/** Only a click puts the cursor here: the arrow keys and Tab stay with the chat's line. */
		@Override
		public net.minecraft.client.gui.ComponentPath nextFocusPath(net.minecraft.client.gui.navigation.FocusNavigationEvent event) {
			return null;
		}

		/** Up (-1) or down (+1) through what was sent, like the chat's line. */
		void history(int dir) {
			List<String> sent = new ArrayList<>(Compat.chat(Minecraft.getInstance()).getRecentChat());
			if (sent.isEmpty()) return;
			int pos = historyPos < 0 ? sent.size() : historyPos;
			int next = Math.max(0, Math.min(sent.size(), pos + dir));
			if (next == pos) return;
			if (historyPos < 0) buffer = getValue();
			historyPos = next == sent.size() ? -1 : next;
			setValue(historyPos < 0 ? buffer : sent.get(next));
		}
	}

	/** Where a window's line goes on the screen: inside the window's bottom row, after the prefix label. */
	private static void place(Field f, int sw, int sh) {
		int[] p = ChatWindows.at(f.tab, sw, sh);
		float s = f.tab.window.scale();
		int cols = ChatWindows.cols(f.tab), pw = labelWidth(f.tab.prefix(), cols);
		int top = p[1] + Math.round((ChatWindows.height(f.tab) / s - ROW) * s);
		f.setX(p[0] + Math.round((5 + pw) * s));
		f.setY(top + Math.round(2 * s));
		// the corner grip stays free
		f.setWidth(Math.max(10, Math.round((cols - 10 - pw - ChatWindows.GRIP) * s)));
	}

	/** Inside the window (unscaled coordinates): the line's backing and the prefix label, in the bottom row. */
	static void drawRow(GuiGraphicsExtractor g, HudConfig.ChatTab tab, int w, int h, boolean focused) {
		int y = h - ROW - 1;
		Ui.round(g, 3, y, w - 6, ROW - 1, 4, 0xD0111622);
		Ui.roundOutline(g, 3, y, w - 6, ROW - 1, 4, focused ? Ui.withAlpha(Ui.ACCENT, 0x99) : Ui.BORDER);
		String prefix = tab.prefix();
		if (!prefix.isEmpty()) Ui.draw(g, Ui.fit(Ui.text(prefix.strip()), labelWidth(prefix, w) - 3), 6, y + 2, 0xFF7C8699);
	}

	/** Whether the tab's window line has the cursor (for the window's blue edge). */
	static boolean focused(HudConfig.ChatTab tab) {
		Screen screen = Compat.screen(Minecraft.getInstance());
		return screen != null && screen.getFocused() instanceof Field f && f.tab == tab;
	}

	/** The open chat: a typing line in each pulled-out window whose tab has one, and the keys for it. */
	static void addFields(Screen screen, int sw, int sh) {
		List<Field> fields = new ArrayList<>();
		if (!Compat.hudHidden(Minecraft.getInstance())) for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (tab.window == null || !ChatWindows.typing(tab)) continue;
			Field f = new Field(tab);
			place(f, sw, sh);
			fields.add(f);
			Screens.getWidgets(screen).add(f);
		}
		fitMain(screen);
		ScreenEvents.afterExtract(screen).register((s, g, mx, my, delta) -> drawMainLabel(g, s));
		if (fields.isEmpty()) return;
		// windows move and change size while the chat is open: the lines follow before each frame
		ScreenEvents.beforeExtract(screen).register((s, g, mx, my, delta) -> {
			for (Field f : fields) if (f.tab.window != null) place(f, s.width, s.height);
		});
		// a click anywhere else gives the keys back to the chat's line
		//#if MC >= 1.21.9
		ScreenMouseEvents.allowMouseClick(screen).register((s, e) -> {
			if (s.getFocused() instanceof Field f && !f.isMouseOver(e.x(), e.y()) && fields.stream().noneMatch(o -> o.isMouseOver(e.x(), e.y()))) back(s);
			return true;
		});
		ScreenKeyboardEvents.allowKeyPress(screen).register((s, e) -> !(s.getFocused() instanceof Field f) || key(s, f, e.key(), () -> f.keyPressed(e)));
		//#else
		//$ ScreenMouseEvents.allowMouseClick(screen).register((s, x, y, button) -> {
		//$ 	if (s.getFocused() instanceof Field f && !f.isMouseOver(x, y) && fields.stream().noneMatch(o -> o.isMouseOver(x, y))) back(s);
		//$ 	return true;
		//$ });
		//$ ScreenKeyboardEvents.allowKeyPress(screen).register((s, key, scancode, mods) -> !(s.getFocused() instanceof Field f) || key(s, f, key, () -> f.keyPressed(key, scancode, mods)));
		//#endif
	}

	/**
	 * A key while a window's line has the cursor; false keeps it from the chat screen. Enter sends and
	 * closes the chat like the game's line, Esc goes back to the chat's line, Up/Down go through the
	 * sent messages, and the rest is typing.
	 */
	private static boolean key(Screen screen, Field f, int key, Runnable type) {
		switch (key) {
			case InputConstants.KEY_ESCAPE -> back(screen);
			case InputConstants.KEY_RETURN, InputConstants.KEY_NUMPADENTER -> {
				String typed = f.getValue();
				String out = line(f.tab.prefix(), typed);
				if (out != null) {
					// what the player wrote goes to the history, without the prefix (Up brings it back here as written)
					Compat.chat(Minecraft.getInstance()).addRecentChat(typed.strip());
					send(out);
				}
				f.setValue("");
				Minecraft.getInstance().setScreenAndShow(null);
			}
			case InputConstants.KEY_UP -> f.history(-1);
			case InputConstants.KEY_DOWN -> f.history(1);
			default -> type.run();
		}
		return false;
	}

	/** The cursor back in the chat's own line. */
	private static void back(Screen screen) {
		EditBox in = mainInput(screen);
		if (in != null) screen.setFocused(in);
		else screen.setFocused(null);
	}

	/** For the test: the middle of a window's typing line, or null when it has none. */
	public static double[] fieldCenter(String name) {
		Screen screen = Compat.screen(Minecraft.getInstance());
		if (screen == null) return null;
		for (var child : screen.children()) {
			if (child instanceof Field f && f.tab.name.equals(name)) return new double[] { f.getX() + f.getWidth() / 2.0, f.getY() + f.getHeight() / 2.0 };
		}
		return null;
	}

	/** For the test: which line has the cursor ("window:<tab>", "chat" or "none"). */
	public static String focus() {
		Screen screen = Compat.screen(Minecraft.getInstance());
		if (screen == null) return "none";
		if (screen.getFocused() instanceof Field f) return "window:" + f.tab.name;
		return screen.getFocused() != null && screen.getFocused() == mainInput(screen) ? "chat" : "none";
	}

	/** For the test: the text in a window's line. */
	public static String fieldValue(String name) {
		Screen screen = Compat.screen(Minecraft.getInstance());
		if (screen == null) return null;
		for (var child : screen.children()) if (child instanceof Field f && f.tab.name.equals(name)) return f.getValue();
		return null;
	}
}
