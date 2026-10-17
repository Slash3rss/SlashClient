package dev.slash3rss.slashclient.hud.mixin;

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

/** A right click on a chat line copies the message. */
@Mixin(ChatScreen.class)
abstract class ChatScreenMixin {
	@Inject(method = "mouseClicked", at = @At("HEAD"), cancellable = true)
	//#if MC >= 1.21.6
	private void slashclient$copyLine(MouseButtonEvent e, boolean doubleClick, CallbackInfoReturnable<Boolean> cir) {
	//#else
	//$ private void slashclient$copyLine(double mouseX, double mouseY, int button, CallbackInfoReturnable<Boolean> cir) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (e.button() != 1 || SlashHud.config == null || !SlashHud.config.chatCopy) return;
		String text = ChatExtras.messageAt(e.x(), e.y());
		if (text == null || text.isEmpty()) return;
		Minecraft mc = Minecraft.getInstance();
		mc.keyboardHandler.setClipboard(text);
		Compat.overlay(mc, Component.translatable("slashclient-hud.chat.copied"));
		cir.setReturnValue(true);
	}
}
