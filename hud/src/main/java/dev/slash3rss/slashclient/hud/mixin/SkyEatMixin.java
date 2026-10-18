package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.SkyCounters;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif

/** SkyUp's tasks ("Zjedz"): the server's word that the player finished eating (event 9; 26.3 only). */
@Mixin(Player.class)
abstract class SkyEatMixin {
	//#if MC >= 26.3
	@Inject(method = "handleEntityEvent", at = @At("HEAD"))
	private void slashclient$ate(byte id, CallbackInfo ci) {
		if (id == 9) SkyCounters.ate((Player) (Object) this);
	}
	//#endif
}
