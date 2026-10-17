package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.PauseScreen;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 1.20.2
//$ import org.spongepowered.asm.mixin.gen.Accessor;
//#endif

/** 1.20.1 has no PauseScreen.showsPauseMenu(): its field is read here (empty on later versions). */
@Mixin(PauseScreen.class)
public interface PauseScreenAccessor {
	//#if MC < 1.20.2
	//$ @Accessor("showPauseMenu")
	//$ boolean slashclient$showPauseMenu();
	//#endif
}
