package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.gui.components.ChatComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** The game empties the chat on leaving a server: with the setting on, it stays as it was, also on the next server. */
//#if MC >= 26.2
@Mixin(net.minecraft.client.gui.Hud.class)
//#else
//$ @Mixin(net.minecraft.client.gui.Gui.class)
//#endif
abstract class ChatKeepMixin {
	@WrapWithCondition(method = "onDisconnected", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/components/ChatComponent;clearMessages(Z)V"))
	private boolean slashclient$keepChat(ChatComponent chat, boolean history) {
		return !SlashHud.config.chatKeep;
	}
}
