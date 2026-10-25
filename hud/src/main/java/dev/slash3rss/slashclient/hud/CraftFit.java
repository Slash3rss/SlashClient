package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.CraftingContainer;
import net.minecraft.world.inventory.ResultSlot;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

import java.util.ArrayList;
import java.util.List;

/**
 * Shift-clicking a crafting result crafts only as much as fits in the inventory with room left
 * for what stays on the crafting grid: closing the table then gives the leftovers back instead of
 * dropping them on the ground. It is done with the game's ordinary clicks (take the result, put it
 * down), as a player's hand would; when the game's own shift-click would come out the same, it is
 * left to the game.
 */
public final class CraftFit {
	private CraftFit() {}

	/** How many crafts the last shift-click made (for the test); -1 when it was left to the game. */
	static int lastCrafts = -1;

	public static void attach(AbstractContainerScreen<?> screen) {
		//#if MC >= 1.21.9
		net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents.allowMouseClick(screen).register((s, e) ->
			e.button() != com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT || !click(screen));
		//#else
		//$ net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents.allowMouseClick(screen).register((s, x, y, button) ->
		//$ 	button != com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT || !click(screen));
		//#endif
	}

	/** A left click over the window: true when it was a shift-click on the result and is handled here. */
	static boolean click(AbstractContainerScreen<?> screen) {
		Minecraft mc = Minecraft.getInstance();
		if (SlashHud.config == null || !SlashHud.config.craftFit || mc.player == null || !shiftDown(mc)) return false;
		Slot hovered = ((dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor) screen).slashclient$hoveredSlot();
		if (!(hovered instanceof ResultSlot) || !hovered.hasItem()) return false;
		return craft(mc, screen.getMenu(), hovered);
	}

	static boolean craft(Minecraft mc, AbstractContainerMenu menu, Slot result) {
		if (!menu.getCarried().isEmpty()) return false;
		ItemStack made = result.getItem().copy();
		int per = made.getCount();
		List<ItemStack> grid = new ArrayList<>();
		List<Slot> inv = new ArrayList<>();
		for (Slot s : menu.slots) {
			if (s.container instanceof CraftingContainer && s.hasItem()) grid.add(s.getItem().copy());
		}
		// where the game's shift-click puts the result: the hotbar's last slot first, then up through the inventory
		for (int i = menu.slots.size() - 1; i >= 0; i--) {
			Slot s = menu.slots.get(i);
			if (s.container instanceof Inventory && s.getContainerSlot() < 36) inv.add(s);
		}
		if (grid.isEmpty() || inv.isEmpty()) return false;
		int most = Integer.MAX_VALUE;
		for (ItemStack g : grid) most = Math.min(most, g.getCount());
		// the game's own shift-click: as many as fit, with nothing kept for the grid
		int game = 0;
		while (game < most && fits(inv, made, per * (game + 1), List.of())) game++;
		int crafts = game;
		while (crafts > 0 && !fits(inv, made, per * crafts, leftovers(grid, crafts))) crafts--;
		if (crafts == game) {
			lastCrafts = -1;
			return false;
		}
		lastCrafts = crafts;
		if (crafts == 0) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.craftFit.full"));
			return true;
		}
		// take the result into the hand as often as it holds, then put the hand down where the game would
		ItemStack[] slots = new ItemStack[inv.size()];
		for (int i = 0; i < slots.length; i++) slots[i] = inv.get(i).getItem().copy();
		int max = made.getMaxStackSize(), hand = 0;
		for (int n = 0; n < crafts; n++) {
			if (hand + per > max) hand = putDown(mc, menu, inv, slots, made, hand);
			Compat.containerClick(mc, mc.player, menu.containerId, result.index, 0, Compat.Click.PICKUP);
			hand += per;
		}
		putDown(mc, menu, inv, slots, made, hand);
		return true;
	}

	/** Puts `hand` of `made` into the inventory: onto the same first, then into empty slots. Returns what is left in hand (0). */
	private static int putDown(Minecraft mc, AbstractContainerMenu menu, List<Slot> inv, ItemStack[] slots, ItemStack made, int hand) {
		for (int pass = 0; pass < 2 && hand > 0; pass++) {
			for (int i = 0; i < slots.length && hand > 0; i++) {
				ItemStack there = slots[i];
				int room;
				if (pass == 0 && !there.isEmpty() && ItemStack.isSameItemSameComponents(there, made)) room = there.getMaxStackSize() - there.getCount();
				else if (pass == 1 && there.isEmpty()) room = made.getMaxStackSize();
				else continue;
				if (room <= 0) continue;
				int put = Math.min(room, hand);
				Compat.containerClick(mc, mc.player, menu.containerId, inv.get(i).index, 0, Compat.Click.PICKUP);
				slots[i] = withCount(made, there.isEmpty() ? put : there.getCount() + put);
				hand -= put;
			}
		}
		return hand;
	}

	/** What stays on the grid after `crafts` crafts (one of each slot per craft; a single item like a bucket leaves its remainder there). */
	private static List<ItemStack> leftovers(List<ItemStack> grid, int crafts) {
		List<ItemStack> out = new ArrayList<>();
		for (ItemStack g : grid) {
			if (g.getCount() > crafts) out.add(withCount(g, g.getCount() - crafts));
			else if (g.getMaxStackSize() == 1) out.add(withCount(g, 1));
		}
		return out;
	}

	/** Whether `count` of `made` and all of `also` fit into the inventory slots. */
	static boolean fits(List<Slot> inv, ItemStack made, int count, List<ItemStack> also) {
		ItemStack[] slots = new ItemStack[inv.size()];
		for (int i = 0; i < slots.length; i++) slots[i] = inv.get(i).getItem().copy();
		if (!place(slots, made, count)) return false;
		for (ItemStack a : also) if (!place(slots, a, a.getCount())) return false;
		return true;
	}

	private static boolean place(ItemStack[] slots, ItemStack kind, int count) {
		int max = kind.getMaxStackSize();
		for (int i = 0; i < slots.length && count > 0; i++) {
			ItemStack s = slots[i];
			if (s.isEmpty() || !ItemStack.isSameItemSameComponents(s, kind)) continue;
			int put = Math.min(max - s.getCount(), count);
			if (put <= 0) continue;
			slots[i] = withCount(s, s.getCount() + put);
			count -= put;
		}
		for (int i = 0; i < slots.length && count > 0; i++) {
			if (!slots[i].isEmpty()) continue;
			int put = Math.min(max, count);
			slots[i] = withCount(kind, put);
			count -= put;
		}
		return count <= 0;
	}

	private static ItemStack withCount(ItemStack stack, int count) {
		ItemStack out = stack.copy();
		out.setCount(count);
		return out;
	}

	private static boolean shiftDown(Minecraft mc) {
		//#if MC >= 1.21.9
		return mc.hasShiftDown();
		//#else
		//$ return net.minecraft.client.gui.screens.Screen.hasShiftDown();
		//#endif
	}
}
