package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.block.ShulkerBoxBlock;

/**
 * Drop prevention: Q does not throw away a valuable item in your hand (a tool, weapon or armour,
 * anything enchanted or rare, a shulker box) at the first press; a second press within a moment
 * drops it. The drop key's presses are taken before the game handles them, the same in every version.
 * Locked hotbar slots (SlotLock) go further: nothing drops from them at all.
 */
final class DropGuard {
	private DropGuard() {}

	private static final long AGAIN_MS = 1500;
	private static long armedAt;
	private static int armedSlot = -1;

	/** At the start of each tick, before the game reads the drop key. */
	static void tick(Minecraft mc) {
		// a locked hotbar slot (SlotLock) never drops at all
		if (SlotLock.tick(mc)) return;
		if (SlashHud.config == null || !SlashHud.config.dropGuard || mc.player == null || Compat.screen(mc) != null) return;
		ItemStack held = mc.player.getMainHandItem();
		if (!valuable(held)) return;
		int slot = mc.player.getInventory().getSelectedSlot();
		long now = System.currentTimeMillis();
		// pressed again in time: this press is the game's, and the item goes
		if (slot == armedSlot && now - armedAt < AGAIN_MS) return;
		boolean pressed = false;
		while (mc.options.keyDrop.consumeClick()) pressed = true;
		if (!pressed) return;
		armedAt = now;
		armedSlot = slot;
		Compat.overlay(mc, Component.translatable("slashclient-hud.dropGuard.again", held.getHoverName()));
	}

	static boolean valuable(ItemStack stack) {
		if (stack.isEmpty()) return false;
		if (stack.isDamageableItem() || stack.isEnchanted() || stack.getRarity() != Rarity.COMMON) return true;
		return stack.getItem() instanceof BlockItem block && block.getBlock() instanceof ShulkerBoxBlock;
	}
}
