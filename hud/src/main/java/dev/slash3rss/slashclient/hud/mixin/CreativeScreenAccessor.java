package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.world.item.CreativeModeTab;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;

/** For the test: the creative inventory's search tab, its box and a search run as typing runs it. */
@Mixin(CreativeModeInventoryScreen.class)
public interface CreativeScreenAccessor {
	@Accessor("searchBox")
	net.minecraft.client.gui.components.EditBox slashclient$searchBox();

	@Invoker("refreshSearchResults")
	void slashclient$refreshSearch();

	@Invoker("selectTab")
	void slashclient$selectTab(CreativeModeTab tab);
}
