package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.CameraDistance;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** The third person camera's distance: what the game asks its wall check for, as the player set it. */
@Mixin(Camera.class)
abstract class CameraDistanceMixin {
	@ModifyVariable(method = "getMaxZoom", at = @At("HEAD"), argsOnly = true)
	//#if MC >= 1.21
	private float slashclient$distance(float distance) {
		return CameraDistance.distance(distance);
	}
	//#else
	//$ // a double before 1.20.5
	//$ private double slashclient$distance(double distance) {
	//$ 	return CameraDistance.distance((float) distance);
	//$ }
	//#endif
}
