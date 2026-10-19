package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.GameHud;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.toasts.ToastManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The toasts drawn where their box is in the HUD editor (or not at all, when hidden there). */
@Mixin(ToastManager.class)
abstract class ToastsMixin {
	@Unique private boolean slashclient$moved;

	@Inject(method = "extractRenderState", at = @At("HEAD"), cancellable = true)
	private void slashclient$begin(GuiGraphicsExtractor g, CallbackInfo ci) {
		slashclient$moved = false;
		if (!GameHud.toastsBegin(g)) {
			ci.cancel();
			return;
		}
		slashclient$moved = dev.slash3rss.slashclient.hud.SlashHud.config != null;
	}

	@Inject(method = "extractRenderState", at = @At("RETURN"))
	private void slashclient$end(GuiGraphicsExtractor g, CallbackInfo ci) {
		if (slashclient$moved) GameHud.toastsEnd(g);
		slashclient$moved = false;
	}
}
