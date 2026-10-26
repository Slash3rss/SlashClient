package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.EnchantColors;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.enchantment.Enchantment;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * An enchantment's name with its level, as tooltips, books and the anvil show it, coloured by how
 * high the level is (EnchantColors). From 1.21 enchantments are data and the name comes from a
 * static method given the enchantment; before, from the enchantment itself.
 */
@Mixin(Enchantment.class)
abstract class EnchantNameMixin {
	//#if MC >= 1.21
	@Inject(method = "getFullname", at = @At("RETURN"), cancellable = true)
	private static void slashclient$levelColor(net.minecraft.core.Holder<Enchantment> enchantment, int level, CallbackInfoReturnable<Component> cir) {
		cir.setReturnValue(EnchantColors.apply(cir.getReturnValue(), level, enchantment.value().getMaxLevel(), enchantment.is(net.minecraft.tags.EnchantmentTags.CURSE)));
	}
	//#else
	//$ @Inject(method = "getFullname", at = @At("RETURN"), cancellable = true)
	//$ private void slashclient$levelColor(int level, CallbackInfoReturnable<Component> cir) {
	//$ 	Enchantment self = (Enchantment) (Object) this;
	//$ 	cir.setReturnValue(EnchantColors.apply(cir.getReturnValue(), level, self.getMaxLevel(), self.isCurse()));
	//$ }
	//#endif
}
