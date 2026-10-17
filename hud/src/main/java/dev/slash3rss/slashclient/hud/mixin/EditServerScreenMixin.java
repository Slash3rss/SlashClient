package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.PinnedServer;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.multiplayer.ServerData;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Editing a pinned partner server: its name and address stay as they are, the resource pack setting can change. */
//#if MC >= 1.21.9
@Mixin(net.minecraft.client.gui.screens.ManageServerScreen.class)
//#else
//$ @Mixin(net.minecraft.client.gui.screens.EditServerScreen.class)
//#endif
abstract class EditServerScreenMixin {
	@Shadow private EditBox nameEdit;
	@Shadow private EditBox ipEdit;
	@Shadow @Final private ServerData serverData;

	@Inject(method = "init", at = @At("TAIL"))
	private void slashclient$lockPinned(CallbackInfo ci) {
		if (!PinnedServer.is(serverData)) return;
		nameEdit.setEditable(false);
		ipEdit.setEditable(false);
	}
}
