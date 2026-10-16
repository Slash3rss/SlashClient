package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ChatTabs;
import dev.slash3rss.slashclient.hud.Extras;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Every chat line passes here: it gets its time stamp and is counted for the chat tabs. */
@Mixin(ChatComponent.class)
abstract class ChatComponentMixin {
	//#if MC >= 26.1
	@ModifyVariable(method = "addMessage", at = @At("HEAD"), argsOnly = true, ordinal = 0)
	//#else
	//$ // the short addMessage(Component) passes on to this one: only this one, or lines would get two time stamps
	//$ @ModifyVariable(method = "addMessage(Lnet/minecraft/network/chat/Component;Lnet/minecraft/network/chat/MessageSignature;Lnet/minecraft/client/GuiMessageTag;)V", at = @At("HEAD"), argsOnly = true, ordinal = 0)
	//#endif
	private Component slashclient$incoming(Component message) {
		ChatTabs.onMessage(message.getString());
		return Extras.timestamp(message);
	}
}
