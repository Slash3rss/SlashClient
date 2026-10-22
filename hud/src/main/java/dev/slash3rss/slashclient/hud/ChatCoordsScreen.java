package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Coordinates clicked in the chat, about to become a waypoint: the name (who wrote them), the
 * coordinates (to correct), the colour, and where it goes (this server's mode, or world, and the
 * dimension the player is in). Save keeps it, Esc or Cancel goes back to the chat.
 */
public class ChatCoordsScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen back;
	private final String initialName;
	private final int ix, iy, iz;
	private final List<Hit> hits = new ArrayList<>();
	private EditBox name, xs, ys, zs;
	private int color = Waypoints.COLORS[0];
	private int px, py, pw, ph;
	/** The point saved (for the test), or null. */
	public Waypoints.Point saved;

	public ChatCoordsScreen(Screen back, String name, int x, int y, int z) {
		super(Component.translatable("slashclient-hud.chatCoords.title"));
		this.back = back;
		this.initialName = name;
		this.ix = x;
		this.iy = y;
		this.iz = z;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 300);
		ph = 160;
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		String n = name != null ? name.getValue() : initialName;
		name = box(px + 16, py + 58, pw - 32 - 22, 32, n);
		int cw = (pw - 32 - 16) / 3;
		// the numbers are checked on Save (it stays grey while one is not a number)
		xs = box(px + 26, py + 92, cw - 16, 9, xs != null ? xs.getValue() : String.valueOf(ix));
		ys = box(px + 26 + cw + 8, py + 92, cw - 16, 5, ys != null ? ys.getValue() : String.valueOf(iy));
		zs = box(px + 26 + 2 * (cw + 8), py + 92, cw - 16, 9, zs != null ? zs.getValue() : String.valueOf(iz));
		setInitialFocus(name);
	}

	private EditBox box(int x, int y, int w, int max, String value) {
		EditBox b = new EditBox(font, x, y, w, 12, Component.empty());
		b.setBordered(false);
		b.setTextColor(Ui.TEXT);
		b.setMaxLength(max);
		b.setValue(value);
		addRenderableWidget(b);
		return b;
	}

	private static Integer number(EditBox b) {
		try {
			return Integer.parseInt(b.getValue().trim());
		} catch (NumberFormatException e) {
			return null;
		}
	}

	private void save() {
		Integer x = number(xs), y = number(ys), z = number(zs);
		if (x == null || y == null || z == null || minecraft.level == null) return;
		saved = Waypoints.addAt(minecraft, name.getValue(), x, y, z, color);
		minecraft.setScreenAndShow(back);
		Compat.overlay(minecraft, Component.translatable("slashclient-hud.chatCoords.saved", saved.name, x + " " + y + " " + z));
	}

	@Override
	public void onClose() {
		minecraft.setScreenAndShow(back);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("chatCoords", px, py, pw, ph);
		Ui.icon(g, "m-waypoints", px + 14, py + 11, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.chatCoords.title"), pw - 70), px + 30, py + 12, Ui.TEXT);
		Ui.button(g, "cc:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		g.fill(px + 1, py + 31, px + pw - 1, py + 32, Ui.BORDER);
		// where it goes: this place (and mode) and the dimension the player is in
		String place = WaypointKeys.describe(Waypoints.worldKey(minecraft)) + (minecraft.level == null ? "" : " · " + WorldMapScreen.dimensionName(minecraft));
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.chatCoords.into", place), pw - 28), px + 14, py + 38, Ui.MUTED);
		// the name and the colour dot (a click picks the next colour)
		field(g, name, px + 10, py + 52, pw - 20 - 22);
		Ui.round(g, px + pw - 28, py + 55, 14, 14, 7, color);
		hits.add(new Hit(px + pw - 30, py + 52, 20, 20, () -> {
			int next = 0;
			for (int c = 0; c < Waypoints.COLORS.length; c++) if (Waypoints.COLORS[c] == color) next = (c + 1) % Waypoints.COLORS.length;
			color = Waypoints.COLORS[next];
		}));
		// x, y, z
		int cw = (pw - 32 - 16) / 3;
		String[] labels = { "X", "Y", "Z" };
		EditBox[] boxes = { xs, ys, zs };
		for (int i = 0; i < 3; i++) {
			int fx = px + 10 + i * (cw + 8);
			field(g, boxes[i], fx + 10, py + 86, cw - 4);
			Ui.draw(g, Ui.text(labels[i]), fx + 2, py + 92, Ui.MUTED);
		}
		boolean ok = number(xs) != null && number(ys) != null && number(zs) != null;
		Component save = Ui.tr("slashclient-hud.chatCoords.save"), cancel = Ui.tr("slashclient-hud.chatCoords.cancel");
		int sw = Ui.buttonWidth(save, "check", 20, 4), cnw = Ui.buttonWidth(cancel, null, 20, 4);
		Ui.button(g, "cc:save", px + pw - 10 - sw, py + ph - 30, sw, 20, "check", save, ok, mx, my);
		if (ok) hits.add(new Hit(px + pw - 10 - sw, py + ph - 30, sw, 20, this::save));
		Ui.button(g, "cc:cancel", px + pw - 16 - sw - cnw, py + ph - 30, cnw, 20, cancel, false, mx, my);
		hits.add(new Hit(px + pw - 16 - sw - cnw, py + ph - 30, cnw, 20, this::onClose));
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	/** A card under an edit box, outlined blue while it has the focus. */
	private static void field(GuiGraphicsExtractor g, EditBox box, int x, int y, int w) {
		Ui.round(g, x, y, w, 20, 4, Ui.CARD);
		Ui.roundOutline(g, x, y, w, 20, 4, box.isFocused() ? 0x993B82F6 : Ui.BORDER);
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		//#if MC >= 1.21.9
		if (super.mouseClicked(e, doubleClick)) return true;
		//#else
		//$ if (super.mouseClicked(e.x(), e.y(), e.button())) return true;
		//#endif
		for (Hit h : List.copyOf(hits)) {
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		if (e.key() == InputConstants.KEY_RETURN || e.key() == InputConstants.KEY_NUMPADENTER) {
			save();
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
		//#endif
	}

	/** For the test: the values in the boxes changed, as if typed. */
	public void typeForTest(String newName, String x, String y, String z) {
		if (newName != null) name.setValue(newName);
		if (x != null) xs.setValue(x);
		if (y != null) ys.setValue(y);
		if (z != null) zs.setValue(z);
	}

	/** For the test: Save pressed. */
	public void saveForTest() {
		save();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		g.fill(0, 0, width, height, 0x50000000);
	}
}
