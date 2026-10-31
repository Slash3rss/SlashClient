// only the client gametests call these, and their API came in 1.21.4
//#if MC >= 1.21.4
package dev.slash3rss.slashclient.hud.inventory;

import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.replay.ShotCaption;

/**
 * The inventory tools for the in-game test (src/gametest GameInventoryTools): the shulker box's
 * picture, the search, locked slots, the inventory module and the screenshot caption.
 */
public final class InvToolsTestHooks {
	private InvToolsTestHooks() {}

	/** Everything on and as it comes, no locked slots. */
	public static void reset() {
		HudConfig c = SlashHud.config;
		c.shulkerPreview = true;
		c.inventorySearch = true;
		c.slotLock = true;
		c.lockedSlots = 0;
		c.screenshotCaption = false;
		c.mouseTweaks = true;
	}

	/** No toasts or chat lines (the advancements for the items given) over the screenshots. */
	public static void quiet() {
		Minecraft mc = Minecraft.getInstance();
		Compat.toasts(mc).clear();
		Compat.chat(mc).clearMessages(false);
	}

	public static void openInventory() {
		Minecraft mc = Minecraft.getInstance();
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.InventoryScreen(mc.player));
	}

	private static Slot slot(AbstractContainerScreen<?> screen, int inventorySlot) {
		for (Slot s : screen.getMenu().slots) if (s.container instanceof Inventory && s.getContainerSlot() == inventorySlot) return s;
		return null;
	}

	/** Where the open screen shows a slot of the player's inventory, in window pixels (its middle). */
	public static int[] slotOnWindow(int inventorySlot) {
		Minecraft mc = Minecraft.getInstance();
		if (!(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return new int[] { 0, 0 };
		Slot s = slot(screen, inventorySlot);
		ContainerScreenAccessor at = (ContainerScreenAccessor) screen;
		double scale = mc.getWindow().getGuiScale();
		return new int[] { (int) ((at.slashclient$leftPos() + s.x + 8) * scale), (int) ((at.slashclient$topPos() + s.y + 8) * scale) };
	}

	/** A slot of the player's inventory as "<item id> x<count>". */
	public static String item(int inventorySlot) {
		ItemStack s = Minecraft.getInstance().player.getInventory().getItem(inventorySlot);
		return s.isEmpty() ? "empty" : net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(s.getItem()).getPath() + " x" + s.getCount();
	}

	public static String offhand() {
		ItemStack s = Minecraft.getInstance().player.getOffhandItem();
		return s.isEmpty() ? "empty" : net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(s.getItem()).getPath() + " x" + s.getCount();
	}

	/** The shulker box's picture and its tooltip's lines (the game's list of names should be gone). */
	public static String shulker(int inventorySlot) {
		Minecraft mc = Minecraft.getInstance();
		ItemStack s = mc.player.getInventory().getItem(inventorySlot);
		StringBuilder out = new StringBuilder(ShulkerPreview.describe(s)).append('|');
		for (Component line : s.getTooltipLines(net.minecraft.world.item.Item.TooltipContext.of(mc.level), mc.player, TooltipFlag.NORMAL)) out.append(line.getString()).append(';');
		return out.toString();
	}

	public static int search(String text) {
		return InventorySearch.search(text);
	}

	/** Whether the search finds a line of an item's text by a query typed without Polish letters. */
	public static boolean searchFinds(String line, String query) {
		return InventorySearch.plain(line).contains(InventorySearch.plain(query));
	}

	public static boolean searchFocused() {
		return InventorySearch.focused();
	}

	public static void lock(int hotbar) {
		if (!SlotLock.locked(hotbar)) SlotLock.toggle(Minecraft.getInstance(), hotbar);
	}

	public static boolean locked(int hotbar) {
		return SlotLock.locked(hotbar);
	}

	public static void inventoryModule(boolean on) {
		HudConfig.Placement p = SlashHud.config.placement("inventory");
		p.enabled = on;
		p.ax = 1f;
		p.ay = 0.8f;
		p.dx = -2;
		p.dy = 0;
		p.scale = 1f;
	}

	public static void caption(boolean on) {
		HudConfig c = SlashHud.config;
		c.screenshotCaption = on;
		c.screenshotCaptionCorner = "bottomLeft";
		c.screenshotCaptionCoords = true;
		c.screenshotCaptionServer = true;
		ShotCaption.lastDrawn = "";
	}

	public static String lastCaption() {
		return ShotCaption.lastDrawn;
	}
}
//#endif
