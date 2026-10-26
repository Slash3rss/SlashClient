package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.world.item.BlockItem;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 26.3
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.skyup.SkyCounters;
//#endif
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.context.BlockPlaceContext;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#endif

/** SkyUp's tasks ("Postaw"): a block the player placed (the client's own prediction; 26.3 only). */
@Mixin(BlockItem.class)
abstract class SkyPlaceMixin {
	//#if MC >= 26.3
	@Inject(method = "place", at = @At("RETURN"))
	private void slashclient$placed(BlockPlaceContext context, CallbackInfoReturnable<InteractionResult> cir) {
		if (context.getLevel().isClientSide() && cir.getReturnValue().consumesAction()) SkyCounters.placed(context.getPlayer(), (BlockItem) (Object) this, context.getClickedPos());
	}
	//#endif
}
