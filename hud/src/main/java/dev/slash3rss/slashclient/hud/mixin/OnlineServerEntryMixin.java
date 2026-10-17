package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
//#if MC >= 26.3
import com.mojang.renderpearl.api.pipeline.RenderPipeline;
//#elif MC >= 1.21.6
//$ import com.mojang.blaze3d.pipeline.RenderPipeline;
//#endif
import dev.slash3rss.slashclient.hud.PinnedServer;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.multiplayer.ServerSelectionList;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Partner servers get their picture behind them. No move arrows that would move SkyUp.pl: none down on SkyUp.pl itself, none up on the
 * server right under it. Clicks and Shift+arrow keys go through swap(), stopped here too.
 */
@Mixin(ServerSelectionList.OnlineServerEntry.class)
abstract class OnlineServerEntryMixin {
	@Shadow @Final private JoinMultiplayerScreen screen;
	@Shadow @Final private ServerData serverData;

	private int slashclient$index() {
		ServerList servers = screen.getServers();
		for (int i = 0; i < servers.size(); i++) if (servers.get(i) == serverData) return i;
		return -1;
	}

	//#if MC >= 26.3
	@WrapOperation(method = "extractContent", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;blitSprite(Lcom/mojang/renderpearl/api/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIII)V"))
	//#elif MC >= 1.21.6
	//$ @WrapOperation(method = "extractContent", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;blitSprite(Lcom/mojang/blaze3d/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIII)V"))
	//#else
	//$ @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;blitSprite(Ljava/util/function/Function;Lnet/minecraft/resources/ResourceLocation;IIII)V"))
	//#endif
	//#if MC >= 1.21.6
	private void slashclient$hideArrows(GuiGraphicsExtractor g, RenderPipeline pipeline, Identifier sprite, int x, int y, int w, int h, Operation<Void> original) {
	//#else
	//$ private void slashclient$hideArrows(GuiGraphicsExtractor g, java.util.function.Function<Identifier, net.minecraft.client.renderer.RenderType> pipeline, Identifier sprite, int x, int y, int w, int h, Operation<Void> original) {
	//#endif
		String path = sprite.getPath();
		boolean up = path.contains("move_up");
		boolean down = path.contains("move_down");
		if (down && PinnedServer.is(serverData)) return;
		if (up && slashclient$index() == 1 && PinnedServer.is(screen.getServers().get(0))) return;
		original.call(g, pipeline, sprite, x, y, w, h);
	}

	/** A partner server's picture behind its row (PartnerServers), under the game's icon and text. */
	//#if MC >= 1.21.6
	@Inject(method = "extractContent", at = @At("HEAD"))
	private void slashclient$partnerBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, boolean hovered, float delta, CallbackInfo ci) {
		var entry = (ServerSelectionList.Entry) (Object) this;
		dev.slash3rss.slashclient.hud.PartnerServers.drawBehind(g, serverData, entry.getContentX(), entry.getContentY(), entry.getContentWidth(), entry.getContentHeight());
	}
	//#else
	//$ @Inject(method = "render", at = @At("HEAD"))
	//$ private void slashclient$partnerBackground(GuiGraphicsExtractor g, int index, int top, int left, int width, int height, int mouseX, int mouseY, boolean hovered, float delta, CallbackInfo ci) {
	//$ 	dev.slash3rss.slashclient.hud.PartnerServers.drawBehind(g, serverData, left, top, width, height);
	//$ }
	//#endif

	/** The "Partner" badge on top of the row. */
	//#if MC >= 1.21.6
	@Inject(method = "extractContent", at = @At("TAIL"))
	private void slashclient$partnerBadge(GuiGraphicsExtractor g, int mouseX, int mouseY, boolean hovered, float delta, CallbackInfo ci) {
		var entry = (ServerSelectionList.Entry) (Object) this;
		dev.slash3rss.slashclient.hud.PartnerServers.drawBadge(g, serverData, entry.getContentX(), entry.getContentY(), entry.getContentWidth(), entry.getContentHeight());
	}
	//#else
	//$ @Inject(method = "render", at = @At("TAIL"))
	//$ private void slashclient$partnerBadge(GuiGraphicsExtractor g, int index, int top, int left, int width, int height, int mouseX, int mouseY, boolean hovered, float delta, CallbackInfo ci) {
	//$ 	dev.slash3rss.slashclient.hud.PartnerServers.drawBadge(g, serverData, left, top, width, height);
	//$ }
	//#endif

	@Inject(method = "swap", at = @At("HEAD"), cancellable = true)
	private void slashclient$noMovePinned(int a, int b, CallbackInfo ci) {
		ServerList servers = screen.getServers();
		if ((a >= 0 && a < servers.size() && PinnedServer.is(servers.get(a))) || (b >= 0 && b < servers.size() && PinnedServer.is(servers.get(b)))) ci.cancel();
	}
}
