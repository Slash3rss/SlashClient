package dev.slash3rss.slashclient.hud.chat;

import dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.multiplayer.chat.GuiMessage;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.util.Mth;

import java.util.ArrayList;
import java.util.List;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.gamehud.GameParts;
import dev.slash3rss.slashclient.hud.ui.HudEditScreen;

/**
 * The chat's look from the HUD editor: how opaque its background is and how big it is. Both are
 * the game's own options (Chat Settings: text background opacity and chat scale), so the game's
 * menu and the editor always agree. The game's scale ends at 1; above it the rest is
 * HudConfig.chatScaleExtra, put on the chat's own scale (ChatScaleMixin), so its lines, their
 * wrapping and the clicks on them all follow it. The chat is not moved: its box in the editor is
 * where the game draws it.
 */
public final class ChatLook {
	private ChatLook() {}

	public static final float MIN = 0.5f, MAX = 1.5f;
	/** The game's options changed from the editor: written once the editor is closed. */
	private static boolean optionsDirty;

	/** How much bigger than the game's own scale the chat is drawn (1 to 1.5). */
	public static double extra() {
		HudConfig c = SlashHud.config;
		return c == null ? 1 : Math.max(1f, Math.min(MAX, c.chatScaleExtra));
	}

	/** The chat's scale as it is drawn (the chat's own getScale, with ChatScaleMixin). */
	public static double scale(Minecraft mc) {
		return mc.options.chatScale().get() * extra();
	}

	/** The scale the editor's slider shows. */
	public static float shownScale() {
		return (float) scale(Minecraft.getInstance());
	}

	public static void setScale(float v) {
		Minecraft mc = Minecraft.getInstance();
		v = Math.max(MIN, Math.min(MAX, v));
		SlashHud.config.chatScaleExtra = Math.max(1f, v);
		mc.options.chatScale().set((double) Math.min(1f, v));
		optionsDirty = true;
		rescale(mc);
	}

	/** The background's opacity, 0 to 100. */
	public static float opacity() {
		return (float) (Minecraft.getInstance().options.textBackgroundOpacity().get() * 100);
	}

	public static void setOpacity(float v) {
		Minecraft.getInstance().options.textBackgroundOpacity().set(Math.max(0, Math.min(100, v)) / 100.0);
		optionsDirty = true;
	}

	/** The game's chat scale and background put back as they were (the editor's undo). */
	public static void restore(Minecraft mc, double scale, double background) {
		if (mc.options.chatScale().get() == scale && mc.options.textBackgroundOpacity().get() == background) return;
		mc.options.chatScale().set(scale);
		mc.options.textBackgroundOpacity().set(background);
		optionsDirty = true;
		rescale(mc);
	}

	/** The chat's lines broken again for its width at the new scale. */
	public static void rescale(Minecraft mc) {
		if (mc.gui != null) Compat.chat(mc).rescaleChat();
	}

	/** The game's options written to disk, when the editor changed them. */
	public static void saveOptions(Minecraft mc) {
		if (!optionsDirty) return;
		optionsDirty = false;
		mc.options.save();
	}

	private static int lineHeight(Minecraft mc) {
		return (int) (9.0 * (mc.options.chatLineSpacing().get() + 1.0));
	}

	/**
	 * Where the game draws the closed chat when it is full (left, top, right, bottom) on a screen of
	 * that size, as ChatComponent lays it out: scaled, moved 4 pixels right, its lines upwards from
	 * 40 pixels above the bottom, each line's background from 4 left of the text to 8 past its width.
	 */
	public static int[] box(Minecraft mc, int sw, int sh) {
		float s = (float) scale(mc);
		int k = Mth.ceil(ChatComponent.getWidth(mc.options.chatWidth().get()) / s);
		int bottom = Mth.floor((sh - 40) / s);
		int lh = lineHeight(mc);
		int lines = Math.max(1, ChatComponent.getHeight(mc.options.chatHeightUnfocused().get()) / lh);
		return new int[] { 0, Math.round((bottom - lines * lh) * s), Math.round((k + 12) * s), Math.round(bottom * s) };
	}

	/**
	 * The chat in the editor as it looks in the game when full: the newest lines (made-up ones when
	 * there are none), each on its background, at the scale and opacity set. The pose is at the
	 * box's corner; the game's own chat is hidden while the editor is open, so it is not drawn twice.
	 */
	public static void preview(GuiGraphicsExtractor g, Minecraft mc, int boxX, int boxY) {
		int sw = g.guiWidth(), sh = g.guiHeight();
		float s = (float) scale(mc);
		int k = Mth.ceil(ChatComponent.getWidth(mc.options.chatWidth().get()) / s);
		int bottom = Mth.floor((sh - 40) / s);
		int lh = lineHeight(mc);
		int lines = Math.max(1, ChatComponent.getHeight(mc.options.chatHeightUnfocused().get()) / lh);
		List<FormattedCharSequence> shown = new ArrayList<>();
		for (Object o : ((ChatComponentAccessor) Compat.chat(mc)).slashclient$lines()) {
			if (shown.size() >= lines) break;
			shown.add(((GuiMessage.Line) o).content());
		}
		if (shown.isEmpty()) {
			for (int i = 3; i >= 1; i--) shown.add(Component.literal("<" + Ui.tr("slashclient-hud.part.sample.player").getString() + "> "
				+ Ui.tr("slashclient-hud.part.sample.chat", i).getString()).getVisualOrderText());
		}
		int background = Math.round(255 * mc.options.textBackgroundOpacity().get().floatValue()) << 24;
		int text = (Math.round(255 * (mc.options.chatOpacity().get().floatValue() * 0.9f + 0.1f)) << 24) | 0xFFFFFF;
		var pose = g.pose();
		pose.pushMatrix();
		// from the box's corner back to the screen's, then the chat's own scale and move
		pose.translate(-boxX, -boxY);
		pose.scale(s, s);
		pose.translate(4, 0);
		for (int i = 0; i < shown.size(); i++) {
			int lineBottom = bottom - i * lh;
			g.fill(-4, lineBottom - lh, k + 8, lineBottom, background);
			g.text(mc.font, shown.get(i), 0, lineBottom - 8, text, true);
		}
		pose.popMatrix();
	}

	public static void register() {
		// the editor shows the chat in its box; out of it, a chat hidden with its × shows only while open
		HudElementRegistry.replaceElement(VanillaHudElements.CHAT, vanilla -> (HudElement) (g, delta) -> {
			Minecraft mc = Minecraft.getInstance();
			var screen = Compat.screen(mc);
			if (screen instanceof HudEditScreen) return;
			if (SlashHud.config != null && !GameParts.CHAT.on() && !(screen instanceof ChatScreen)) return;
			vanilla.extractRenderState(g, delta);
		});
	}
}
