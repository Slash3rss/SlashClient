package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.chat.ChatExtras;
import net.minecraft.client.gui.components.ChatComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.Constant;
import org.spongepowered.asm.mixin.injection.ModifyConstant;

/** The chat keeps as many lines as the player set (the game keeps 100, the oldest dropped). */
@Mixin(ChatComponent.class)
abstract class ChatHistoryMixin {
	//#if MC >= 1.20.2
	@ModifyConstant(method = { "addMessageToDisplayQueue", "addMessageToQueue" }, constant = @Constant(intValue = 100))
	//#else
	//$ @ModifyConstant(method = "addMessage(Lnet/minecraft/network/chat/Component;Lnet/minecraft/network/chat/MessageSignature;ILnet/minecraft/client/GuiMessageTag;Z)V", constant = @Constant(intValue = 100))
	//#endif
	private int slashclient$history(int lines) {
		return ChatExtras.historyLines();
	}
}
