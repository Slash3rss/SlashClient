package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.ProgressScreen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** The game's progress screen (saving, a resource pack on 1.20.1…): its heading, step and percentage, for our loading screen. */
@Mixin(ProgressScreen.class)
public interface ProgressScreenAccessor {
	@Accessor("header")
	Component slashclient$header();

	@Accessor("stage")
	Component slashclient$stage();

	@Accessor("progress")
	int slashclient$progress();
}
