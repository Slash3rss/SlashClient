package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.inventory.CreativeSearch;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The creative inventory's search finds items by their Polish and English names too (CreativeSearch). */
@Mixin(CreativeModeInventoryScreen.class)
public abstract class CreativeSearchMixin {
	@Shadow
	private EditBox searchBox;

	@Inject(method = "refreshSearchResults", at = @At("TAIL"))
	private void slashclient$bothLanguages(CallbackInfo ci) {
		var menu = ((CreativeModeInventoryScreen) (Object) this).getMenu();
		// the grid was filled from the game's results already: again, from the top, when ours were added
		if (CreativeSearch.extend(searchBox.getValue(), menu.items)) menu.scrollTo(0f);
	}
}
