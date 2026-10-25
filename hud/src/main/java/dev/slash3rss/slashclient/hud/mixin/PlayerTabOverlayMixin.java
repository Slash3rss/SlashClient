package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.Badges;
import dev.slash3rss.slashclient.hud.GameHud;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.PlayerTabOverlay;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The SlashClient logo before the names of its players on the tab list, the ping as a number, and
 * the list as the player set it up: without the server's text above or below, with fewer players.
 */
@Mixin(PlayerTabOverlay.class)
abstract class PlayerTabOverlayMixin {
	@Shadow
	private Component header;
	@Shadow
	private Component footer;
	/** The server's texts while the list is drawn without them, put back after. */
	private Component slashclient$header, slashclient$footer;

	@Inject(method = "extractRenderState", at = @At("HEAD"))
	private void slashclient$hideTexts(CallbackInfo ci) {
		slashclient$header = header;
		slashclient$footer = footer;
		if (SlashHud.config == null) return;
		if (SlashHud.config.tabHideHeader) header = null;
		if (SlashHud.config.tabHideFooter) footer = null;
	}

	@Inject(method = "extractRenderState", at = @At("RETURN"))
	private void slashclient$restoreTexts(CallbackInfo ci) {
		header = slashclient$header;
		footer = slashclient$footer;
	}

	/** At most as many players as set (the first ones in the list's order). */
	@ModifyReturnValue(method = "getPlayerInfos", at = @At("RETURN"))
	private java.util.List<PlayerInfo> slashclient$fewer(java.util.List<PlayerInfo> list) {
		int max = SlashHud.config == null ? 80 : SlashHud.config.tabMaxPlayers;
		return max > 0 && list.size() > max ? list.subList(0, max) : list;
	}
	@ModifyReturnValue(method = "getNameForDisplay", at = @At("RETURN"))
	private Component slashclient$badge(Component name, PlayerInfo info) {
		return Badges.decorate(info.getProfile().id(), dev.slash3rss.slashclient.hud.NickHider.apply(name));
	}

	/** Milliseconds in the ping's colour instead of the signal bars (a little smaller, to fit their space). */
	@Inject(method = "extractPingIcon", at = @At("HEAD"), cancellable = true)
	private void slashclient$numericPing(GuiGraphicsExtractor g, int width, int x, int y, PlayerInfo info, CallbackInfo ci) {
		if (SlashHud.config == null || !SlashHud.config.tabNumericPing) return;
		int ms = info.getLatency();
		String text = String.valueOf(ms);
		var font = Minecraft.getInstance().font;
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x + width - 1 - font.width(text) * 0.75f, y + 1);
		pose.scale(0.75f, 0.75f);
		g.text(font, text, 0, 0, GameHud.pingColor(ms), true);
		pose.popMatrix();
		ci.cancel();
	}
}
