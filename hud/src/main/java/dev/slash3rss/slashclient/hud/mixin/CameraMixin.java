package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.Extras;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Zoom: a narrower field of view while the zoom key is held. */
//#if MC >= 26.1
@Mixin(Camera.class)
//#else
//$ @Mixin(net.minecraft.client.renderer.GameRenderer.class)
//#endif
abstract class CameraMixin {
	//#if MC >= 26.1
	@ModifyReturnValue(method = "calculateFov", at = @At("RETURN"))
	//#else
	//$ @ModifyReturnValue(method = "getFov", at = @At("RETURN"))
	//#endif
	//#if MC >= 1.21.2
	private float slashclient$zoom(float fov) {
		return Extras.zoomFov(fov);
	}
	//#else
	//$ // the field of view was a double before 1.21.2
	//$ private double slashclient$zoom(double fov) {
	//$ 	return Extras.zoomFov((float) fov);
	//$ }
	//#endif
}
