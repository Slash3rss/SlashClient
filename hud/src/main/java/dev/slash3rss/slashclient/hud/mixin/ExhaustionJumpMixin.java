package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The player's own jump: the server counts it as exhaustion, and so does the food bar (gamehud.Exhaustion). */
@Mixin(net.minecraft.world.entity.LivingEntity.class)
abstract class ExhaustionJumpMixin {
	@Inject(method = "jumpFromGround", at = @At("HEAD"))
	private void slashclient$jump(CallbackInfo ci) {
		if ((Object) this instanceof net.minecraft.client.player.LocalPlayer p) dev.slash3rss.slashclient.hud.gamehud.Exhaustion.jumped(p);
	}
}
