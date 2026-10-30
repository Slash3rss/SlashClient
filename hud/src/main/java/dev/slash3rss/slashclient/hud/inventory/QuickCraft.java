package dev.slash3rss.slashclient.hud.inventory;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.CraftingMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.inventory.StonecutterMenu;
import net.minecraft.world.item.ItemStack;

/**
 * One-click crafting: a recipe clicked in the recipe book (the inventory's or a crafting table's) is
 * crafted at once, the result taken into the inventory as a shift-click on it would; with Shift the
 * book puts a stack's worth on the grid and all of it is crafted. A variant picked in a stonecutter
 * is cut the same way (one, or with Shift the whole input). With the drop key held the result is
 * thrown on the ground instead. Alt (and Ctrl, when set) or the module's own key held turn it off for
 * that click, so the book only lays out the ingredients as usual. "Repeat" crafts the last recipe
 * again, over and over while held.
 *
 * The game only asks the server to lay out the recipe (MultiPlayerGameMode.handlePlaceRecipe, the
 * stonecutter's button); the result is taken once the server has answered with the window's slots
 * (QuickCraftPacketMixin), so a result left from before is never taken by mistake.
 */
public final class QuickCraft {
	private QuickCraft() {}

	public static KeyMapping pauseKey, repeatKey;
	/** How long to wait for the server's answer before giving up (ticks). */
	private static final int TIMEOUT = 40;

	/** The last recipe laid out from the book (the game's own object), its window and whether it was a stack's worth. */
	private static Object lastRecipe;
	private static int lastContainer = -1;
	private static boolean lastShift;

	/** A craft waiting for the server: its window, the result slot, how many and where, and whether slots have come since. */
	private static int pendingContainer = -1, pendingSlot, waited, freshTicks = -1;
	private static boolean pendingAll, pendingDrop;
	/** Crafts done (for the test). */
	static int crafted;

	public static void register(KeyMapping.Category category) {
		pauseKey = net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.quickCraftPause", InputConstants.UNKNOWN.getValue(), category));
		repeatKey = net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.quickCraftRepeat", InputConstants.UNKNOWN.getValue(), category));
	}

	/** On now: switched on, and no key held that turns it off for this click. */
	static boolean active(Minecraft mc) {
		var c = SlashHud.config;
		if (c == null || !c.quickCraft || mc.player == null) return false;
		if (c.quickCraftAlt && altDown(mc) || c.quickCraftCtrl && controlDown(mc)) return false;
		return !down(mc, pauseKey);
	}

	/** The window's result slot this works with: the crafting grid's, the stonecutter's; -1 for any other window (a furnace's result takes time). */
	static int resultSlot(AbstractContainerMenu menu) {
		if (menu instanceof CraftingMenu || menu instanceof InventoryMenu) return 0;
		if (menu instanceof StonecutterMenu) return StonecutterMenu.RESULT_SLOT;
		return -1;
	}

	// ---------- the game's requests (QuickCraftMixin) ----------

	/** The recipe book asked the server to lay out a recipe in a window. */
	public static void placed(int containerId, Object recipe, boolean all) {
		lastRecipe = recipe;
		lastContainer = containerId;
		lastShift = all;
		Minecraft mc = Minecraft.getInstance();
		if (!active(mc)) return;
		AbstractContainerMenu menu = mc.player.containerMenu;
		if (menu.containerId != containerId || resultSlot(menu) != 0) return;
		start(mc, containerId, 0, all);
	}

	/** A window's button pressed: in a stonecutter, a variant picked. */
	public static void buttonClicked(int containerId) {
		Minecraft mc = Minecraft.getInstance();
		if (!active(mc)) return;
		AbstractContainerMenu menu = mc.player.containerMenu;
		if (menu.containerId != containerId || !(menu instanceof StonecutterMenu)) return;
		start(mc, containerId, StonecutterMenu.RESULT_SLOT, shiftDown(mc));
	}

	private static void start(Minecraft mc, int containerId, int slot, boolean all) {
		pendingContainer = containerId;
		pendingSlot = slot;
		pendingAll = all;
		pendingDrop = SlashHud.config.quickCraftDrop && down(mc, mc.options.keyDrop);
		waited = 0;
		freshTicks = -1;
	}

	/** The server sent a window's slots (QuickCraftPacketMixin): the grid and its result are as the server has them. */
	public static void arrived(int containerId) {
		if (containerId == pendingContainer && freshTicks < 0) freshTicks = 0;
	}

	// ---------- every tick ----------

	public static void tick(Minecraft mc) {
		Player player = mc.player;
		if (player == null) {
			pendingContainer = -1;
			return;
		}
		AbstractContainerMenu menu = player.containerMenu;
		if (pendingContainer >= 0) {
			if (menu.containerId != pendingContainer || ++waited > TIMEOUT) {
				pendingContainer = -1;
				return;
			}
			// one tick after the first slots came, so the result in the same answer is in too
			if (freshTicks < 0 || freshTicks++ < 1) return;
			Slot result = menu.getSlot(pendingSlot);
			if (!result.hasItem() || !menu.getCarried().isEmpty()) {
				if (freshTicks > 6) pendingContainer = -1;
				return;
			}
			take(mc, player, menu, result);
			pendingContainer = -1;
			return;
		}
		// "Repeat": the last recipe again in the same window, every time the last one is done
		if (lastRecipe != null && menu.containerId == lastContainer && Compat.screen(mc) != null && down(mc, repeatKey) && active(mc)) {
			place(mc, lastContainer, lastRecipe, lastShift);
		}
	}

