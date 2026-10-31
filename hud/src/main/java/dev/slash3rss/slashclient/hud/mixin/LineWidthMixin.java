package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.gamehud.BlockOutline;

import com.mojang.blaze3d.systems.RenderSystem;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 1.21.11
//$ import dev.slash3rss.slashclient.hud.gamehud.BlockOutline;
//$ import org.spongepowered.asm.mixin.injection.At;
//$ import org.spongepowered.asm.mixin.injection.ModifyVariable;
//#endif

/**
 * Before 1.21.11 lines take their width from RenderSystem.lineWidth, set by the lines' render type
 * when a batch is drawn: the block outline's batch gets our thickness (BlockOutline.widthPending).
 * Later versions pass the width with the lines and this mixin is empty.
 */
@Mixin(RenderSystem.class)
abstract class LineWidthMixin {
	//#if MC < 1.21.11
	//$ @ModifyVariable(method = "lineWidth", at = @At("HEAD"), argsOnly = true)
	//$ private static float slashclient$outlineWidth(float width) {
	//$ 	return BlockOutline.lineWidth(width);
	//$ }
	//#endif
}
