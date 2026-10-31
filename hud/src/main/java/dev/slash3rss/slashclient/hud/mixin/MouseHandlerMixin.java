package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.slash3rss.slashclient.hud.Extras;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** While zooming the wheel changes the zoom and the mouse turns slower. */
@Mixin(MouseHandler.class)
abstract class MouseHandlerMixin {
	@Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
	private void slashclient$zoomScroll(long window, double x, double y, CallbackInfo ci) {
		if (Extras.scroll(y) || dev.slash3rss.slashclient.hud.camera.CameraDistance.scroll(y)) ci.cancel();
	}

	@ModifyExpressionValue(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/OptionInstance;get()Ljava/lang/Object;", ordinal = 0))
	private Object slashclient$zoomSensitivity(Object sensitivity) {
		return Extras.sensitivity((Double) sensitivity);
	}
}
