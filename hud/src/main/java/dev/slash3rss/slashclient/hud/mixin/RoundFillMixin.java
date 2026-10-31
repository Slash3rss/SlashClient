package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The game's plain rectangles, drawn rounded while the scoreboard or the tab list asks for it (GameRound). */
@Mixin(GuiGraphicsExtractor.class)
abstract class RoundFillMixin {
	@Inject(method = "fill(IIIII)V", at = @At("HEAD"), cancellable = true)
	private void slashclient$round(int x1, int y1, int x2, int y2, int color, CallbackInfo ci) {
		if (dev.slash3rss.slashclient.hud.gamehud.GameRound.fill((GuiGraphicsExtractor) (Object) this, x1, y1, x2, y2, color)) ci.cancel();
	}
}
