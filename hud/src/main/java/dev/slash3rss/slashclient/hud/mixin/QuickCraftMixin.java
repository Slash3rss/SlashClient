package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.inventory.QuickCraft;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** One-click crafting (QuickCraft): the recipe book's and the stonecutter's requests to the server, seen as they go. */
@Mixin(MultiPlayerGameMode.class)
abstract class QuickCraftMixin {
	@Inject(method = "handlePlaceRecipe", at = @At("HEAD"))
	//#if MC >= 1.21.2
	private void slashclient$placed(int containerId, net.minecraft.world.item.crafting.display.RecipeDisplayId recipe, boolean all, CallbackInfo ci) {
	//#elif MC >= 1.20.2
	//$ private void slashclient$placed(int containerId, net.minecraft.world.item.crafting.RecipeHolder<?> recipe, boolean all, CallbackInfo ci) {
	//#else
	//$ private void slashclient$placed(int containerId, net.minecraft.world.item.crafting.Recipe<?> recipe, boolean all, CallbackInfo ci) {
	//#endif
		QuickCraft.placed(containerId, recipe, all);
	}

	@Inject(method = "handleInventoryButtonClick", at = @At("HEAD"))
	private void slashclient$button(int containerId, int button, CallbackInfo ci) {
		QuickCraft.buttonClicked(containerId);
	}
}
