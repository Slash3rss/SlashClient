package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ServerPacks;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.network.Connection;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.net.URL;

/**
 * A server's resource pack, answered by the mode chosen for that server (ServerPacks): "prompt" is
 * the game's own way; "accept" downloads and applies it without the prompt; "decline" refuses it;
 * "ignore" downloads nothing and tells the server it was accepted, downloaded and loaded; "keep" (and
 * SkyUp's pack) answers so too when the player's kept copy is current and on, else takes the pack
 * as "accept" while the copy is brought up to date (KeptPacks).
 */
//#if MC >= 1.20.3
@Mixin(net.minecraft.client.multiplayer.ClientCommonPacketListenerImpl.class)
//#else
//$ @Mixin(net.minecraft.client.multiplayer.ClientPacketListener.class)
//#endif
abstract class ResourcePackPushMixin {
	//#if MC >= 1.20.3
	@Shadow @Final protected Connection connection;
	@Shadow @Final protected ServerData serverData;

	@Shadow
	private static URL parseResourcePackUrl(String url) {
		throw new AssertionError();
	}

	// after the game has moved the packet to the main thread (on the network thread it only queues it)
	@Inject(method = "handleResourcePackPush", at = @At(value = "INVOKE", target = "Lnet/minecraft/network/protocol/PacketUtils;ensureRunningOnSameThread", shift = At.Shift.AFTER), cancellable = true)
	private void slashclient$packMode(net.minecraft.network.protocol.common.ClientboundResourcePackPushPacket packet, CallbackInfo ci) {
		ServerPacks.Mode mode = ServerPacks.forConnection(serverData);
		// the pack kept in the player's resource packs, current and switched on: nothing to download or ask
		if (dev.slash3rss.slashclient.hud.KeptPacks.covers(serverData, mode, packet.url(), packet.hash())) {
			ServerPacks.decided(ServerPacks.Mode.KEEP);
			slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.ACCEPTED);
			slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.DOWNLOADED);
			slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.SUCCESSFULLY_LOADED);
			ci.cancel();
			return;
		}
		// SkyUp, its copy not on: asked once whether to keep it "for good"; the answer decides this pack too
		if (dev.slash3rss.slashclient.hud.KeptPacks.askSkyUp(serverData, mode)) {
			ci.cancel();
			slashclient$askSkyUp(packet);
			return;
		}
		// SkyUp otherwise: its pack without the game's question (the copy is kept up to date beside it)
		if (mode == ServerPacks.Mode.PROMPT && dev.slash3rss.slashclient.hud.KeptPacks.skyUpWithoutPrompt(serverData)) mode = ServerPacks.Mode.ACCEPT;
		ServerPacks.decided(mode);
		switch (mode) {
			case PROMPT -> {}
			// kept, its copy not ready yet: this time as "accept"
			case ACCEPT, KEEP -> {
				if (slashclient$accept(packet)) ci.cancel();
			}
			case DECLINE -> {
				slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.DECLINED);
				ci.cancel();
			}
			case IGNORE -> {
				slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.ACCEPTED);
				slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.DOWNLOADED);
				slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.SUCCESSFULLY_LOADED);
				ci.cancel();
			}
		}
	}

	/** The pack downloaded and applied without the game's question; false for a broken address (the game answers that itself). */
	private boolean slashclient$accept(net.minecraft.network.protocol.common.ClientboundResourcePackPushPacket packet) {
		URL url = parseResourcePackUrl(packet.url());
		if (url == null) return false;
		var packs = Minecraft.getInstance().getDownloadedPackSource();
		packs.allowServerPacks();
		packs.pushPack(packet.id(), url, packet.hash());
		return true;
	}

	/** "Keep SkyUp's pack for good?": yes keeps it (the copy on from now), no takes the server's pack and does not ask again. */
	private void slashclient$askSkyUp(net.minecraft.network.protocol.common.ClientboundResourcePackPushPacket packet) {
		Minecraft mc = Minecraft.getInstance();
		var back = dev.slash3rss.slashclient.hud.Compat.screen(mc);
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.ConfirmScreen(yes -> {
			mc.setScreenAndShow(back);
			if (yes) {
				ServerPacks.keep(serverData);
				ServerPacks.decided(ServerPacks.Mode.KEEP);
				// the copy current: switched on and standing in now; else the server's pack this time, the copy on its way
				if (dev.slash3rss.slashclient.hud.KeptPacks.covers(serverData, ServerPacks.Mode.KEEP, packet.url(), packet.hash())) {
					slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.ACCEPTED);
					slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.DOWNLOADED);
					slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.SUCCESSFULLY_LOADED);
				} else if (!slashclient$accept(packet)) slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.INVALID_URL);
			} else {
				dev.slash3rss.slashclient.hud.SlashHud.config.skyPackAsked = true;
				dev.slash3rss.slashclient.hud.SlashHud.config.save();
				ServerPacks.decided(ServerPacks.Mode.ACCEPT);
				if (!slashclient$accept(packet)) slashclient$answer(packet.id(), net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action.INVALID_URL);
			}
		}, net.minecraft.network.chat.Component.translatable("slashclient-hud.skyPack.askTitle"), net.minecraft.network.chat.Component.translatable("slashclient-hud.skyPack.ask"),
			net.minecraft.network.chat.Component.translatable("slashclient-hud.skyPack.askYes"), net.minecraft.network.chat.Component.translatable("slashclient-hud.skyPack.askNo")));
	}

	private void slashclient$answer(java.util.UUID id, net.minecraft.network.protocol.common.ServerboundResourcePackPacket.Action action) {
		connection.send(new net.minecraft.network.protocol.common.ServerboundResourcePackPacket(id, action));
	}
	//#else
	//$ // 1.20.1: one pack at a time, answered on the network thread, no "downloaded" step yet
	//$ @Shadow @Final private ServerData serverData;
	//$
	//$ @Shadow
	//$ private static URL parseResourcePackUrl(String url) {
	//$ 	throw new AssertionError();
	//$ }
	//$
	//$ @Shadow
	//$ private void send(net.minecraft.network.protocol.game.ServerboundResourcePackPacket.Action action) {
	//$ 	throw new AssertionError();
	//$ }
	//$
	//$ @Shadow
	//$ private void downloadCallback(java.util.concurrent.CompletableFuture<?> future) {
	//$ 	throw new AssertionError();
	//$ }
	//$
	//$ @Inject(method = "handleResourcePack", at = @At("HEAD"), cancellable = true)
	//$ private void slashclient$packMode(net.minecraft.network.protocol.game.ClientboundResourcePackPacket packet, CallbackInfo ci) {
	//$ 	ServerPacks.Mode mode = ServerPacks.forConnection(serverData);
	//$ 	ServerPacks.decided(mode);
	//$ 	switch (mode) {
	//$ 		case PROMPT -> {}
	//$ 		case ACCEPT, KEEP -> {
	//$ 			URL url = parseResourcePackUrl(packet.getUrl());
	//$ 			if (url == null) return;
	//$ 			send(net.minecraft.network.protocol.game.ServerboundResourcePackPacket.Action.ACCEPTED);
	//$ 			downloadCallback(Minecraft.getInstance().getDownloadedPackSource().downloadAndSelectResourcePack(url, packet.getHash(), true));
	//$ 			ci.cancel();
	//$ 		}
	//$ 		case DECLINE -> {
	//$ 			send(net.minecraft.network.protocol.game.ServerboundResourcePackPacket.Action.DECLINED);
	//$ 			ci.cancel();
	//$ 		}
	//$ 		case IGNORE -> {
	//$ 			send(net.minecraft.network.protocol.game.ServerboundResourcePackPacket.Action.ACCEPTED);
	//$ 			send(net.minecraft.network.protocol.game.ServerboundResourcePackPacket.Action.SUCCESSFULLY_LOADED);
	//$ 			ci.cancel();
	//$ 		}
	//$ 	}
	//$ }
	//#endif
}
