package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.Freelook;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Freelook: the mouse turns only the camera while the key is held. */
@Mixin(Entity.class)
abstract class FreelookMixin {
	@Inject(method = "turn", at = @At("HEAD"), cancellable = true)
	private void slashclient$freelook(double yRot, double xRot, CallbackInfo ci) {
		if (Freelook.turn((Entity) (Object) this, yRot, xRot)) ci.cancel();
	}
}
