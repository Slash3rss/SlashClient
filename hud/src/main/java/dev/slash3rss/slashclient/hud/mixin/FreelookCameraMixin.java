package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.camera.Freelook;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Freelook: the camera takes its own angles instead of the player's. */
@Mixin(Camera.class)
abstract class FreelookCameraMixin {
	@ModifyVariable(method = "setRotation", at = @At("HEAD"), argsOnly = true, ordinal = 0)
	private float slashclient$yaw(float yaw) {
		return Freelook.yaw(yaw);
	}

	@ModifyVariable(method = "setRotation", at = @At("HEAD"), argsOnly = true, ordinal = 1)
	private float slashclient$pitch(float pitch) {
		return Freelook.pitch(pitch);
	}
}
