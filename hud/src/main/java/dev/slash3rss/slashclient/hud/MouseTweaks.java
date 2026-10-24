package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

import java.util.HashSet;
import java.util.Set;

/**
 * Mouse tweaks in inventories, in the spirit of the Mouse Tweaks mod:
 * - Shift held with the left button dragged over slots moves each one, as a Shift-click would;
 * - the wheel over a slot moves one item: down sends one to the other side (the chest, or between
 *   hotbar and backpack in the player's own inventory), up brings one of the same from there.
 * Everything is done with the game's ordinary clicks, so servers see nothing unusual.
 */
public final class MouseTweaks {
	private MouseTweaks() {}

	/** Slots already passed in this drag (the first one moved with the game's own Shift-click). */
	private static final Set<Slot> dragged = new HashSet<>();
	private static boolean dragging;
	/**
	 * The left button held down over the window. Followed here because since 26.1 the game does not
	 * mark the button as held when a window takes the click, so its own flag stays off all drag long.
	 */
	private static boolean leftHeld;
	/** Where the mouse was in the last frame of the drag (window pixels), to cover the way since. */
	private static double lastX, lastY;

	private static boolean on() {
		return SlashHud.config != null && SlashHud.config.mouseTweaks;
	}

	/** On every inventory window: the button followed, the drag every frame, the wheel. */
	public static void attach(AbstractContainerScreen<?> screen) {
		//#if MC >= 1.21.9
		ScreenMouseEvents.beforeMouseClick(screen).register((s, e) -> pressed(screen, e.button(), e.x(), e.y()));
		ScreenMouseEvents.beforeMouseRelease(screen).register((s, e) -> released(e.button()));
		//#else
		//$ ScreenMouseEvents.beforeMouseClick(screen).register((s, x, y, button) -> pressed(screen, button, x, y));
		//$ ScreenMouseEvents.beforeMouseRelease(screen).register((s, x, y, button) -> released(button));
		//#endif
		ScreenEvents.afterExtract(screen).register((s, g, mx, my, delta) -> frame(screen, mx, my));
		ScreenMouseEvents.allowMouseScroll(screen).register((s, mx, my, h, v) -> !scroll(screen, v));
		ScreenEvents.remove(screen).register(s -> {
			leftHeld = false;
			stop();
		});
	}

	private static void pressed(AbstractContainerScreen<?> screen, int button, double x, double y) {
		if (button != InputConstants.MOUSE_BUTTON_LEFT) return;
		leftHeld = true;
		stop();
		Minecraft mc = Minecraft.getInstance();
		if (!on() || creative(screen) || !shiftDown(mc) || !screen.getMenu().getCarried().isEmpty()) return;
		// the press itself is the game's Shift-click on this slot; the drag goes on from here
		start(screen, x, y);
	}

	private static void released(int button) {
		if (button != InputConstants.MOUSE_BUTTON_LEFT) return;
		leftHeld = false;
		stop();
	}

	private static void start(AbstractContainerScreen<?> screen, double x, double y) {
		dragging = true;
		dragged.clear();
		lastX = x;
		lastY = y;
		Slot slot = slotAt(screen, x, y);
		if (slot != null) dragged.add(slot);
	}

	private static void stop() {
		dragging = false;
		dragged.clear();
	}

	/** The slot drawn at a point of the window, as the game finds the one under the mouse. */
	private static Slot slotAt(AbstractContainerScreen<?> screen, double x, double y) {
		ContainerScreenAccessor at = (ContainerScreenAccessor) screen;
		double px = x - at.slashclient$leftPos(), py = y - at.slashclient$topPos();
		for (Slot s : screen.getMenu().slots) {
			if (s.isActive() && px >= s.x - 1 && px < s.x + 17 && py >= s.y - 1 && py < s.y + 17) return s;
		}
		return null;
	}

	/**
	 * The creative inventory is left to the game: its tabs are an endless source and its clicks
	 * work apart from the server's, so moving "to the other side" there threw items away.
	 */
	private static boolean creative(AbstractContainerScreen<?> screen) {
		return screen instanceof net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
	}

