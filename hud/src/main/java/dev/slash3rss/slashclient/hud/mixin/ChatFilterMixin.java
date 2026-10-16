package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.components.ChatComponent;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 26.1
//$ import dev.slash3rss.slashclient.hud.Compat;
//$ import net.minecraft.client.GuiMessage;
//$ import org.spongepowered.asm.mixin.injection.At;
//$ import org.spongepowered.asm.mixin.injection.Inject;
//$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif

/**
 * Chat tabs on versions before 26.1, which have no visible-message filter of their own:
 * lines the open tab does not catch are left out when the chat lays out its lines.
 * From 26.1 on the game's own filter is used and this mixin does nothing.
 */
@Mixin(ChatComponent.class)
abstract class ChatFilterMixin {
	//#if MC < 26.1
	//$ @Inject(method = "addMessageToDisplayQueue", at = @At("HEAD"), cancellable = true)
	//$ private void slashclient$filter(GuiMessage message, CallbackInfo ci) {
	//$ 	if (!Compat.chatFilter.test(message)) ci.cancel();
	//$ }
	//#endif
}
