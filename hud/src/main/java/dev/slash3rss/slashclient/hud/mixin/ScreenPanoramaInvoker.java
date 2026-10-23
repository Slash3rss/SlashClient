package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 1.20.2
import net.minecraft.client.gui.GuiGraphicsExtractor;
import org.spongepowered.asm.mixin.gen.Invoker;
//#endif

/**
 * The game's title screen panorama, drawn by any screen (our loading screen draws it behind a join).
 * Before 1.20.2 screens have no such method; Legacy.panorama stands in there.
 */
@Mixin(Screen.class)
public interface ScreenPanoramaInvoker {
	//#if MC >= 26.1
	@Invoker("extractPanorama")
	void slashclient$panorama(GuiGraphicsExtractor g, float delta);
	//#elif MC >= 1.20.2
	//$ @Invoker("renderPanorama")
	//$ void slashclient$panorama(GuiGraphicsExtractor g, float delta);
	//#endif
}
