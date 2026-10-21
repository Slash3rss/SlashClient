package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.worldselection.CreateWorldScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

/** The "Create New World" button, pressed by the benchmark when it makes its test scene's world. */
@Mixin(CreateWorldScreen.class)
public interface CreateWorldScreenAccessor {
	@Invoker("onCreate")
	void slashclient$create();
}
