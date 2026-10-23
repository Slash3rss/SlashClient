package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 1.20.3
import dev.slash3rss.slashclient.hud.ui.SlashLoading;
import net.minecraft.util.HttpUtil;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#endif

/**
 * A server's resource packs being downloaded: the game's own progress (its toast) also reaches our
 * loading screen. The game's listener is wrapped, every call goes on to it unchanged. Before 1.20.3
 * the download has a progress screen of its own (drawn in our look by SlashLoading); empty there.
 */
//#if MC >= 1.20.3
@Mixin(net.minecraft.client.resources.server.DownloadedPackSource.class)
//#else
//$ @Mixin(net.minecraft.client.Minecraft.class)
//#endif
abstract class PackDownloadMixin {
	//#if MC >= 1.20.3
	@Inject(method = "createDownloadNotifier", at = @At("RETURN"), cancellable = true)
	private void slashclient$watch(int count, CallbackInfoReturnable<HttpUtil.DownloadProgressListener> cir) {
		cir.setReturnValue(SlashLoading.watchPacks(cir.getReturnValue(), count));
	}
	//#endif
}
