package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.servers.PinnedServer;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.List;

/** Pinned partner servers first in the server list, and never removed or moved away from there. */
@Mixin(ServerList.class)
abstract class ServerListMixin {
	@Shadow @Final private List<ServerData> serverList;

	// at every return: with no servers.dat yet (a new profile, a crashed game) the game stops reading early,
	// and the pinned partners were missing from the list until it was saved once
	@Inject(method = "load", at = @At("RETURN"))
	private void slashclient$pin(CallbackInfo ci) {
		PinnedServer.ensure(serverList);
		dev.slash3rss.slashclient.hud.servers.ServerPacks.listed(serverList);
	}

	/** Which servers are in the list, for their resource pack modes (ServerPacks). */
	@Inject(method = "save", at = @At("TAIL"))
	private void slashclient$listed(CallbackInfo ci) {
		dev.slash3rss.slashclient.hud.servers.ServerPacks.listed(serverList);
	}

	@Inject(method = "remove", at = @At("HEAD"), cancellable = true)
	private void slashclient$keepPinned(ServerData server, CallbackInfo ci) {
		if (PinnedServer.is(server)) ci.cancel();
	}

	// a pinned server keeps its name and address; only its resource pack setting can change
	@Inject(method = "replace", at = @At("HEAD"), cancellable = true)
	private void slashclient$noEditPinned(int index, ServerData server, CallbackInfo ci) {
		if (index >= 0 && index < serverList.size() && PinnedServer.is(serverList.get(index))) {
			serverList.get(index).setResourcePackStatus(server.getResourcePackStatus());
			ci.cancel();
		}
	}

	@Inject(method = "swap", at = @At("HEAD"), cancellable = true)
	private void slashclient$noMovePinned(int a, int b, CallbackInfo ci) {
		if (PinnedServer.blocksSwap(serverList, a, b)) ci.cancel();
	}
}
