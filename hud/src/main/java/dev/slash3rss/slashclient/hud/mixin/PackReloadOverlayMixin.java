package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ui.SlashLoading;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.LoadingOverlay;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * A server's resource packs being applied while a server is joined: the game reloads its resources
 * under its red Mojang screen. Once that screen has drawn (and done its own work of finishing the
 * reload), SlashClient's loading screen is drawn over it with the reload's progress, so the join
 * stays on one screen. The game's start and F3+T, with no loading screen under it, keep its look.
 */
@Mixin(LoadingOverlay.class)
abstract class PackReloadOverlayMixin {
	@Shadow
	private float currentProgress;
	/** Only a reload while playing fades in; the game's start (fonts not loaded yet) does not. */
	@Shadow
	private boolean fadeIn;

	//#if MC >= 26.1
	@Inject(method = "extractRenderState", at = @At("TAIL"))
	//#else
	//$ @Inject(method = "render", at = @At("TAIL"))
	//#endif
	private void slashclient$packLook(GuiGraphicsExtractor g, int mx, int my, float delta, CallbackInfo ci) {
		if (fadeIn) SlashLoading.overPackReload(g, mx, my, currentProgress);
	}
}
