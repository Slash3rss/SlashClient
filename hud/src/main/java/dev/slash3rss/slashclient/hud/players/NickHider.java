package dev.slash3rss.slashclient.hud.players;

import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;

import java.util.Optional;

/**
 * Nick hider: your nick written as "You" (or another word) in chat, on the tab list and above your
 * head, for recordings and streams. Only what is shown changes; colours and links stay.
 */
public final class NickHider {
	private NickHider() {}

	public static Component apply(Component text) {
		if (text == null || SlashHud.config == null || !SlashHud.config.nickHider) return text;
		String name = Minecraft.getInstance().getUser().getName();
		if (name == null || name.length() < 3 || !text.getString().contains(name)) return text;
		String alias = Component.translatable("slashclient-hud.nickHider.alias." + SlashHud.config.nickAlias).getString();
		MutableComponent out = Component.empty();
		text.visit((FormattedText.StyledContentConsumer<Object>) (style, part) -> {
			out.append(Component.literal(part.replace(name, alias)).withStyle(style));
			return Optional.empty();
		}, Style.EMPTY);
		return out;
	}
}
