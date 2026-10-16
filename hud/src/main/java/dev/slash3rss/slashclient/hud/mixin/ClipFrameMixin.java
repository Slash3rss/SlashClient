package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.Clips;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** A frame for the clip buffer once the world and the HUD are drawn (render() in every version we build for). */
@Mixin(GameRenderer.class)
abstract class ClipFrameMixin {
	@Inject(method = "render", at = @At("TAIL"))
	private void slashclient$clipFrame(CallbackInfo ci) {
		Clips.afterFrame(Minecraft.getInstance());
	}
}
