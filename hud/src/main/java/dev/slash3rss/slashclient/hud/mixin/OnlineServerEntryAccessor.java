package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.FaviconTexture;
import net.minecraft.client.gui.screens.multiplayer.ServerSelectionList;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** A server row's icon, as the game uploaded it from the server's answer. */
@Mixin(ServerSelectionList.OnlineServerEntry.class)
public interface OnlineServerEntryAccessor {
	@Accessor("icon")
	FaviconTexture slashclient$icon();
}
