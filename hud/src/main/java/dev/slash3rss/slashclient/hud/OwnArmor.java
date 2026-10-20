package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * Our own armour hidden on our own player, piece by piece, so the skin and SlashClient cosmetics
 * show (in F5, the inventory, the menus' figure in a world). Only the drawing on our side: the armour
 * is still worn and protects, and other players (and their models here) are never touched.
 *
 * From 1.21.4 the render state gets no armour for a hidden piece (OwnArmorMixin), so the armour
 * layer draws nothing and the cosmetics that give way to armour show as without it; before, the
 * armour and elytra layers skip it and the cosmetic layers ask {@link #shown} instead of the slot.
 * The elytra has its own switch: hidden, the cape (or SlashClient wings) takes its place.
 */
public final class OwnArmor {
	private OwnArmor() {}

	/** Whether `item` in `slot` of `entity` is left out of the picture. */
	public static boolean hidden(LivingEntity entity, EquipmentSlot slot, ItemStack item) {
		HudConfig c = SlashHud.config;
		if (c == null || !c.hideOwnArmor || item.isEmpty() || entity != Minecraft.getInstance().player) return false;
		return switch (slot) {
			case HEAD -> c.hideOwnHelmet;
			// an elytra sits in the chest slot but is not a chestplate
			case CHEST -> item.is(Items.ELYTRA) ? c.hideOwnElytra : c.hideOwnChestplate;
			case LEGS -> c.hideOwnLeggings;
			case FEET -> c.hideOwnBoots;
			default -> false;
		};
	}

	/** What `entity` wears in `slot` as far as drawing goes: nothing when it is hidden. */
	public static ItemStack shown(LivingEntity entity, EquipmentSlot slot) {
		ItemStack item = entity.getItemBySlot(slot);
		return hidden(entity, slot, item) ? ItemStack.EMPTY : item;
	}
}
