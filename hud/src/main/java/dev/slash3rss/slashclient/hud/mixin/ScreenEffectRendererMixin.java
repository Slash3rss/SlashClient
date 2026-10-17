package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.slash3rss.slashclient.hud.Extras;
import net.minecraft.client.renderer.ScreenEffectRenderer;
//#if MC >= 26.2
import net.minecraft.client.renderer.SubmitNodeCollector;
//#else
//$ import net.minecraft.client.renderer.MultiBufferSource;
//#endif
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Low fire: the burning overlay moved down so it covers less of the view. */
@Mixin(ScreenEffectRenderer.class)
abstract class ScreenEffectRendererMixin {
	//#if MC >= 26.2
	@Inject(method = "submitFire", at = @At("HEAD"))
	private static void slashclient$lowerFire(PoseStack pose, SubmitNodeCollector collector, TextureAtlasSprite sprite, CallbackInfo ci) {
	//#elif MC >= 1.21.9
	//$ @Inject(method = "renderFire", at = @At("HEAD"))
	//$ private static void slashclient$lowerFire(PoseStack pose, MultiBufferSource buffers, TextureAtlasSprite sprite, CallbackInfo ci) {
	//#else
	//$ @Inject(method = "renderFire", at = @At("HEAD"))
	//$ private static void slashclient$lowerFire(PoseStack pose, MultiBufferSource buffers, CallbackInfo ci) {
	//#endif
		pose.pushPose();
		if (Extras.lowFire()) pose.translate(0f, -0.35f, 0f);
	}

	//#if MC >= 26.2
	@Inject(method = "submitFire", at = @At("RETURN"))
	private static void slashclient$lowerFireEnd(PoseStack pose, SubmitNodeCollector collector, TextureAtlasSprite sprite, CallbackInfo ci) {
	//#elif MC >= 1.21.9
	//$ @Inject(method = "renderFire", at = @At("RETURN"))
	//$ private static void slashclient$lowerFireEnd(PoseStack pose, MultiBufferSource buffers, TextureAtlasSprite sprite, CallbackInfo ci) {
	//#else
	//$ @Inject(method = "renderFire", at = @At("RETURN"))
	//$ private static void slashclient$lowerFireEnd(PoseStack pose, MultiBufferSource buffers, CallbackInfo ci) {
	//#endif
		pose.popPose();
	}
}
