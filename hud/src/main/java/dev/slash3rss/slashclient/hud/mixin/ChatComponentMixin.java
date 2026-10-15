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
	@ModifyVariable(method = "addMessage", at = @At("HEAD"), argsOnly = true, ordinal = 0)
	private Component slashclient$incoming(Component message) {
		ChatTabs.onMessage(message.getString());
		return Extras.timestamp(message);
	}
}
