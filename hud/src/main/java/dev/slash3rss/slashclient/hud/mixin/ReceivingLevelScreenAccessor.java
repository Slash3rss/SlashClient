package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 1.20.5 && MC < 1.21.9
//$ import org.spongepowered.asm.mixin.gen.Accessor;
//#endif

/**
 * Before 1.21.9 the "loading terrain" screen of a join: why it shows (a portal keeps the game's
 * look). Before 1.20.5 it does not say why; from 1.21.9 it is part of LevelLoadingScreen (empty there).
 */
//#if MC < 1.21.9
//$ @Mixin(net.minecraft.client.gui.screens.ReceivingLevelScreen.class)
//#else
@Mixin(net.minecraft.client.gui.screens.LevelLoadingScreen.class)
//#endif
public interface ReceivingLevelScreenAccessor {
	//#if MC >= 1.20.5 && MC < 1.21.9
	//$ @Accessor("reason")
	//$ net.minecraft.client.gui.screens.ReceivingLevelScreen.Reason slashclient$reason();
	//#endif
}
