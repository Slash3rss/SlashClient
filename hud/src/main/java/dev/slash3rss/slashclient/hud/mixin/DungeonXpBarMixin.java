package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.slash3rss.slashclient.hud.skyup.DungeonMap;
import net.minecraft.client.gui.components.BossHealthOverlay;
import net.minecraft.client.gui.components.LerpingBossEvent;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** The dungeon's boss bar shows its XP as a number: "Dungeon poz. 3 · 52/125 xp" (DungeonMap.withXp). */
@Mixin(BossHealthOverlay.class)
abstract class DungeonXpBarMixin {
	@WrapOperation(method = "extractRenderState", at = @At(value = "INVOKE",
		target = "Lnet/minecraft/client/gui/components/LerpingBossEvent;getName()Lnet/minecraft/network/chat/Component;"))
	private Component slashclient$dungeonXp(LerpingBossEvent event, Operation<Component> original) {
		Component name = original.call(event);
		return DungeonMap.withXp(name, event.getProgress());
	}
}
