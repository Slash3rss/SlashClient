package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.modules.SessionStats;
import net.minecraft.client.Minecraft;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.context.BlockPlaceContext;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The session summary: a block the local player placed (the client's own prediction). */
@Mixin(BlockItem.class)
abstract class SessionPlaceMixin {
	@Inject(method = "place", at = @At("RETURN"))
	private void slashclient$sessionPlaced(BlockPlaceContext context, CallbackInfoReturnable<InteractionResult> cir) {
		if (context.getLevel().isClientSide() && context.getPlayer() == Minecraft.getInstance().player && cir.getReturnValue().consumesAction()) SessionStats.placed();
	}
}
