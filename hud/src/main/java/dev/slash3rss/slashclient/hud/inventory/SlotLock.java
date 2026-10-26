package dev.slash3rss.slashclient.hud.inventory;

import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Locked hotbar slots: what lies in one stays there. Q (and Ctrl+Q) in the world, the offhand key,
 * and in inventories throwing, picking up, Shift-clicking, number keys and the offhand key on it
 * are stopped before the game sends them, the same way DropGuard stops the drop key. The lock key
 * (K) switches the slot in hand, or in an inventory the hotbar slot under the mouse; a small lock
 * marks locked slots on the hotbar and in inventories. The creative inventory is left alone: its
 * clicks do not go through the server's container clicks.
 */
public final class SlotLock {
	private SlotLock() {}

	public static KeyMapping key;
	private static final long FLASH_MS = 450;
	/** When a click on each hotbar slot was last stopped: it flashes red for a moment. */
	private static final long[] stoppedAt = new long[9];

	private static boolean on() {
		return SlashHud.config != null && SlashHud.config.slotLock;
	}

	public static boolean locked(int hotbar) {
		return on() && hotbar >= 0 && hotbar < 9 && (SlashHud.config.lockedSlots >> hotbar & 1) != 0;
	}

	/** Locks or unlocks a hotbar slot, saying so above the hotbar. */
	public static void toggle(Minecraft mc, int hotbar) {
		if (!on() || hotbar < 0 || hotbar > 8) return;
		SlashHud.config.lockedSlots ^= 1 << hotbar;
		SlashHud.config.save();
		boolean now = locked(hotbar);
		Compat.overlay(mc, Component.translatable(now ? "slashclient-hud.slotLock.locked" : "slashclient-hud.slotLock.unlocked", hotbar + 1));
	}

	/** The hotbar slot a menu's slot is, or -1. */
	private static int hotbarOf(Slot slot) {
		return slot != null && slot.container instanceof Inventory && slot.getContainerSlot() < 9 ? slot.getContainerSlot() : -1;
	}

	// ---------- in the world ----------

	/**
	 * At the start of each tick, before the game reads its keys: the drop and offhand keys on a
	 * locked slot in hand are swallowed. True when they were (drop protection has nothing to ask then).
	 */
	static boolean tick(Minecraft mc) {
		if (!on() || mc.player == null || Compat.screen(mc) != null) return false;
		int slot = mc.player.getInventory().getSelectedSlot();
		if (!locked(slot) || mc.player.getMainHandItem().isEmpty()) return false;
		boolean pressed = false;
		while (mc.options.keyDrop.consumeClick()) pressed = true;
		while (mc.options.keySwapOffhand.consumeClick()) pressed = true;
		if (pressed) stopped(mc, slot);
		return true;
	}

	/** The lock key in the world: the slot in hand. */
	public static void keyTick(Minecraft mc) {
		if (key == null) return;
		while (key.consumeClick()) {
			if (mc.player != null && Compat.screen(mc) == null) toggle(mc, mc.player.getInventory().getSelectedSlot());
		}
	}

	private static void stopped(Minecraft mc, int hotbar) {
		stoppedAt[hotbar] = System.currentTimeMillis();
		Compat.overlay(mc, Component.translatable("slashclient-hud.slotLock.stopped", hotbar + 1));
	}

	// ---------- clicks in inventories ----------

	/**
	 * Whether a click the game is about to send would take something out of a locked slot or swap
	 * it for something else: any click on it, a number key that swaps with it, and a double click
	 * gathering items like the ones it holds. An empty locked slot may be filled; cloning (creative
	 * middle click) is harmless.
	 */
	public static boolean blocks(Player player, int containerId, int slotId, int button, String kind) {
		if (!on() || player == null || SlashHud.config.lockedSlots == 0 || "CLONE".equals(kind)) return false;
		AbstractContainerMenu menu = player.containerMenu;
		if (menu == null || menu.containerId != containerId) return false;
		Slot slot = slotId >= 0 && slotId < menu.slots.size() ? menu.slots.get(slotId) : null;
		int hotbar = hotbarOf(slot);
		// an empty locked slot may be filled (the refill puts the next stack there)
		int stop = locked(hotbar) && slot.hasItem() ? hotbar : -1;
		if (stop < 0 && "SWAP".equals(kind) && locked(button) && !player.getInventory().getItem(button).isEmpty()) stop = button;
		if (stop < 0 && "PICKUP_ALL".equals(kind)) {
			ItemStack carried = menu.getCarried();
			for (Slot s : menu.slots) {
				int h = hotbarOf(s);
				if (locked(h) && !carried.isEmpty() && ItemStack.isSameItemSameComponents(s.getItem(), carried)) {
					stop = h;
					break;
				}
			}
		}
		if (stop < 0) return false;
		stopped(Minecraft.getInstance(), stop);
		return true;
	}

	// ---------- in inventory screens ----------

	public static void attach(AbstractContainerScreen<?> screen) {
		if (screen instanceof net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen) return;
		ContainerLayer.under(screen, (g, mx, my) -> drawSlots(screen, g));
		//#if MC >= 1.21.9
		net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, e) -> !(key != null && key.matches(e) && toggleHovered(screen)));
		//#else
		//$ net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, k, scancode, mods) -> !(key != null && key.matches(k, scancode) && toggleHovered(screen)));
		//#endif
	}

	/** The lock key over a hotbar slot in an inventory; false when the mouse is over no hotbar slot. */
	public static boolean toggleHovered(AbstractContainerScreen<?> screen) {
		if (!on()) return false;
		int hotbar = hotbarOf(((ContainerScreenAccessor) screen).slashclient$hoveredSlot());
		if (hotbar < 0) return false;
		toggle(Minecraft.getInstance(), hotbar);
		return true;
	}

	private static void drawSlots(AbstractContainerScreen<?> screen, GuiGraphicsExtractor g) {
		if (!on() || SlashHud.config.lockedSlots == 0) return;
		ContainerScreenAccessor at = (ContainerScreenAccessor) screen;
		long now = System.currentTimeMillis();
		InventorySearch.raise(g, true);
		for (Slot slot : screen.getMenu().slots) {
			int hotbar = hotbarOf(slot);
			if (!locked(hotbar) || !slot.isActive()) continue;
			int x = at.slashclient$leftPos() + slot.x, y = at.slashclient$topPos() + slot.y;
			if (now - stoppedAt[hotbar] < FLASH_MS) g.fill(x, y, x + 16, y + 16, 0x80EF4444);
			lock(g, x + 10, y - 1);
		}
		InventorySearch.raise(g, false);
	}

	/** A small padlock with a dark shadow, so it reads on any item. */
	private static void lock(GuiGraphicsExtractor g, int x, int y) {
		Ui.icon(g, "lock", x + 1, y + 1, 7, 0xE0000000);
		Ui.icon(g, "lock", x, y, 7, 0xFFFACC15);
	}

	/** On the HUD: the locks over the hotbar's slots. */
	public static void drawHotbar(GuiGraphicsExtractor g, Minecraft mc) {
		if (!on() || SlashHud.config.lockedSlots == 0 || mc.player == null || mc.player.isSpectator()) return;
		long now = System.currentTimeMillis();
		for (int i = 0; i < 9; i++) {
			if (!locked(i)) continue;
			int x = g.guiWidth() / 2 - 90 + i * 20 + 2, y = g.guiHeight() - 16 - 3;
			if (now - stoppedAt[i] < FLASH_MS) g.fill(x, y, x + 16, y + 16, 0x80EF4444);
			lock(g, x + 10, y - 2);
		}
	}
}
