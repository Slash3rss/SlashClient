package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Closing the game on a server with its own resource pack reloads the packs on the way out; that
 * reload can fail as the game is already letting go of its fonts, and the game then blames the
 * player's own packs and switches them all off for the next start. While the game is closing, a
 * failed reload leaves the player's packs as they were.
 */
@Mixin(Minecraft.class)
abstract class KeepPacksOnStopMixin {
	@Inject(method = "rollbackResourcePacks", at = @At("HEAD"), cancellable = true)
	private void slashclient$keepPacksOnStop(CallbackInfo ci) {
		if (!((Minecraft) (Object) this).isRunning()) ci.cancel();
	}
}
