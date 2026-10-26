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
		dev.slash3rss.slashclient.hud.inventory.ContainerLayer.draw((AbstractContainerScreen<?>) (Object) this, g, mouseX, mouseY);
	}
	//#endif

	// SkyUp's challenges marked behind the item (SkyUp is played on 26.3)
	//#if MC >= 26.3
	@org.spongepowered.asm.mixin.injection.Inject(method = "extractSlot", at = @org.spongepowered.asm.mixin.injection.At("HEAD"))
	private void slashclient$behindSlot(net.minecraft.client.gui.GuiGraphicsExtractor g, net.minecraft.world.inventory.Slot slot, int mouseX, int mouseY, org.spongepowered.asm.mixin.injection.callback.CallbackInfo ci) {
		dev.slash3rss.slashclient.hud.skyup.SkyTasks.slotBehind((AbstractContainerScreen<?>) (Object) this, g, slot);
	}
	//#endif
}
