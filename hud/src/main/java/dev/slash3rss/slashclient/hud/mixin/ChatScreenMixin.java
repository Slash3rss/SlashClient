package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ChatExtras;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#if MC >= 1.21.11
import net.minecraft.client.gui.ActiveTextCollector;
//#endif
//#if MC >= 26.1
import net.minecraft.client.gui.components.ChatComponent;
import org.spongepowered.asm.mixin.Shadow;
//#endif

/**
 * A right click on a chat line copies the message, unless it lands on something clickable
 * (a link, a command, e.g. a server's [Kliknij]): that click stays the game's.
 */
@Mixin(ChatScreen.class)
abstract class ChatScreenMixin {
	//#if MC >= 26.1
	@Shadow
	private ChatComponent.DisplayMode displayMode;
	//#endif

	@Inject(method = "mouseClicked", at = @At("HEAD"), cancellable = true)
	//#if MC >= 1.21.9
	private void slashclient$copyLine(MouseButtonEvent e, boolean doubleClick, CallbackInfoReturnable<Boolean> cir) {
	//#else
	//$ private void slashclient$copyLine(double mouseX, double mouseY, int button, CallbackInfoReturnable<Boolean> cir) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		// coordinates marked in a line (ChatCoords), or in a chat window: saved as a waypoint
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT && SlashHud.config != null && SlashHud.config.chatCoords
			&& (dev.slash3rss.slashclient.hud.ChatCoords.clicked(slashclient$styleAt(e.x(), e.y()))
				|| dev.slash3rss.slashclient.hud.ChatCoords.clicked(dev.slash3rss.slashclient.hud.ChatWindows.styleAt(e.x(), e.y())))) {
			cir.setReturnValue(true);
			return;
		}
		// by the constant: 26.3 numbers the buttons anew (left 1, right 3), and a plain 1 there took over the left click
		if (e.button() != InputConstants.MOUSE_BUTTON_RIGHT || SlashHud.config == null || !SlashHud.config.chatCopy) return;
		if (slashclient$clickable(e.x(), e.y())) return;
		String text = ChatExtras.copyAt(e.x(), e.y());
		if (text == null || text.isEmpty()) return;
		Minecraft mc = Minecraft.getInstance();
		mc.keyboardHandler.setClipboard(text);
		ChatExtras.lastCopied = text;
		switch (SlashHud.config.chatCopyNotice) {
			case "off" -> {}
			case "preview" -> Compat.overlay(mc, Component.translatable("slashclient-hud.chat.copiedText", text.length() > 60 ? text.substring(0, 57) + "…" : text));
			default -> Compat.overlay(mc, Component.translatable("slashclient-hud.chat.copied"));
		}
		cir.setReturnValue(true);
	}

	/** The text under the mouse has its own action (a link, a command, text to insert): the game handles that click. */
	private boolean slashclient$clickable(double x, double y) {
		net.minecraft.network.chat.Style style = slashclient$styleAt(x, y);
		// our marked coordinates are no server's action: a right click there still copies the line
		if (style == null) return false;
		if (style.getClickEvent() != null) return true;
		//#if MC >= 1.21.11
		// text to insert counts with Shift held, as the game's own search has it
		return style.getInsertion() != null && Minecraft.getInstance().hasShiftDown() && !dev.slash3rss.slashclient.hud.ChatCoords.isMarked(style);
		//#else
		//$ return style.getInsertion() != null && !dev.slash3rss.slashclient.hud.ChatCoords.isMarked(style);
		//#endif
	}

	/** The style of the clickable text under the mouse in the chat (a click event or an insertion), or null. */
	private net.minecraft.network.chat.Style slashclient$styleAt(double x, double y) {
		Minecraft mc = Minecraft.getInstance();
		//#if MC >= 1.21.11
		// the same search the chat screen makes before it runs a click event
		ActiveTextCollector.ClickableStyleFinder finder = new ActiveTextCollector.ClickableStyleFinder(mc.font, (int) x, (int) y).includeInsertions(true);
		//#if MC >= 26.2
		Compat.chat(mc).captureClickableText(finder, mc.getWindow().getGuiScaledHeight(), mc.gui.hud.getGuiTicks(), displayMode);
		//#elif MC >= 26.1
		//$ Compat.chat(mc).captureClickableText(finder, mc.getWindow().getGuiScaledHeight(), mc.gui.getGuiTicks(), displayMode);
		//#else
		//$ Compat.chat(mc).captureClickableText(finder, mc.getWindow().getGuiScaledHeight(), mc.gui.getGuiTicks(), true);
		//#endif
		return finder.result();
		//#else
		//$ return Compat.chat(mc).getClickedComponentStyleAt(x, y);
		//#endif
	}
}
