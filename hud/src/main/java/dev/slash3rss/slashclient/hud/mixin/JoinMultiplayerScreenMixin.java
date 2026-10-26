package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.servers.PinnedServer;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.multiplayer.ServerSelectionList;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** "Delete" is greyed out while a pinned partner server is selected ("Edit" only lets its resource pack setting change). */
@Mixin(JoinMultiplayerScreen.class)
abstract class JoinMultiplayerScreenMixin {
	@Shadow private Button deleteButton;
	@Shadow private Button editButton;
	@Shadow protected ServerSelectionList serverSelectionList;

	@Inject(method = "onSelectedChange", at = @At("TAIL"))
	private void slashclient$noDeletePinned(CallbackInfo ci) {
		if (serverSelectionList.getSelected() instanceof ServerSelectionList.OnlineServerEntry entry && PinnedServer.is(entry.getServerData())) {
			if (deleteButton != null) deleteButton.active = false;
		}
	}
}
