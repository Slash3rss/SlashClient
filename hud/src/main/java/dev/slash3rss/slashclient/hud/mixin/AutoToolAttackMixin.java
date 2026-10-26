package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Auto tool for mobs: the hardest-hitting weapon into the hand just before the hit, the shears just
 * before a right click on a sheep (Assist.beforeAttack, Assist.beforeUse).
 */
@Mixin(Minecraft.class)
abstract class AutoToolAttackMixin {
	@Inject(method = "startAttack", at = @At("HEAD"))
	private void slashclient$weapon(CallbackInfoReturnable<Boolean> cir) {
		dev.slash3rss.slashclient.hud.Assist.beforeAttack((Minecraft) (Object) this);
	}

	@Inject(method = "startUseItem", at = @At("HEAD"))
	private void slashclient$shears(org.spongepowered.asm.mixin.injection.callback.CallbackInfo ci) {
		dev.slash3rss.slashclient.hud.Assist.beforeUse((Minecraft) (Object) this);
		//#if MC >= 26.3
		// a click on a campfire with a shaman's wand: the mob coming is remembered for SkyUp's line after
		dev.slash3rss.slashclient.hud.skyup.SkyShaman.used((Minecraft) (Object) this);
		// a bell rung, a sheep shorn, a case's chest clicked: for SkyUp's tasks
		dev.slash3rss.slashclient.hud.skyup.SkyCounters.used((Minecraft) (Object) this);
		//#endif
	}
}
