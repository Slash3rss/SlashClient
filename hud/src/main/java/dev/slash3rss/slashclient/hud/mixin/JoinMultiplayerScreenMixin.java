package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.PinnedServer;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.multiplayer.ServerSelectionList;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** "Delete" is greyed out while SkyUp.pl is selected. */
@Mixin(JoinMultiplayerScreen.class)
abstract class JoinMultiplayerScreenMixin {
	@Shadow private Button deleteButton;
	@Shadow protected ServerSelectionList serverSelectionList;

	@Inject(method = "onSelectedChange", at = @At("TAIL"))
	private void slashclient$noDeletePinned(CallbackInfo ci) {
		if (deleteButton != null && serverSelectionList.getSelected() instanceof ServerSelectionList.OnlineServerEntry entry && PinnedServer.is(entry.getServerData())) deleteButton.active = false;
	}
}
