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
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The SlashClient logo before the names of its players on the tab list, and the ping as a number. */
@Mixin(PlayerTabOverlay.class)
abstract class PlayerTabOverlayMixin {
	@ModifyReturnValue(method = "getNameForDisplay", at = @At("RETURN"))
	private Component slashclient$badge(Component name, PlayerInfo info) {
		return Badges.decorate(info.getProfile().id(), name);
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
