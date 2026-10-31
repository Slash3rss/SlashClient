package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.Compat;

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
	//#if MC >= 1.20.2
	//$ @Inject(method = "addMessageToDisplayQueue", at = @At("HEAD"), cancellable = true)
	//$ private void slashclient$filter(GuiMessage message, CallbackInfo ci) {
	//$ 	if (!Compat.chatFilter.test(message)) ci.cancel();
	//$ }
	//#else
	//$ // 1.20.1 adds a message and its lines in one method: the lines of a message the tab does not catch are skipped
	//$ @org.spongepowered.asm.mixin.Unique
	//$ private GuiMessage slashclient$current;
	//$
	//$ @Inject(method = "addMessage(Lnet/minecraft/network/chat/Component;Lnet/minecraft/network/chat/MessageSignature;ILnet/minecraft/client/GuiMessageTag;Z)V", at = @At("HEAD"))
	//$ private void slashclient$remember(net.minecraft.network.chat.Component text, net.minecraft.network.chat.MessageSignature signature, int tick, net.minecraft.client.GuiMessageTag tag, boolean refresh, CallbackInfo ci) {
	//$ 	slashclient$current = new GuiMessage(tick, text, signature, tag);
	//$ }
	//$
	//$ @com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation(method = "addMessage(Lnet/minecraft/network/chat/Component;Lnet/minecraft/network/chat/MessageSignature;ILnet/minecraft/client/GuiMessageTag;Z)V", at = @At(value = "INVOKE", target = "Ljava/util/List;add(ILjava/lang/Object;)V"))
	//$ private void slashclient$filter(java.util.List<Object> list, int index, Object element, com.llamalad7.mixinextras.injector.wrapoperation.Operation<Void> original) {
	//$ 	if (element instanceof GuiMessage.Line && slashclient$current != null && !Compat.chatFilter.test(slashclient$current)) return;
	//$ 	original.call(list, index, element);
	//$ }
	//#endif
	//#endif
}
