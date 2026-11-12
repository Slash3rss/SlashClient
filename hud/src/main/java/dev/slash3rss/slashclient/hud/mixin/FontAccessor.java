package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.Font;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Where the game's font gets its letters: the modules' own font (ui/ModuleFont) asks the same place. */
@Mixin(Font.class)
public interface FontAccessor {
	//#if MC >= 1.21.9
	@Accessor("provider")
	Font.Provider slashclient$provider();
	//#else
	//$ @Accessor("fonts")
	//$ java.util.function.Function<net.minecraft.resources.Identifier, net.minecraft.client.gui.font.FontSet> slashclient$fonts();
	//$
	//$ @Accessor("filterFishyGlyphs")
	//$ boolean slashclient$filterFishyGlyphs();
	//#endif
}
