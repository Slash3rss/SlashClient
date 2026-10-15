package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.slash3rss.slashclient.hud.Extras;
import net.minecraft.client.renderer.ScreenEffectRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Low fire: the burning overlay moved down so it covers less of the view. */
@Mixin(ScreenEffectRenderer.class)
abstract class ScreenEffectRendererMixin {
	@Inject(method = "submitFire", at = @At("HEAD"))
	private static void slashclient$lowerFire(PoseStack pose, SubmitNodeCollector collector, TextureAtlasSprite sprite, CallbackInfo ci) {
		pose.pushPose();
		if (Extras.lowFire()) pose.translate(0f, -0.35f, 0f);
	}

	@Inject(method = "submitFire", at = @At("RETURN"))
	private static void slashclient$lowerFireEnd(PoseStack pose, SubmitNodeCollector collector, TextureAtlasSprite sprite, CallbackInfo ci) {
		pose.popPose();
	}
}
