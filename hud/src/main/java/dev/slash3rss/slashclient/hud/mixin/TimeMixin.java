package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.Extras;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Your own time of day: what the client is told about the clock, not what the server keeps. */
//#if MC >= 26.3
@Mixin(net.minecraft.client.ClientClockManager.ClientClockInstance.class)
//#elif MC >= 26.1
//$ @Mixin(net.minecraft.client.ClientClockManager.class)
//#else
//$ @Mixin(net.minecraft.client.multiplayer.ClientLevel.ClientLevelData.class)
//#endif
abstract class TimeMixin {
	//#if MC >= 26.3
	@ModifyReturnValue(method = "totalTicks", at = @At("RETURN"))
	//#elif MC >= 26.1
	//$ @ModifyReturnValue(method = "getTotalTicks", at = @At("RETURN"))
	//#else
	//$ @ModifyReturnValue(method = "getDayTime", at = @At("RETURN"))
	//#endif
	private long slashclient$time(long ticks) {
		return Extras.time(ticks);
	}
}
