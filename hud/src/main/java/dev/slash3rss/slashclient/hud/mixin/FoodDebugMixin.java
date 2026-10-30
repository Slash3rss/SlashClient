package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** F3: hunger, saturation and exhaustion under the position (FoodPreview.debugLines). */
//#if MC >= 1.21.9
@Mixin(net.minecraft.client.gui.components.debug.DebugEntryPosition.class)
abstract class FoodDebugMixin {
	@Inject(method = "display", at = @At("TAIL"))
	private void slashclient$food(net.minecraft.client.gui.components.debug.DebugScreenDisplayer displayer, net.minecraft.world.level.Level level,
		net.minecraft.world.level.chunk.LevelChunk client, net.minecraft.world.level.chunk.LevelChunk server, CallbackInfo ci) {
		for (String line : dev.slash3rss.slashclient.hud.FoodPreview.debugLines(net.minecraft.client.Minecraft.getInstance().player)) displayer.addLine(line);
	}
}
//#else
//$ @Mixin(net.minecraft.client.gui.components.DebugScreenOverlay.class)
//$ abstract class FoodDebugMixin {
//$ 	@Inject(method = "getGameInformation", at = @At("RETURN"))
//$ 	private void slashclient$food(org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable<java.util.List<String>> cir) {
//$ 		try {
//$ 			cir.getReturnValue().addAll(dev.slash3rss.slashclient.hud.FoodPreview.debugLines(net.minecraft.client.Minecraft.getInstance().player));
//$ 		} catch (UnsupportedOperationException e) {
//$ 			// a list that cannot be changed: F3 stays the game's
//$ 		}
//$ 	}
//$ }
//#endif
