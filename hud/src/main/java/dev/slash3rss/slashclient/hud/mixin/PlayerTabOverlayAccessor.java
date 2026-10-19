package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.components.PlayerTabOverlay;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;

import java.util.List;

/** What the tab list shows, for the size of its box in the HUD editor. */
@Mixin(PlayerTabOverlay.class)
public interface PlayerTabOverlayAccessor {
	/** The players it lists, in its order (at most 80). */
	@Invoker("getPlayerInfos")
	List<PlayerInfo> slashclient$playerInfos();

	/** The server's text over the list, or null. */
	@Accessor("header")
	Component slashclient$header();

	/** The server's text under the list, or null. */
	@Accessor("footer")
	Component slashclient$footer();
}
