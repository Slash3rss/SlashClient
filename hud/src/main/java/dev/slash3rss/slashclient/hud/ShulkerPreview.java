package dev.slash3rss.slashclient.hud;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.tooltip.ClientTooltipComponent;
import net.minecraft.core.NonNullList;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.world.inventory.tooltip.TooltipComponent;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.ShulkerBoxBlock;

import java.util.List;
import java.util.Set;

/**
 * A shulker box's contents in its tooltip: the 27 slots as a grid of items with their counts,
 * on a panel in the box's own colour. The game's list of names ("Diamond x64", "and 3 more…")
 * goes away while the grid shows. The contents come from the item's container data (a
 * component since 1.20.5, the block entity's NBT on 1.20.1); a box that only names a loot
 * table keeps the game's own "unknown contents" line.
 */
public final class ShulkerPreview {
	private ShulkerPreview() {}

	private static final int COLUMNS = 9, ROWS = 3, SLOT = 18;
	/** The undyed box's purple. */
	private static final int PLAIN = 0xFF8E6B8E;
	/** The game's lines listing what is inside, by their translation keys (1.20.2–1.21.4 and 1.21.5+). */
	private static final Set<String> LIST_KEYS = Set.of("container.shulkerBox.itemCount", "container.shulkerBox.more", "item.container.item_count", "item.container.more_items");

	/** What the tooltip carries from the item to the drawing. */
	public record Contents(List<ItemStack> items, int color) implements TooltipComponent {}

	private static boolean on() {
		return SlashHud.config != null && SlashHud.config.shulkerPreview;
	}

	public static void register() {
		//#if MC >= 26.1
		net.fabricmc.fabric.api.client.rendering.v1.ClientTooltipComponentCallback.EVENT.register(data -> data instanceof Contents c ? new Grid(c) : null);
		//#else
		//$ net.fabricmc.fabric.api.client.rendering.v1.TooltipComponentCallback.EVENT.register(data -> data instanceof Contents c ? new Grid(c) : null);
		//#endif
		//#if MC >= 1.20.5
		net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback.EVENT.register((stack, context, flag, lines) -> hideList(stack, lines));
		//#else
		//$ net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback.EVENT.register((stack, flag, lines) -> hideList(stack, lines));
		//#endif
	}

	/** The picture for a shulker box's tooltip (ShulkerTooltipMixin), or null for anything else. */
	public static Contents image(ItemStack stack) {
		if (!on() || !(stack.getItem() instanceof BlockItem block) || !(block.getBlock() instanceof ShulkerBoxBlock box)) return null;
		NonNullList<ItemStack> items = NonNullList.withSize(COLUMNS * ROWS, ItemStack.EMPTY);
		//#if MC >= 1.20.5
		var container = stack.get(net.minecraft.core.component.DataComponents.CONTAINER);
		if (container == null) return null;
		container.copyInto(items);
		//#else
		//$ net.minecraft.nbt.CompoundTag tag = BlockItem.getBlockEntityData(stack);
		//$ if (tag == null || !tag.contains("Items", 9)) return null;
		//$ net.minecraft.world.ContainerHelper.loadAllItems(tag, items);
		//#endif
		if (items.stream().allMatch(ItemStack::isEmpty)) return null;
		DyeColor dye = box.getColor();
		return new Contents(List.copyOf(items), dye == null ? PLAIN : 0xFF000000 | dye.getMapColor().col);
	}

	/** Takes the game's list of names out of a box's tooltip while the grid shows the same. */
	private static void hideList(ItemStack stack, List<Component> lines) {
		if (image(stack) == null) return;
		lines.removeIf(line -> line.getContents() instanceof TranslatableContents t && LIST_KEYS.contains(t.getKey())
			// 1.20.1 wrote them as "<name> x<count>" without a key
			|| line.getSiblings().size() == 2 && " x".equals(line.getSiblings().get(0).getString()));
	}

	/** Slots in rows of nine on the box's colour; items with their counts and bars. */
	static final class Grid implements ClientTooltipComponent {
		private final Contents contents;

		Grid(Contents contents) {
			this.contents = contents;
		}

		//#if MC >= 1.21.2
		@Override
		public int getHeight(Font font) {
			return ROWS * SLOT + 2 + 4;
		}
		//#else
		//$ @Override
		//$ public int getHeight() {
		//$ 	return ROWS * SLOT + 2 + 4;
		//$ }
		//#endif

		@Override
		public int getWidth(Font font) {
			return COLUMNS * SLOT + 2;
		}

		//#if MC >= 26.1
		@Override
		public void extractImage(Font font, int x, int y, int w, int h, GuiGraphicsExtractor g) {
			draw(font, x, y, g);
		}
		//#elif MC >= 1.21.2
		//$ @Override
		//$ public void renderImage(Font font, int x, int y, int w, int h, GuiGraphicsExtractor g) {
		//$ 	draw(font, x, y, g);
		//$ }
		//#else
		//$ @Override
		//$ public void renderImage(Font font, int x, int y, GuiGraphicsExtractor g) {
		//$ 	draw(font, x, y, g);
		//$ }
		//#endif

		private void draw(Font font, int x, int y, GuiGraphicsExtractor g) {
			int c = contents.color() & 0xFFFFFF;
			int w = COLUMNS * SLOT + 2, h = ROWS * SLOT + 2;
			// the box's colour, a little see-through, with a brighter frame
			g.fill(x, y, x + w, y + h, 0x70000000 | c);
			g.fill(x, y, x + w, y + 1, 0xC0000000 | c);
			g.fill(x, y + h - 1, x + w, y + h, 0xC0000000 | c);
			g.fill(x, y + 1, x + 1, y + h - 1, 0xC0000000 | c);
			g.fill(x + w - 1, y + 1, x + w, y + h - 1, 0xC0000000 | c);
			List<ItemStack> items = contents.items();
			for (int i = 0; i < items.size(); i++) {
				int sx = x + 1 + i % COLUMNS * SLOT, sy = y + 1 + i / COLUMNS * SLOT;
				g.fill(sx + 1, sy + 1, sx + SLOT - 1, sy + SLOT - 1, 0x66000000);
				ItemStack s = items.get(i);
				if (s.isEmpty()) continue;
				g.item(s, sx + 1, sy + 1);
				decorations(g, font, s, sx + 1, sy + 1);
			}
		}
	}

	/** An item's count, durability bar and cooldown over it, as in a slot. */
	static void decorations(GuiGraphicsExtractor g, Font font, ItemStack s, int x, int y) {
		//#if MC >= 26.1
		g.itemDecorations(font, s, x, y);
		//#else
		//$ g.renderItemDecorations(font, s, x, y);
		//#endif
	}

	/** For the in-game test: a box's image as "<color>:<item>x<count>,…" of the slots with something in them. */
	public static String describe(ItemStack stack) {
		Contents c = image(stack);
		if (c == null) return "none";
		StringBuilder out = new StringBuilder(Integer.toHexString(c.color()) + ":");
		for (int i = 0; i < c.items().size(); i++) {
			ItemStack s = c.items().get(i);
			if (!s.isEmpty()) out.append(i).append('=').append(s.getCount()).append(',');
		}
		return out.toString();
	}
}
