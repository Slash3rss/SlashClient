package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.chat.ChatExtras;
import dev.slash3rss.slashclient.hud.chat.ChatTabs;
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
		ChatExtras.arrived();
		message = dev.slash3rss.slashclient.hud.players.NickHider.apply(message);
		// coordinates in the line: underlined, a click saves them as a waypoint
		message = dev.slash3rss.slashclient.hud.chat.ChatCoords.mark(message);
		// the line's text, made once: building it walks the whole line, and busy chats send many
		String line = message.getString();
		ChatTabs.onMessage(line);
		dev.slash3rss.slashclient.hud.skyup.DungeonMap.onChat(line);
		//#if MC >= 26.3
		dev.slash3rss.slashclient.hud.skyup.SkyCounters.onChat(message);
		dev.slash3rss.slashclient.hud.skyup.SkyTasks.onChat(message);
		dev.slash3rss.slashclient.hud.skyup.SkyCase.onChat(line);
		dev.slash3rss.slashclient.hud.skyup.SkyPlan.onChat(line);
		//#endif
		Component shown = ChatExtras.stack((ChatComponent) (Object) this, line, Extras.timestamp(message));
		dev.slash3rss.slashclient.hud.chat.ChatWindows.onLine(line, shown);
		return shown;
	}
}
