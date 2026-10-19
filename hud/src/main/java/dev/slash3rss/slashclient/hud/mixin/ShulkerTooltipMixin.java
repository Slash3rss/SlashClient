package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ShulkerPreview;
import net.minecraft.world.inventory.tooltip.TooltipComponent;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.Optional;

/**
 * A shulker box's tooltip gets a picture of what is inside (ShulkerPreview). Every tooltip of an
 * item asks its item for one, in all versions; shulker boxes are plain block items, which have none.
 */
@Mixin(Item.class)
abstract class ShulkerTooltipMixin {
	@Inject(method = "getTooltipImage", at = @At("HEAD"), cancellable = true)
	private void slashclient$shulkerContents(ItemStack stack, CallbackInfoReturnable<Optional<TooltipComponent>> cir) {
		ShulkerPreview.Contents contents = ShulkerPreview.image(stack);
		if (contents != null) cir.setReturnValue(Optional.of(contents));
	}
}
