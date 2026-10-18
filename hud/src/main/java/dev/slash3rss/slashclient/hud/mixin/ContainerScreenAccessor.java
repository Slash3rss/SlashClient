package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.world.inventory.Slot;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** The slot under the mouse (mouse tweaks, SkyUp tasks) and where the window is. */
@Mixin(AbstractContainerScreen.class)
public interface ContainerScreenAccessor {
	@Accessor("hoveredSlot")
	Slot slashclient$hoveredSlot();

	@Accessor("leftPos")
	int slashclient$leftPos();

	@Accessor("topPos")
	int slashclient$topPos();

	@Accessor("imageWidth")
	int slashclient$imageWidth();

	@Accessor("imageHeight")
	int slashclient$imageHeight();
}
