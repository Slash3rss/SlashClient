package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.multiplayer.ServerSelectionList;
import net.minecraft.client.server.LanServer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** A LAN game the game found, for our server list. */
@Mixin(ServerSelectionList.NetworkServerEntry.class)
public interface NetworkServerEntryAccessor {
	@Accessor("serverData")
	LanServer slashclient$lan();
}
