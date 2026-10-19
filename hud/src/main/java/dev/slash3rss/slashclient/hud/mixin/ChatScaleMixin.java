package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ChatLook;
import net.minecraft.client.gui.components.ChatComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The chat bigger than the game's own scale allows (the editor's chat size above 1): the chat
 * draws, wraps its lines and finds the line under the mouse all from this one scale.
 */
@Mixin(ChatComponent.class)
abstract class ChatScaleMixin {
	@Inject(method = "getScale", at = @At("RETURN"), cancellable = true)
	private void slashclient$scale(CallbackInfoReturnable<Double> cir) {
		double extra = ChatLook.extra();
		if (extra != 1) cir.setReturnValue(cir.getReturnValue() * extra);
	}
}
