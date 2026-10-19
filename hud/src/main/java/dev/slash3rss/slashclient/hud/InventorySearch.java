package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;

import java.util.IdentityHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * A search box over inventories and chests: the slots whose items match what is typed (their
 * name, enchantments, lore — everything their tooltip says — the item's id, or for a shulker box
 * what is inside) are framed, the rest dimmed. The box only takes keys once clicked: until then E, the number keys and Q do what
 * they always do; while it has them, Esc still closes the screen and Enter leaves the box. The
 * creative inventory has a search of its own and is left alone.
 */
public final class InventorySearch {
	private InventorySearch() {}

	private static final int W = 88, H = 12;
	private static String query = "";
	private static EditBox box;
	/** What each stack's tooltip says, in lower case; made again every second (items change). */
	private static final Map<ItemStack, String> TEXT = new IdentityHashMap<>();
	private static long textMadeAt;

	private static boolean on() {
		return SlashHud.config != null && SlashHud.config.inventorySearch;
	}

	public static void attach(Minecraft mc, AbstractContainerScreen<?> screen) {
		if (!on() || screen instanceof net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen) return;
		query = "";
		// borderless text on our own rounded field, like the chat's search; Tab never moves into it
		EditBox field = new EditBox(mc.font, 0, 0, W - 18, 9, Component.translatable("slashclient-hud.invSearch.hint")) {
			@Override
			public net.minecraft.client.gui.ComponentPath nextFocusPath(net.minecraft.client.gui.navigation.FocusNavigationEvent event) {
				return null;
			}

			//#if MC >= 26.1
			@Override
			public void extractWidgetRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
				field(g, this);
				super.extractWidgetRenderState(g, mx, my, delta);
			}
			//#else
			//$ @Override
			//$ public void renderWidget(GuiGraphicsExtractor g, int mx, int my, float delta) {
			//$ 	field(g, this);
			//$ 	super.renderWidget(g, mx, my, delta);
			//$ }
			//#endif
		};
		field.setBordered(false);
		field.setTextColor(Ui.TEXT);
		field.setHint(Component.translatable("slashclient-hud.invSearch.hint"));
		field.setMaxLength(48);
		field.setResponder(text -> query = text.strip().toLowerCase(Locale.ROOT));
		box = field;
		Screens.getWidgets(screen).add(field);
		// the window moves (the recipe book): the box follows before each frame
		ScreenEvents.beforeExtract(screen).register((s, g, mx, my, delta) -> {
			int[] at = place(screen);
			field.setX(at[0] + 14);
			field.setY(at[1] + 2);
		});
		ScreenEvents.afterExtract(screen).register((s, g, mx, my, delta) -> highlight(screen, g));
		// a click anywhere else lets go of the keys
		//#if MC >= 1.21.9
		ScreenMouseEvents.allowMouseClick(screen).register((s, e) -> {
			if (field.isFocused() && !field.isMouseOver(e.x(), e.y())) unfocus(screen);
			return true;
		});
		ScreenKeyboardEvents.allowKeyPress(screen).register((s, e) -> {
			if (!field.isFocused() || e.key() == com.mojang.blaze3d.platform.InputConstants.KEY_ESCAPE) return true;
			if (e.key() == com.mojang.blaze3d.platform.InputConstants.KEY_RETURN || e.key() == com.mojang.blaze3d.platform.InputConstants.KEY_NUMPADENTER) unfocus(screen);
			else field.keyPressed(e);
			return false;
		});
		//#else
		//$ ScreenMouseEvents.allowMouseClick(screen).register((s, x, y, button) -> {
		//$ 	if (field.isFocused() && !field.isMouseOver(x, y)) unfocus(screen);
		//$ 	return true;
		//$ });
		//$ ScreenKeyboardEvents.allowKeyPress(screen).register((s, key, scancode, mods) -> {
		//$ 	if (!field.isFocused() || key == com.mojang.blaze3d.platform.InputConstants.KEY_ESCAPE) return true;
		//$ 	if (key == com.mojang.blaze3d.platform.InputConstants.KEY_RETURN || key == com.mojang.blaze3d.platform.InputConstants.KEY_NUMPADENTER) unfocus(screen);
		//$ 	else field.keyPressed(key, scancode, mods);
		//$ 	return false;
		//$ });
		//#endif
		ScreenEvents.remove(screen).register(s -> {
			query = "";
			if (box == field) box = null;
			TEXT.clear();
		});
	}

	/** The rounded field under the box's text, with a magnifier; yellow-edged while it filters. */
	private static void field(GuiGraphicsExtractor g, EditBox field) {
		int x = field.getX() - 14, y = field.getY() - 2;
		Ui.round(g, x, y, W, H, 4, 0xE0111622);
		Ui.roundOutline(g, x, y, W, H, 4, field.isFocused() ? 0x993B82F6 : !query.isEmpty() ? 0x80FACC15 : Ui.BORDER);
		Ui.icon(g, "search", x + 4, y + 3, 6, field.isFocused() ? Ui.ACCENT_LIGHT : Ui.MUTED);
	}

	private static void unfocus(AbstractContainerScreen<?> screen) {
		if (box != null) box.setFocused(false);
		screen.setFocused(null);
	}

	/** Where the box goes: above the window's top right corner, or beside it when there is no room above. */
	private static int[] place(AbstractContainerScreen<?> screen) {
		ContainerScreenAccessor at = (ContainerScreenAccessor) screen;
		int left = at.slashclient$leftPos(), top = at.slashclient$topPos(), w = at.slashclient$imageWidth();
		if (top >= H + 3) return new int[] { left + w - W, top - H - 2 };
		if (left + w + 4 + W <= screen.width) return new int[] { left + w + 4, top };
		return new int[] { Math.max(2, left - W - 4), top };
	}

	// ---------- what matches ----------

	/** Whether a stack matches every word typed. */
	static boolean matches(Minecraft mc, ItemStack stack, String q) {
		if (stack.isEmpty()) return false;
		String text = TEXT.computeIfAbsent(stack, s -> text(mc, s));
		for (String word : q.split("\\s+")) if (!word.isEmpty() && !text.contains(word)) return false;
		return true;
	}

	private static String text(Minecraft mc, ItemStack stack) {
		StringBuilder out = new StringBuilder();
		try {
			//#if MC >= 1.20.5
			var lines = stack.getTooltipLines(net.minecraft.world.item.Item.TooltipContext.of(mc.level), mc.player, TooltipFlag.NORMAL);
			//#else
			//$ var lines = stack.getTooltipLines(mc.player, TooltipFlag.NORMAL);
			//#endif
			for (Component line : lines) out.append(line.getString()).append('\n');
		} catch (RuntimeException e) {
			// a server's odd item: its name at least
			out.append(stack.getHoverName().getString()).append('\n');
		}
		// a shulker box matches what is inside it too
		ShulkerPreview.Contents box = ShulkerPreview.image(stack);
		if (box != null) for (ItemStack s : box.items()) {
			if (!s.isEmpty()) out.append(s.getHoverName().getString()).append(' ').append(net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(s.getItem())).append('\n');
		}
		out.append(net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()));
		return out.toString().toLowerCase(Locale.ROOT);
	}

	private static void highlight(AbstractContainerScreen<?> screen, GuiGraphicsExtractor g) {
		if (query.isEmpty()) return;
		Minecraft mc = Minecraft.getInstance();
		long now = System.currentTimeMillis();
		if (now - textMadeAt > 1000) {
			TEXT.clear();
			textMadeAt = now;
		}
		ContainerScreenAccessor at = (ContainerScreenAccessor) screen;
		raise(g, true);
		for (Slot slot : screen.getMenu().slots) {
			if (!slot.isActive()) continue;
			int x = at.slashclient$leftPos() + slot.x, y = at.slashclient$topPos() + slot.y;
			if (matches(mc, slot.getItem(), query)) {
				g.fill(x, y, x + 16, y + 16, 0x30FACC15);
				g.fill(x - 1, y - 1, x + 17, y, 0xFFFACC15);
				g.fill(x - 1, y + 16, x + 17, y + 17, 0xFFFACC15);
				g.fill(x - 1, y, x, y + 16, 0xFFFACC15);
				g.fill(x + 16, y, x + 17, y + 16, 0xFFFACC15);
			} else {
				g.fill(x, y, x + 16, y + 16, 0xC0101218);
			}
		}
		raise(g, false);
	}

	/**
	 * What is drawn over the slots goes over their items and counts too. Before 1.21.6 the GUI is
	 * drawn with depth and items stand 150 or more in front: it moves in front of them (and stays
	 * behind tooltips at 400). Later versions draw in layers: it starts a new one (tooltips still
	 * come in a later one).
	 */
	static void raise(GuiGraphicsExtractor graphics, boolean push) {
		//#if MC >= 1.21.6
		if (push) graphics.nextStratum();
		//#else
		//$ if (push) {
		//$ 	graphics.pose().pushPose();
		//$ 	graphics.pose().translate(0, 0, 350);
		//$ } else graphics.pose().popPose();
		//#endif
	}

	// ---------- for the in-game test ----------

	/** Types into the open screen's box (as if clicked first); the slots it matches, counted. */
	public static int search(String text) {
		Minecraft mc = Minecraft.getInstance();
		if (box == null || !(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return -1;
		box.setValue(text);
		int n = 0;
		for (Slot slot : screen.getMenu().slots) if (slot.isActive() && matches(mc, slot.getItem(), query)) n++;
		return n;
	}

	public static boolean focused() {
		return box != null && box.isFocused();
	}
}
