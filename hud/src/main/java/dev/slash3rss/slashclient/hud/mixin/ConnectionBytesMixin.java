package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ExtraModules;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelDuplexHandler;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelPromise;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.PacketFlow;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Counts the bytes of the game's own connection to a server: a handler at the front of the
 * pipeline sees them as they cross the socket (compressed and encrypted, the real traffic).
 */
@Mixin(Connection.class)
abstract class ConnectionBytesMixin {
	@Inject(method = "channelActive", at = @At("HEAD"))
	private void slashclient$countBytes(ChannelHandlerContext ctx, CallbackInfo ci) {
		Connection self = (Connection) (Object) this;
		// only the client's side: a LAN world's server connections are someone else's traffic
		if (self.getReceiving() != PacketFlow.CLIENTBOUND || ctx.pipeline().get("slashclient_bytes") != null) return;
		ctx.pipeline().addFirst("slashclient_bytes", new ChannelDuplexHandler() {
			@Override
			public void channelRead(ChannelHandlerContext c, Object msg) throws Exception {
				if (msg instanceof ByteBuf b) ExtraModules.Stats.bytesIn.addAndGet(b.readableBytes());
				super.channelRead(c, msg);
			}

			@Override
			public void write(ChannelHandlerContext c, Object msg, ChannelPromise promise) throws Exception {
				if (msg instanceof ByteBuf b) ExtraModules.Stats.bytesOut.addAndGet(b.readableBytes());
				super.write(c, msg, promise);
			}
		});
	}
}
