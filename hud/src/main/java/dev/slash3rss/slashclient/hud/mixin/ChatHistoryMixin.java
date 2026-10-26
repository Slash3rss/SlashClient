package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.slash3rss.slashclient.hud.chat.ChatExtras;
import net.minecraft.client.gui.components.ChatComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * The chat keeps as many lines as the player set (the game keeps 100, the oldest dropped). Chained
 * with other mods that raise it too (More Chat History): the larger of the two wins.
 */
@Mixin(ChatComponent.class)
abstract class ChatHistoryMixin {
	//#if MC >= 1.20.2
	@ModifyExpressionValue(method = { "addMessageToDisplayQueue", "addMessageToQueue" }, at = @At(value = "CONSTANT", args = "intValue=100"))
	//#else
	//$ @ModifyExpressionValue(method = "addMessage(Lnet/minecraft/network/chat/Component;Lnet/minecraft/network/chat/MessageSignature;ILnet/minecraft/client/GuiMessageTag;Z)V", at = @At(value = "CONSTANT", args = "intValue=100"))
	//#endif
	private int slashclient$history(int lines) {
		return Math.max(lines, ChatExtras.historyLines());
	}
}
