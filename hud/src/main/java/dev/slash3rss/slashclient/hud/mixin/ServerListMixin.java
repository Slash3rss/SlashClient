package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.PinnedServer;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.List;

/** SkyUp.pl first in the server list, and never removed or moved away from there. */
@Mixin(ServerList.class)
abstract class ServerListMixin {
	@Shadow @Final private List<ServerData> serverList;

	@Inject(method = "load", at = @At("TAIL"))
	private void slashclient$pin(CallbackInfo ci) {
		PinnedServer.ensure(serverList);
	}

	@Inject(method = "remove", at = @At("HEAD"), cancellable = true)
	private void slashclient$keepPinned(ServerData server, CallbackInfo ci) {
		if (PinnedServer.is(server)) ci.cancel();
	}

	// editing ends in replace(): SkyUp.pl keeps its name and address
	@Inject(method = "replace", at = @At("HEAD"), cancellable = true)
	private void slashclient$noEditPinned(int index, ServerData server, CallbackInfo ci) {
		if (index >= 0 && index < serverList.size() && PinnedServer.is(serverList.get(index))) ci.cancel();
	}

	@Inject(method = "swap", at = @At("HEAD"), cancellable = true)
	private void slashclient$noMovePinned(int a, int b, CallbackInfo ci) {
		if (PinnedServer.blocksSwap(serverList, a, b)) ci.cancel();
	}
}
