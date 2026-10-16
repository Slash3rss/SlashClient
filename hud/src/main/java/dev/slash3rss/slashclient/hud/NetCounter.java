package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.mixin.ConnectionAccessor;
import io.netty.buffer.ByteBuf;
import io.netty.channel.Channel;
import io.netty.channel.ChannelDuplexHandler;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelPromise;
import net.minecraft.network.Connection;

/**
 * Counts the bytes of the connection to the server you play on, for the network module. It
 * is added when you join, so the server list's pings (other connections) are not counted;
 * at the front of the pipeline it sees the real traffic, compressed and encrypted.
 */
final class NetCounter {
	private NetCounter() {}

	private static final String NAME = "slashclient_bytes";

	static void attach(Connection connection) {
		Channel channel = ((ConnectionAccessor) connection).slashclient$channel();
		if (channel == null || channel.pipeline().get(NAME) != null) return;
		channel.pipeline().addFirst(NAME, new ChannelDuplexHandler() {
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