	/** The result taken: into the inventory (all, or one for a stonecutter without Shift), or thrown with the drop key. */
	private static void take(Minecraft mc, Player player, AbstractContainerMenu menu, Slot result) {
		int id = menu.containerId;
		if (pendingDrop) {
			click(mc, player, id, result.index, pendingAll ? 1 : 0, Kind.THROW);
		} else if (pendingAll || pendingSlot == 0) {
			// the grid holds as much as is to be crafted: a shift-click on the result crafts exactly that
			click(mc, player, id, result.index, 0, Kind.QUICK_MOVE);
		} else {
			// a stonecutter: a shift-click would cut the whole input, so one is taken and put down in the inventory
			ItemStack made = result.getItem().copy();
			int to = place(menu, made);
			if (to < 0) return;
			click(mc, player, id, result.index, 0, Kind.PICKUP);
			click(mc, player, id, to, 0, Kind.PICKUP);
		}
		crafted++;
	}

	/** The inventory slot (of this window) where the stack goes: one with the same item and room, else an empty one; -1 when full. */
	private static int place(AbstractContainerMenu menu, ItemStack stack) {
		int empty = -1;
		for (Slot s : menu.slots) {
			if (!(s.container instanceof net.minecraft.world.entity.player.Inventory)) continue;
			ItemStack in = s.getItem();
			if (in.isEmpty()) {
				if (empty < 0) empty = s.index;
			} else if (same(in, stack) && in.getCount() + stack.getCount() <= in.getMaxStackSize()) return s.index;
		}
		return empty;
	}

	// ---------- the game's own calls, as each version names them ----------

	private static boolean same(ItemStack a, ItemStack b) {
		//#if MC >= 1.20.5
		return ItemStack.isSameItemSameComponents(a, b);
		//#else
		//$ return ItemStack.isSameItemSameTags(a, b);
		//#endif
	}

	private enum Kind { PICKUP, QUICK_MOVE, THROW }

	private static void click(Minecraft mc, Player player, int containerId, int slot, int button, Kind kind) {
		//#if MC >= 26.1
		var input = switch (kind) {
			case PICKUP -> net.minecraft.world.inventory.ContainerInput.PICKUP;
			case QUICK_MOVE -> net.minecraft.world.inventory.ContainerInput.QUICK_MOVE;
			case THROW -> net.minecraft.world.inventory.ContainerInput.THROW;
		};
		mc.gameMode.handleContainerInput(containerId, slot, button, input, player);
		//#else
		//$ var input = switch (kind) {
		//$ 	case PICKUP -> net.minecraft.world.inventory.ClickType.PICKUP;
		//$ 	case QUICK_MOVE -> net.minecraft.world.inventory.ClickType.QUICK_MOVE;
		//$ 	case THROW -> net.minecraft.world.inventory.ClickType.THROW;
		//$ };
		//$ mc.gameMode.handleInventoryMouseClick(containerId, slot, button, input, player);
		//#endif
	}

	/** The recipe laid out again (as the book would). */
	private static void place(Minecraft mc, int containerId, Object recipe, boolean all) {
		//#if MC >= 1.21.2
		mc.gameMode.handlePlaceRecipe(containerId, (net.minecraft.world.item.crafting.display.RecipeDisplayId) recipe, all);
		//#elif MC >= 1.20.2
		//$ mc.gameMode.handlePlaceRecipe(containerId, (net.minecraft.world.item.crafting.RecipeHolder<?>) recipe, all);
		//#else
		//$ mc.gameMode.handlePlaceRecipe(containerId, (net.minecraft.world.item.crafting.Recipe<?>) recipe, all);
		//#endif
	}

	/** A key held right now, read from the keyboard itself: in a window the game does not update its keys. */
	static boolean down(Minecraft mc, KeyMapping key) {
		if (key == null) return false;
		InputConstants.Key bound = net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper.getBoundKeyOf(key);
		//#if MC >= 26.3
		if (bound.getType() != InputConstants.Type.KEYBOARD || bound.getValue() < 0) return false;
		//#else
		//$ if (bound.getType() != InputConstants.Type.KEYSYM || bound.getValue() < 0) return false;
		//#endif
		//#if MC >= 26.3
		return InputConstants.isKeyDown(bound.getValue());
		//#elif MC >= 1.21.9
		//$ return InputConstants.isKeyDown(mc.getWindow(), bound.getValue());
		//#else
		//$ return InputConstants.isKeyDown(mc.getWindow().getWindow(), bound.getValue());
		//#endif
	}

	private static boolean shiftDown(Minecraft mc) {
		//#if MC >= 1.21.9
		return mc.hasShiftDown();
		//#else
		//$ return net.minecraft.client.gui.screens.Screen.hasShiftDown();
		//#endif
	}

	private static boolean altDown(Minecraft mc) {
		//#if MC >= 1.21.9
		return mc.hasAltDown();
		//#else
		//$ return net.minecraft.client.gui.screens.Screen.hasAltDown();
		//#endif
	}

	private static boolean controlDown(Minecraft mc) {
		//#if MC >= 1.21.9
		return mc.hasControlDown();
		//#else
		//$ return net.minecraft.client.gui.screens.Screen.hasControlDown();
		//#endif
	}

	/** For the test: crafts done since it was last read. */
	public static int takeCrafted() {
		int n = crafted;
		crafted = 0;
		return n;
	}
}
