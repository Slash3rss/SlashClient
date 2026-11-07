package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.skyup.DungeonRun;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
//#if MC >= 26.3
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#else
//$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#endif

/** Q on the item in hand, in a dungeon: picked up again, it is not loot (DungeonRun). */
//#if MC >= 26.3
@Mixin(MultiPlayerGameMode.class)
abstract class DungeonDropMixin {
	@Inject(method = "dropItem", at = @At("HEAD"))
	private void slashclient$threw(LocalPlayer player, boolean fullStack, CallbackInfo ci) {
		var stack = player.getMainHandItem();
		DungeonRun.threw(stack, fullStack ? stack.getCount() : 1);
	}
}
//#else
//$ @Mixin(LocalPlayer.class)
//$ abstract class DungeonDropMixin {
//$ 	@Inject(method = "drop", at = @At("HEAD"))
//$ 	private void slashclient$threw(boolean fullStack, CallbackInfoReturnable<Boolean> cir) {
//$ 		var stack = ((LocalPlayer) (Object) this).getMainHandItem();
//$ 		DungeonRun.threw(stack, fullStack ? stack.getCount() : 1);
//$ 	}
//$ }
//#endif
