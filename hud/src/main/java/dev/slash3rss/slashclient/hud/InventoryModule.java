package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.List;

/**
 * "Ekwipunek": the backpack's 27 slots (the main inventory above the hotbar) as a grid on the
 * HUD, items with their counts and bars, moved and scaled in the editor like the other modules.
 * The editor shows a made-up backpack while there is no world.
 */
final class InventoryModule implements HudModule {
	private static final int SLOT = 18, COLUMNS = 9, ROWS = 3;

	public String id() {
		return "inventory";
	}

	public int width(Minecraft mc) {
		return COLUMNS * SLOT + Modules.PAD * 2 - 2;
	}

	public int height(Minecraft mc) {
		return ROWS * SLOT + Modules.PAD * 2 - 2;
	}

	/** Slots 9–35 of the player's inventory: the three rows above the hotbar. */
	private static List<ItemStack> backpack(Minecraft mc) {
		List<ItemStack> out = new ArrayList<>(COLUMNS * ROWS);
		for (int i = 9; i < 36; i++) out.add(mc.player.getInventory().getItem(i));
		return out;
	}

	public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		if (mc.player == null) {
			drawPreview(g, mc, x, y);
			return;
		}
		drawGrid(g, mc, x, y, backpack(mc));
	}

	@Override
	public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		if (mc.player != null && backpack(mc).stream().anyMatch(s -> !s.isEmpty())) {
			drawGrid(g, mc, x, y, backpack(mc));
			return;
		}
		List<ItemStack> sample = new ArrayList<>();
		Item[] items = { Items.COBBLESTONE, Items.OAK_LOG, Items.TORCH, null, Items.BREAD, Items.IRON_INGOT, null, Items.DIAMOND, Items.ARROW };
		int[] counts = { 64, 23, 48, 0, 12, 31, 0, 5, 64 };
		for (int i = 0; i < COLUMNS * ROWS; i++) {
			// shifted by four each row, so the rows differ
			int k = (i + i / COLUMNS * 4) % items.length;
			ItemStack s = items[k] == null ? null : Ui.stack(items[k]);
			if (s == null) {
				sample.add(ItemStack.EMPTY);
				continue;
			}
			s = s.copy();
			s.setCount(counts[k]);
			sample.add(s);
		}
		drawGrid(g, mc, x, y, sample);
	}

	private static void drawGrid(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<ItemStack> items) {
		for (int i = 0; i < items.size(); i++) {
			int sx = x + Modules.PAD - 1 + i % COLUMNS * SLOT, sy = y + Modules.PAD - 1 + i / COLUMNS * SLOT;
			g.fill(sx + 1, sy + 1, sx + SLOT - 1, sy + SLOT - 1, 0x40000000);
			ItemStack s = items.get(i);
			if (s.isEmpty()) continue;
			g.item(s, sx + 1, sy + 1);
			ShulkerPreview.decorations(g, mc.font, s, sx + 1, sy + 1);
		}
	}
}
