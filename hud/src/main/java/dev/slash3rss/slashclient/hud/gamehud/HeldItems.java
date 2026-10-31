package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ShieldItem;

/**
 * Items held in first person: a shield lower, and any item smaller and moved (mixin.HeldItemsMixin).
 * Applied right before the item itself is drawn, after the game has placed it in the hand, so it
 * shrinks around the hand and moves with it (swinging, eating and blocking stay the game's).
 */
public final class HeldItems {
	private HeldItems() {}

	/** How many items were drawn changed (for the tests). */
	public static int changed;

	public static void apply(PoseStack pose, InteractionHand hand, ItemStack stack) {
		HudConfig c = SlashHud.config;
		if (c == null || stack == null) return;
		boolean shield = c.lowShield && stack.getItem() instanceof ShieldItem;
		if (!shield && !c.heldItems) return;
		changed++;
		if (shield) pose.translate(0f, -c.lowShieldAmount / 100f, 0f);
		if (c.heldItems) {
			// sideways is outwards for both hands
			var player = Minecraft.getInstance().player;
			HumanoidArm main = player == null ? HumanoidArm.RIGHT : player.getMainArm();
			HumanoidArm arm = hand == InteractionHand.MAIN_HAND ? main : main.getOpposite();
			float side = arm == HumanoidArm.RIGHT ? 1f : -1f;
			pose.translate(side * c.heldItemX / 100f, c.heldItemY / 100f, -c.heldItemZ / 100f);
			float s = Math.max(0.1f, Math.min(1.5f, c.heldItemScale));
			pose.scale(s, s, s);
		}
	}
}
