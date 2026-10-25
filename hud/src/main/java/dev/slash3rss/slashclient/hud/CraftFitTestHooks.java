// only the client gametests call these, and their API came in 1.21.4
//#if MC >= 1.21.4
package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;

import java.util.Map;
import java.util.TreeMap;

/** Shift-crafting only what fits, for the in-game test (src/gametest GameCraftFit). */
public final class CraftFitTestHooks {
	private CraftFitTestHooks() {}

	public static void enabled(boolean on) {
		SlashHud.config.craftFit = on;
	}

	/** A left click on a slot of the open window, as the mouse makes it. */
	public static void pickup(int slot) {
		Minecraft mc = Minecraft.getInstance();
		Compat.containerClick(mc, mc.player, mc.player.containerMenu.containerId, slot, 0, Compat.Click.PICKUP);
	}

	/** Where a slot of the open window is on the screen, in window pixels (for the mouse). */
	public static double[] slotPoint(int index) {
		Minecraft mc = Minecraft.getInstance();
		var screen = (net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?>) Compat.screen(mc);
		var at = (dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor) screen;
		var slot = screen.getMenu().slots.get(index);
		double scale = mc.getWindow().getGuiScale();
		return new double[] { (at.slashclient$leftPos() + slot.x + 8) * scale, (at.slashclient$topPos() + slot.y + 8) * scale };
	}

	public static int lastCrafts() {
		return CraftFit.lastCrafts;
	}

	/** The player's inventory as item counts ("oak_planks=64"), and the items lying on the ground near them. */
	public static String state() {
		Minecraft mc = Minecraft.getInstance();
		Map<String, Integer> counts = new TreeMap<>();
		var inv = mc.player.getInventory();
		for (int i = 0; i < 36; i++) {
			ItemStack s = inv.getItem(i);
			if (!s.isEmpty()) counts.merge(BuiltInRegistries.ITEM.getKey(s.getItem()).getPath(), s.getCount(), Integer::sum);
		}
		int dropped = mc.level.getEntitiesOfClass(ItemEntity.class, mc.player.getBoundingBox().inflate(8)).size();
		return counts + " dropped " + dropped;
	}
}
//#endif
