package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.multiplayer.ServerSelectionList;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

import java.util.List;

/** The game's server list rows, which our list keeps (hidden) for their pings, icons and the LAN servers found. */
@Mixin(ServerSelectionList.class)
public interface ServerSelectionListAccessor {
	@Accessor("onlineServers")
	List<ServerSelectionList.OnlineServerEntry> slashclient$online();

	@Accessor("networkServers")
	List<ServerSelectionList.NetworkServerEntry> slashclient$lan();
}
