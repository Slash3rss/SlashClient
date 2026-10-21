package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.BenchScene;
import net.minecraft.client.Camera;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The benchmark's test scene flies the camera on its own path while the player stays still. */
@Mixin(Camera.class)
abstract class BenchCameraMixin {
	@Shadow
	protected abstract void setPosition(Vec3 position);

	@Shadow
	protected abstract void setRotation(float yaw, float pitch);

	//#if MC >= 26.1
	@Inject(method = "alignWithEntity", at = @At("TAIL"))
	//#else
	//$ @Inject(method = "setup", at = @At("TAIL"))
	//#endif
	private void slashclient$benchScene(CallbackInfo ci) {
		double[] at = BenchScene.camera();
		if (at == null) return;
		setRotation((float) at[3], (float) at[4]);
		setPosition(new Vec3(at[0], at[1], at[2]));
	}
}
