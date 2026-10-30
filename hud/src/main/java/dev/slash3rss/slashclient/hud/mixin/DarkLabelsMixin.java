package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ui.DarkGui;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

/**
 * "Ciemne okna gry": a window's title and "Inventory" light on the dark panel instead of the game's dark grey
 * (DarkGui); the windows that draw their own ("Crafting", the creative tab's name, the villager's trades) too.
 */
@Mixin({ AbstractContainerScreen.class, net.minecraft.client.gui.screens.inventory.InventoryScreen.class,
	net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen.class, net.minecraft.client.gui.screens.inventory.MerchantScreen.class })
public abstract class DarkLabelsMixin {
	//#if MC >= 26.1
	@ModifyArg(method = "extractLabels", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;text(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;IIIZ)V"), index = 4, require = 0)
	//#else
	//$ @ModifyArg(method = "renderLabels", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;drawString(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;IIIZ)I"), index = 4, require = 0)
	//#endif
	private int slashclient$lightLabel(int color) {
		return DarkGui.label(color);
	}
}
