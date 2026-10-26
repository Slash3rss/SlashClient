package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.replay.ShotCaption;
import dev.slash3rss.slashclient.hud.replay.Shots;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

import java.util.function.Consumer;

/**
 * When a screenshot is saved (its message arrives), its caption is drawn in, then the clipboard
 * and the preview follow.
 * Every way the game takes one (F2 in all versions) ends in this grab.
 */
@Mixin(Screenshot.class)
abstract class ScreenshotMixin {
	//#if MC >= 1.21.6
	@ModifyVariable(method = "grab(Ljava/io/File;Ljava/lang/String;Lcom/mojang/blaze3d/pipeline/RenderTarget;ILjava/util/function/Consumer;)V", at = @At("HEAD"), argsOnly = true)
	//#else
	//$ @ModifyVariable(method = "grab(Ljava/io/File;Ljava/lang/String;Lcom/mojang/blaze3d/pipeline/RenderTarget;Ljava/util/function/Consumer;)V", at = @At("HEAD"), argsOnly = true)
	//#endif
	private static Consumer<Component> slashclient$afterSave(Consumer<Component> done) {
		// the caption says where and when F2 was pressed, so it is taken now (ShotCaption)
		var caption = ShotCaption.capture(Minecraft.getInstance());
		return message -> {
			ShotCaption.apply(Minecraft.getInstance().gameDirectory, caption, message);
			done.accept(message);
			Shots.taken(Minecraft.getInstance().gameDirectory);
		};
	}
}
