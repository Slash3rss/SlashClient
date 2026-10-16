package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.Extras;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
//#if MC >= 26.1
import net.minecraft.client.renderer.LightmapRenderStateExtractor;
import net.minecraft.client.renderer.state.LightmapRenderState;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#else
//$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
//$ import net.minecraft.client.player.LocalPlayer;
//$ import net.minecraft.client.renderer.LightTexture;
//$ import net.minecraft.core.Holder;
//$ import net.minecraft.world.effect.MobEffect;
//$ import net.minecraft.world.effect.MobEffects;
//$ import net.minecraft.world.entity.LivingEntity;
//#endif

/** Fullbright: the lightmap as if the player had night vision. */
//#if MC >= 26.1
@Mixin(LightmapRenderStateExtractor.class)
abstract class LightmapMixin {
	@Inject(method = "extract", at = @At("TAIL"))
	private void slashclient$fullbright(LightmapRenderState state, float partialTick, CallbackInfo ci) {
		if (Extras.fullbright()) state.nightVisionEffectIntensity = 1f;
	}
}
//#else
//$ @Mixin(LightTexture.class)
//$ abstract class LightmapMixin {
//$ 	@WrapOperation(method = "updateLightTexture", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;hasEffect(Lnet/minecraft/core/Holder;)Z"))
//$ 	private boolean slashclient$nightVision(LocalPlayer player, Holder<MobEffect> effect, Operation<Boolean> original) {
//$ 		return (Extras.fullbright() && effect == MobEffects.NIGHT_VISION) || original.call(player, effect);
//$ 	}
//$
//$ 	@WrapOperation(method = "updateLightTexture", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/GameRenderer;getNightVisionScale(Lnet/minecraft/world/entity/LivingEntity;F)F"))
//$ 	private float slashclient$fullStrength(LivingEntity entity, float partialTick, Operation<Float> original) {
//$ 		return Extras.fullbright() ? 1f : original.call(entity, partialTick);
//$ 	}
//$ }
//#endif
