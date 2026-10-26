package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.servers.PinnedServer;
import dev.slash3rss.slashclient.hud.servers.ServerPacks;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.CycleButton;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ServerData;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Editing a server: the game's three-way "Server Resource Packs" button gets SlashClient's four
 * modes (ServerPacks), with a line under it saying what the chosen one does. Editing a pinned
 * partner server: its name and address stay as they are, the resource pack setting can change.
 */
//#if MC >= 1.21.9
@Mixin(net.minecraft.client.gui.screens.ManageServerScreen.class)
//#else
//$ @Mixin(net.minecraft.client.gui.screens.EditServerScreen.class)
//#endif
abstract class EditServerScreenMixin {
	@Shadow private EditBox nameEdit;
	@Shadow private EditBox ipEdit;
	@Shadow @Final private ServerData serverData;

	/** The chosen mode, kept while the screen is open (also over a resize, which builds it again). */
	@Unique private ServerPacks.Mode slashclient$packMode;
	@Unique private Button slashclient$packButton;
	/** Whether the line under the button fits before the next button. */
	@Unique private boolean slashclient$lineFits;

	@Inject(method = "init", at = @At("TAIL"))
	private void slashclient$lockPinned(CallbackInfo ci) {
		if (!PinnedServer.is(serverData)) return;
		nameEdit.setEditable(false);
		ipEdit.setEditable(false);
	}

	@Inject(method = "init", at = @At("TAIL"))
	private void slashclient$packModes(CallbackInfo ci) {
		Screen screen = (Screen) (Object) this;
		var widgets = Screens.getWidgets(screen);
		for (int i = 0; i < widgets.size(); i++) {
			if (!(widgets.get(i) instanceof CycleButton<?> old)) continue;
			if (slashclient$packMode == null) slashclient$packMode = ServerPacks.of(serverData);
			ServerPacks.Mode mode = slashclient$packMode;
			int w = old.getWidth();
			Button button = Button.builder(ServerPacks.buttonLabel(mode, w), b -> {
				slashclient$packMode = slashclient$packMode.next();
				// the game's own setting follows at once, as its button did ("ignore": asking)
				ServerPacks.setVanilla(serverData, slashclient$packMode);
				b.setMessage(ServerPacks.buttonLabel(slashclient$packMode, b.getWidth()));
				b.setTooltip(Tooltip.create(ServerPacks.hint(slashclient$packMode)));
			}).bounds(old.getX(), old.getY(), w, old.getHeight()).tooltip(Tooltip.create(ServerPacks.hint(mode))).build();
			// in its place, so the keyboard order stays the same
			widgets.set(i, button);
			slashclient$packButton = button;
			int below = old.getY() + old.getHeight();
			int next = Integer.MAX_VALUE;
			for (AbstractWidget other : widgets) if (other != button && other.getY() >= below) next = Math.min(next, other.getY());
			slashclient$lineFits = next - below >= 11;
			return;
		}
	}

	@Inject(method = "onAdd", at = @At("HEAD"))
	private void slashclient$savePackMode(CallbackInfo ci) {
		if (slashclient$packMode == null) return;
		ServerPacks.setVanilla(serverData, slashclient$packMode);
		ServerPacks.remember(serverData.ip, ipEdit.getValue(), slashclient$packMode);
	}

	@Inject(method = "extractRenderState", at = @At("TAIL"))
	private void slashclient$packLine(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta, CallbackInfo ci) {
		Button b = slashclient$packButton;
		if (b == null || !slashclient$lineFits || slashclient$packMode == null) return;
		Screen screen = (Screen) (Object) this;
		Ui.centered(g, Ui.fit(ServerPacks.line(slashclient$packMode), screen.width - 8), screen.width / 2, b.getY() + b.getHeight() + 2, ServerPacks.lineColor(slashclient$packMode));
	}
}
