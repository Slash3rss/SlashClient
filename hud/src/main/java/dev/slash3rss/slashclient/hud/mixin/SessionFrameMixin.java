package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.modules.SessionStats;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The session summary's FPS: each drawn frame's time (render() in every version we build for). */
@Mixin(GameRenderer.class)
abstract class SessionFrameMixin {
	@Inject(method = "render", at = @At("TAIL"))
	private void slashclient$sessionFrame(CallbackInfo ci) {
		SessionStats.frame(Minecraft.getInstance());
	}
}
