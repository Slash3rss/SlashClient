package dev.slash3rss.slashclient.hud.chat;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

import java.util.function.IntSupplier;
import java.util.function.Supplier;

/**
 * A chat tab in the launcher's look: a dark glass pill, the open one in the blue accent, new lines
 * counted in a small blue dot. With an icon and no label it is the "edit tabs" button.
 */
final class ChatTabButton extends Button {
	private final Supplier<Component> label;
	private final IntSupplier unread;
	private final Supplier<Boolean> open;
	private final String icon;
	private boolean mention;
	/** For pulling the tab out: its index and the row's top (-1 = it stays in the row). */
	private int index = -1, rowY;
	private double pressX, pressY;
	private boolean pulling;

	ChatTabButton detachable(int index, int rowY) {
		this.index = index;
		this.rowY = rowY;
		return this;
	}

	@Override
	//#if MC >= 1.21.9
	public void onClick(net.minecraft.client.input.MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public void onClick(double mouseX, double mouseY) {
	//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
	//$ 	boolean doubleClick = false;
	//#endif
		pressX = e.x();
		pressY = e.y();
		pulling = false;
		//#if MC >= 1.21.9
		super.onClick(e, doubleClick);
		//#else
		//$ super.onClick(e.x(), e.y());
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	protected void onDrag(net.minecraft.client.input.MouseButtonEvent e, double dx, double dy) {
	//#else
	//$ protected void onDrag(double mouseX, double mouseY, double dx, double dy) {
	//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
	//#endif
		// "All" stays; any other tab comes out once the mouse has left the row upwards
		if (index < 0) return;
		if (!pulling && Math.hypot(e.x() - pressX, e.y() - pressY) > 6) pulling = true;
		ChatTabs.dragging = pulling && e.y() < rowY - 4 ? index : -1;
	}

	@Override
	//#if MC >= 1.21.9
	public void onRelease(net.minecraft.client.input.MouseButtonEvent e) {
	//#else
	//$ public void onRelease(double mouseX, double mouseY) {
	//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
	//#endif
		if (pulling && index >= 0 && e.y() < rowY - 4) ChatTabs.detach(index, (int) e.x(), (int) e.y());
		ChatTabs.dragging = -1;
		pulling = false;
	}

	/**
	 * Not reached with the arrow keys or Tab: in the chat, up and down go through the sent
	 * messages, and a tab taking the focus would stop that. The mouse still clicks it.
	 */
	@Override
	public net.minecraft.client.gui.ComponentPath nextFocusPath(net.minecraft.client.gui.navigation.FocusNavigationEvent event) {
		return null;
	}

	/** Counts in red: this tab catches the player's nick. */
	ChatTabButton mention(boolean on) {
		mention = on;
		return this;
	}

	ChatTabButton(int x, int y, int w, int h, Supplier<Component> label, IntSupplier unread, Supplier<Boolean> open, String icon, OnPress onPress) {
		super(x, y, w, h, label.get(), onPress, DEFAULT_NARRATION);
		this.label = label;
		this.unread = unread;
		this.open = open;
		this.icon = icon;
	}

	/** How wide a tab must be for its label and the unread dot. */
	static int widthFor(Component label, int unread) {
		return Ui.width(label) + 12 + (unread > 0 ? Ui.width(Ui.text(count(unread))) + 8 : 0);
	}

	private static String count(int n) {
		return n > 99 ? "99+" : String.valueOf(n);
	}

	@Override
	protected void extractContents(GuiGraphicsExtractor g, int mx, int my, float delta) {
		int x = getX(), y = getY(), w = getWidth(), h = getHeight();
		float t = Ui.hover("chattab:" + x + ":" + y, isHoveredOrFocused());
		boolean on = open.get();
		if (on) Ui.accent(g, x, y, w, h, 5, t);
		else {
			Ui.round(g, x, y, w, h, 5, Ui.blend(0xD0111622, Ui.CARD_HOVER, t));
			Ui.roundOutline(g, x, y, w, h, 5, Ui.blend(Ui.BORDER, 0x40FFFFFF, t));
		}
		if (icon != null) {
			Ui.icon(g, icon, x + (w - 8) / 2, y + (h - 8) / 2, 8, on ? 0xFFFFFFFF : Ui.blend(Ui.TEXT_2, Ui.ACCENT_LIGHT, t));
			return;
		}
		Component text = on ? Ui.bold(label.get().getString()) : Ui.text(label.get().getString());
		int n = unread.getAsInt();
		Component badge = Ui.text(count(n));
		int bw = n > 0 ? Ui.width(badge) + 6 : 0;
		int tx = x + (w - Ui.width(text) - (n > 0 ? bw + 2 : 0)) / 2;
		Ui.draw(g, text, tx, y + (h - 8) / 2, on ? 0xFFFFFFFF : Ui.blend(Ui.TEXT_2, Ui.TEXT, t));
		if (n > 0) {
			int bx = tx + Ui.width(text) + 3, by = y + (h - 9) / 2;
			int dot = mention ? 0xFFDC2626 : Ui.ACCENT;
			Ui.round(g, bx, by, bw, 9, 4, on ? 0xFFFFFFFF : dot);
			Ui.draw(g, badge, bx + 3, by + 1, on ? (mention ? 0xFFDC2626 : Ui.ACCENT_DARK) : 0xFFFFFFFF);
		}
	}
}
