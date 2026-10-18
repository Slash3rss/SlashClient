package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.SkyCounters;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif

/** SkyUp's tasks ("Stwórz"): items taken out of a crafting or furnace result (the client's own prediction; 26.3 only). */
@Mixin(ItemStack.class)
abstract class SkyCraftMixin {
	//#if MC >= 26.3
	@Inject(method = "onCraftedBy", at = @At("HEAD"))
	private void slashclient$crafted(Player player, int amount, CallbackInfo ci) {
		if (player.level().isClientSide()) SkyCounters.crafted(player, (ItemStack) (Object) this, amount);
	}
	//#endif
}
