package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** How long the action bar's message and the title stay: above 0 while on screen (for the HUD editor). */
//#if MC >= 26.2
@Mixin(net.minecraft.client.gui.Hud.class)
//#else
//$ @Mixin(net.minecraft.client.gui.Gui.class)
//#endif
public interface OverlayMessageAccessor {
	@Accessor("overlayMessageTime")
	int slashclient$overlayMessageTime();

	/** Above 0 while a title is on screen. */
	@Accessor("titleTime")
	int slashclient$titleTime();
}
