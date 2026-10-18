package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.ClientBrandRetriever;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The client's name the server sees (the "brand", "fabric" otherwise): SlashClient's own. */
@Mixin(ClientBrandRetriever.class)
abstract class BrandingMixin {
	@Inject(method = "getClientModName", at = @At("HEAD"), cancellable = true, remap = false)
	private static void slashclient$brand(CallbackInfoReturnable<String> cir) {
		cir.setReturnValue("slashclient");
	}
}
