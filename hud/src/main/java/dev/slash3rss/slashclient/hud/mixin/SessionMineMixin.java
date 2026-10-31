package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.modules.SessionStats;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import net.minecraft.core.BlockPos;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The session summary: a block the local player broke (the client's own prediction). Fabric's
 * block break event is missing in older Fabric API versions, this method is the same in all.
 */
@Mixin(MultiPlayerGameMode.class)
abstract class SessionMineMixin {
	@Inject(method = "destroyBlock", at = @At("RETURN"))
	private void slashclient$sessionMined(BlockPos pos, CallbackInfoReturnable<Boolean> cir) {
		if (cir.getReturnValueZ()) SessionStats.mined();
	}
}
