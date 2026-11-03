package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.TextColor;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** The action bar's text in the colour set for it: only the parts a server left without a colour of their own. */
//#if MC >= 26.2
@Mixin(net.minecraft.client.gui.Hud.class)
//#else
//$ @Mixin(net.minecraft.client.gui.Gui.class)
//#endif
abstract class ActionBarColorMixin {
	@ModifyVariable(method = "setOverlayMessage", at = @At("HEAD"), argsOnly = true, ordinal = 0)
	private Component slashclient$color(Component message) {
		var cfg = SlashHud.config;
		if (cfg == null || message == null || (cfg.actionBarColor & 0xFFFFFF) == 0xFFFFFF) return message;
		// the message inside a coloured one: its own colours still win
		return Component.empty().withStyle(s -> s.withColor(TextColor.fromRgb(cfg.actionBarColor & 0xFFFFFF))).append(message);
	}
}
