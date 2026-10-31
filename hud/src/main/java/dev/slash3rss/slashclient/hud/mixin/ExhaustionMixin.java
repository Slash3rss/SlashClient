package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The exhaustion the game asks for on the player's side (an attack), counted for the food bar (gamehud.Exhaustion). */
@Mixin(net.minecraft.world.entity.player.Player.class)
abstract class ExhaustionMixin {
	@Inject(method = "causeFoodExhaustion", at = @At("HEAD"))
	private void slashclient$exhaustion(float amount, CallbackInfo ci) {
		if ((Object) this instanceof net.minecraft.client.player.LocalPlayer p && !p.getAbilities().invulnerable) dev.slash3rss.slashclient.hud.gamehud.Exhaustion.add(amount);
	}
}
