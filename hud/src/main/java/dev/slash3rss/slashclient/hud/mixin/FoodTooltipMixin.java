package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.gamehud.FoodPreview;
import net.minecraft.world.inventory.tooltip.TooltipComponent;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.Optional;

/** A food's tooltip gets its drumsticks and saturation (FoodPreview.Icons), unless the item has a picture of its own. */
@Mixin(Item.class)
abstract class FoodTooltipMixin {
	@Inject(method = "getTooltipImage", at = @At("RETURN"), cancellable = true)
	private void slashclient$foodIcons(ItemStack stack, CallbackInfoReturnable<Optional<TooltipComponent>> cir) {
		if (cir.getReturnValue().isPresent()) return;
		FoodPreview.Gives gives = FoodPreview.image(stack);
		if (gives != null) cir.setReturnValue(Optional.of(gives));
	}
}
