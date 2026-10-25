package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The game window is "SlashClient 0.9.50 · 1.21.4", not "Minecraft* 1.21.4 - Multiplayer (3rd-party Server)". */
@Mixin(Minecraft.class)
abstract class WindowTitleMixin {
	@Inject(method = "createTitle", at = @At("HEAD"), cancellable = true)
	private void slashclient$title(CallbackInfoReturnable<String> cir) {
		String v = dev.slash3rss.slashclient.hud.SlashHud.version();
		cir.setReturnValue("SlashClient " + (v.isEmpty() ? "" : v + " · ") + net.minecraft.SharedConstants.getCurrentVersion().name());
	}
}
