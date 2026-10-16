package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.client.multiplayer.chat.GuiMessage;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

import java.util.List;

/**
 * Chat helpers: repeated lines stack ("×3") instead of filling the chat, and a right click
 * on a line copies the whole message it belongs to.
 */
public final class ChatExtras {
	private ChatExtras() {}

	private static String lastText;
	private static Component lastShown;
	private static int repeats;

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	/**
	 * Called for every new chat line (`raw` is its text before any time stamp, `shown` what will
	 * be added). When it repeats the last line, that line goes and this one says how many times.
	 */
	public static Component stack(ChatComponent chat, String raw, Component shown) {
		if (cfg() == null || !cfg().chatStack) return shown;
		ChatComponentAccessor access = (ChatComponentAccessor) chat;
		List<Object> all = access.slashclient$allMessages();
		boolean same = raw.equals(lastText) && !all.isEmpty() && ((GuiMessage) all.get(0)).content() == lastShown;
		repeats = same ? repeats + 1 : 1;
		if (same) {
			all.remove(0);
			access.slashclient$refresh();
			shown = shown.copy().append(Component.literal(" ×" + repeats).withStyle(ChatFormatting.GRAY));
		}
		lastText = raw;
		lastShown = shown;
		return shown;
	}

	/** The whole message under the mouse in the open chat, or null. */
	public static String messageAt(double mouseX, double mouseY) {
		Minecraft mc = Minecraft.getInstance();
		ChatComponent chat = Compat.chat(mc);
		ChatComponentAccessor access = (ChatComponentAccessor) chat;
		double scale = mc.options.chatScale().get();
		int lineHeight = (int) (9.0 * (mc.options.chatLineSpacing().get() + 1.0));
		// the chat is drawn upwards from 40 pixels above the bottom, scaled
		double bottom = Math.floor((mc.getWindow().getGuiScaledHeight() - 40) / scale);
		double y = mouseY / scale, x = mouseX / scale;
		if (x < 0 || x > ChatComponent.getWidth(mc.options.chatWidth().get()) + 8 || y > bottom) return null;
		int row = (int) Math.floor((bottom - y) / lineHeight);
		if (row < 0 || row >= chat.getLinesPerPage()) return null;
		List<Object> lines = access.slashclient$lines();
		int index = row + access.slashclient$scroll();
		if (index >= lines.size()) return null;
		// a message is its lines from the one marked as its end (the lowest) up to the next end
		int first = index;
		while (first > 0 && !((GuiMessage.Line) lines.get(first)).endOfEntry()) first--;
		StringBuilder text = new StringBuilder();
		for (int i = first; i < lines.size(); i++) {
			if (i > first && ((GuiMessage.Line) lines.get(i)).endOfEntry()) break;
			text.insert(0, plain(((GuiMessage.Line) lines.get(i)).content()));
		}
		return clean(text.toString());
	}

	private static String plain(FormattedCharSequence seq) {
		StringBuilder sb = new StringBuilder();
		seq.accept((i, style, cp) -> {
			sb.appendCodePoint(cp);
			return true;
		});
		return sb.toString();
	}

	/** Without our time stamp in front and the repeat count at the end. */
	static String clean(String s) {
		return s.replaceFirst("^\\[\\d{1,2}:\\d{2}] ", "").replaceFirst(" ×\\d+$", "").strip();
	}
}
