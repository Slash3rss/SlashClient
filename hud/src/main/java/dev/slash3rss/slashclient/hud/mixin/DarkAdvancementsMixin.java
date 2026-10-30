package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ui.DarkGui;
import net.minecraft.client.gui.screens.advancements.AdvancementsScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

/** "Ciemne okna gry": the advancements window's title light on its dark frame (DarkGui). */
@Mixin(AdvancementsScreen.class)
public abstract class DarkAdvancementsMixin {
	//#if MC >= 26.1
	@ModifyArg(method = "extractWindow", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;text(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;IIIZ)V"), index = 4, require = 0)
	//#else
	//$ @ModifyArg(method = "renderWindow", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;drawString(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;IIIZ)I"), index = 4, require = 0)
	//#endif
	private int slashclient$lightTitle(int color) {
		return DarkGui.label(color, this);
	}
}