	/**
	 * Every frame of an inventory screen: the Shift-drag. Each slot on the way from the last frame's
	 * point is moved once, so a quick sweep (or a slow game) does not skip any.
	 */
	private static void frame(AbstractContainerScreen<?> screen, int mx, int my) {
		Minecraft mc = Minecraft.getInstance();
		if (!on() || mc.player == null || mc.gameMode == null || creative(screen)) return;
		if (!leftHeld || !shiftDown(mc) || !screen.getMenu().getCarried().isEmpty()) {
			stop();
			return;
		}
		if (!dragging) {
			// Shift pressed with the button already down: from here on, this slot left as it is
			start(screen, mx, my);
			return;
		}
		double dx = mx - lastX, dy = my - lastY;
		int steps = Math.max(1, (int) Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
		for (int i = 1; i <= steps; i++) {
			Slot slot = slotAt(screen, lastX + dx * i / steps, lastY + dy * i / steps);
			// each slot once a drag: what was moved into one already passed is not sent back
			if (slot == null || !dragged.add(slot) || !slot.hasItem()) continue;
			Compat.containerClick(mc, mc.player, screen.getMenu().containerId, slot.index, 0, Compat.Click.QUICK_MOVE);
		}
		lastX = mx;
		lastY = my;
	}

	/** The wheel over an inventory screen; true when it moved something (the game should not scroll then). */
	public static boolean scroll(AbstractContainerScreen<?> screen, double amount) {
		Minecraft mc = Minecraft.getInstance();
		if (!on() || amount == 0 || mc.player == null || mc.gameMode == null || creative(screen)) return false;
		AbstractContainerMenu menu = screen.getMenu();
		Slot slot = ((ContainerScreenAccessor) screen).slashclient$hoveredSlot();
		if (slot == null || !menu.getCarried().isEmpty() || !slot.hasItem()) return false;
		int side = side(menu, slot);
		if (side < 0) return false;
		ItemStack kind = slot.getItem();
		if (amount < 0) {
			// down: one of these to the other side
			Slot to = target(menu, side, kind);
			if (to == null) return false;
			moveOne(mc, menu, slot, to);
		} else {
			// up: one of the same from the other side, when this stack has room
			if (kind.getCount() >= Math.min(kind.getMaxStackSize(), slot.getMaxStackSize(kind))) return false;
			Slot from = source(menu, side, kind);
			if (from == null) return false;
			moveOne(mc, menu, from, slot);
		}
		return true;
	}

	/** Takes the stack, puts one down on `to` (a right-click), and puts the rest back. */
	private static void moveOne(Minecraft mc, AbstractContainerMenu menu, Slot from, Slot to) {
		int id = menu.containerId;
		Compat.containerClick(mc, mc.player, id, from.index, 0, Compat.Click.PICKUP);
		Compat.containerClick(mc, mc.player, id, to.index, 1, Compat.Click.PICKUP);
		Compat.containerClick(mc, mc.player, id, from.index, 0, Compat.Click.PICKUP);
	}

	/**
	 * Which side of the screen a slot is on: in a chest-like screen the container (0) or the player's
	 * inventory (1); in the player's own inventory the hotbar (0) or the backpack (1). -1: neither
	 * (armour, crafting, results), which the wheel leaves alone.
	 */
	private static int side(AbstractContainerMenu menu, Slot slot) {
		boolean player = slot.container instanceof Inventory;
		if (menu instanceof InventoryMenu) {
			if (!player) return -1;
			int i = slot.getContainerSlot();
			return i < 9 ? 0 : i < 36 ? 1 : -1;
		}
		if (!player) return 0;
		return slot.getContainerSlot() < 36 ? 1 : -1;
	}

	/** A slot on the other side that takes one more of `kind`: a stack of the same first, then an empty one. */
	private static Slot target(AbstractContainerMenu menu, int side, ItemStack kind) {
		Slot empty = null;
		for (Slot s : menu.slots) {
			if (side(menu, s) != 1 - side || !s.mayPlace(kind)) continue;
			ItemStack there = s.getItem();
			if (there.isEmpty()) {
				if (empty == null) empty = s;
			} else if (ItemStack.isSameItemSameComponents(there, kind) && there.getCount() < Math.min(there.getMaxStackSize(), s.getMaxStackSize(there))) {
				return s;
			}
		}
		return empty;
	}

	/** A slot on the other side holding the same, to take one from. */
	private static Slot source(AbstractContainerMenu menu, int side, ItemStack kind) {
		for (Slot s : menu.slots) {
			if (side(menu, s) == 1 - side && s.hasItem() && s.mayPickup(Minecraft.getInstance().player) && ItemStack.isSameItemSameComponents(s.getItem(), kind)) return s;
		}
		return null;
	}

	private static boolean shiftDown(Minecraft mc) {
		//#if MC >= 1.21.9
		return mc.hasShiftDown();
		//#else
		//$ return net.minecraft.client.gui.screens.Screen.hasShiftDown();
		//#endif
	}
}
