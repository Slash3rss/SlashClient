package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import org.spongepowered.asm.mixin.Mixin;

/** The GUI's list of what to draw this frame, for pictures of our own (ui.FigureRender; 1.21.6+ only). */
@Mixin(GuiGraphicsExtractor.class)
public interface GuiGraphicsAccessor {
	//#if MC >= 26.1
	@org.spongepowered.asm.mixin.gen.Accessor("guiRenderState")
	net.minecraft.client.renderer.state.gui.GuiRenderState slashclient$guiRenderState();
	//#elif MC >= 1.21.6
	//$ @org.spongepowered.asm.mixin.gen.Accessor("guiRenderState")
	//$ net.minecraft.client.gui.render.state.GuiRenderState slashclient$guiRenderState();
	//#endif
}
