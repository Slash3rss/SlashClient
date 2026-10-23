package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.LevelLoadingScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/**
 * How far the world is loaded, for our loading screen: from 1.21.9 the screen's tracker (and why
 * it shows: a portal keeps the game's look), before that the spawn area's chunk progress.
 */
@Mixin(LevelLoadingScreen.class)
public interface LevelLoadingScreenAccessor {
	//#if MC >= 1.21.9
	@Accessor("loadTracker")
	net.minecraft.client.multiplayer.LevelLoadTracker slashclient$tracker();

	@Accessor("reason")
	LevelLoadingScreen.Reason slashclient$reason();
	//#else
	//$ @Accessor("progressListener")
	//$ net.minecraft.server.level.progress.StoringChunkProgressListener slashclient$listener();
	//#endif
}
