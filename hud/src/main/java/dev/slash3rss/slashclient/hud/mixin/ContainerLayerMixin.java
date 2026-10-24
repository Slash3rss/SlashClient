package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import org.spongepowered.asm.mixin.Mixin;

/**
 * Our drawings over an inventory window (ContainerLayer) go in after the slots and before the item
 * in hand, so the tooltip, drawn later in its own layer, stays on top of them.
 */
@Mixin(AbstractContainerScreen.class)
abstract class ContainerLayerMixin {
	//#if MC >= 26.1
	@org.spongepowered.asm.mixin.injection.Inject(method = "extractCarriedItem", at = @org.spongepowered.asm.mixin.injection.At("HEAD"))
	//#elif MC >= 1.21.6
	//$ @org.spongepowered.asm.mixin.injection.Inject(method = "renderCarriedItem", at = @org.spongepowered.asm.mixin.injection.At("HEAD"))
	//#endif
	//#if MC >= 1.21.6
	private void slashclient$underTooltips(net.minecraft.client.gui.GuiGraphicsExtractor g, int mouseX, int mouseY, org.spongepowered.asm.mixin.injection.callback.CallbackInfo ci) {
		dev.slash3rss.slashclient.hud.ContainerLayer.draw((AbstractContainerScreen<?>) (Object) this, g, mouseX, mouseY);
	}
	//#endif
}
