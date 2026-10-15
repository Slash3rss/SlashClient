package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.Extras;
import net.minecraft.client.renderer.LightmapRenderStateExtractor;
import net.minecraft.client.renderer.state.LightmapRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Fullbright: the lightmap as if the player had night vision. */
@Mixin(LightmapRenderStateExtractor.class)
abstract class LightmapMixin {
	@Inject(method = "extract", at = @At("TAIL"))
	private void slashclient$fullbright(LightmapRenderState state, float partialTick, CallbackInfo ci) {
		if (Extras.fullbright()) state.nightVisionEffectIntensity = 1f;
	}
}
