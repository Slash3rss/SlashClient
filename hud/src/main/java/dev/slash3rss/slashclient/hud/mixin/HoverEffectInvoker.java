package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 26.1
import net.minecraft.client.gui.Font;
import net.minecraft.network.chat.Style;
import org.spongepowered.asm.mixin.gen.Invoker;
//#endif

/** The game's own tooltip for a chat text's hover (its text, item or entity), for the chat windows; private from 26.1. */
@Mixin(GuiGraphicsExtractor.class)
public interface HoverEffectInvoker {
	//#if MC >= 26.1
	@Invoker("componentHoverEffect")
	void slashclient$hoverEffect(Font font, Style style, int x, int y);
	//#endif
}
