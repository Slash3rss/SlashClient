package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ui.BlockWindows;
import net.minecraft.client.gui.screens.inventory.ShulkerBoxScreen;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/** "Okna w wyglądzie bloków": a shulker box's window in the colour of the box being opened (BlockWindows). */
@Mixin(ShulkerBoxScreen.class)
public abstract class ShulkerColorMixin {
	//#if MC >= 26.1
	@Redirect(method = "extractBackground", at = @At(value = "FIELD", target = "Lnet/minecraft/client/gui/screens/inventory/ShulkerBoxScreen;CONTAINER_TEXTURE:Lnet/minecraft/resources/Identifier;"), require = 0)
	//#else
	//$ @Redirect(method = "renderBg", at = @At(value = "FIELD", target = "Lnet/minecraft/client/gui/screens/inventory/ShulkerBoxScreen;CONTAINER_TEXTURE:Lnet/minecraft/resources/Identifier;"), require = 0)
	//#endif
	private Identifier slashclient$colour() {
		return BlockWindows.shulkerTexture(Identifier.tryParse("minecraft:textures/gui/container/shulker_box.png"));
	}
}
