package dev.slash3rss.slashclient.hud.mixin;

import io.netty.channel.Channel;
import net.minecraft.network.Connection;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** The socket of a connection, for counting the bytes of the server you play on. */
@Mixin(Connection.class)
public interface ConnectionAccessor {
	@Accessor("channel")
	Channel slashclient$channel();
}
