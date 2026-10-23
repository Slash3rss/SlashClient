package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ui.SlashLoading;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Joining a server and entering a world: once the game has drawn its own loading screen (and done
 * whatever that screen does while drawing), SlashClient's look is drawn over all of it. Nothing
 * the screen does changes; switched off, only the game's screen shows.
 */
@Mixin(Screen.class)
abstract class LoadingScreenMixin {
	//#if MC >= 26.1
	@Inject(method = "extractRenderStateWithTooltipAndSubtitles", at = @At("TAIL"))
	//#elif MC >= 1.21.9
	//$ @Inject(method = "renderWithTooltipAndSubtitles", at = @At("TAIL"))
	//#else
	//$ @Inject(method = "renderWithTooltip", at = @At("TAIL"))
	//#endif
	private void slashclient$loadingLook(GuiGraphicsExtractor g, int mx, int my, float delta, CallbackInfo ci) {
		SlashLoading.afterRender((Screen) (Object) this, g, mx, my);
	}
}
