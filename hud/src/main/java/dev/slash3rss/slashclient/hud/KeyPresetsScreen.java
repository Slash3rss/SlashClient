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
 * The key presets (KeyPresets): a name and Save keeps every key as it is now, and each saved one
 * can be put back, written over with the keys as they are now, or deleted (a second click on the bin).
 */
public class KeyPresetsScreen extends Screen {
	private static final int ROW_H = 24;

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private EditBox name;
	/** The preset whose bin was clicked once: a second click deletes it. */
	private String deleting;
	private int scroll, maxScroll;
	private final dev.slash3rss.slashclient.hud.ui.Scrollbar bar = new dev.slash3rss.slashclient.hud.ui.Scrollbar();
	private int px, py, pw, ph;

	public KeyPresetsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.keyPresets"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 340);
		ph = Math.min(height - 24, 92 + Math.max(2, KeyPresets.all().size()) * ROW_H + 10);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		String typed = name != null ? name.getValue() : "";
		name = new EditBox(font, px + 18, py + 52, pw - 36 - saveWidth() - 6, 12, Ui.tr("slashclient-hud.keyPresets.name"));
		name.setBordered(false);
		name.setTextColor(Ui.TEXT);
		name.setMaxLength(KeyPresets.NAME_MAX);
		name.setValue(typed);
		addRenderableWidget(name);
		setInitialFocus(name);
	}

	private int saveWidth() {
		return Ui.buttonWidth(Ui.tr("slashclient-hud.keyPresets.save"), "save", 20, 4);
	}

	private void save() {
		if (!KeyPresets.save(minecraft, name.getValue())) return;
		Compat.overlay(minecraft, Component.translatable("slashclient-hud.keyPresets.saved", name.getValue().trim()));
		name.setValue("");
		rebuildWidgets();
	}

	private void load(String preset) {
		KeyPresets.apply(minecraft, preset);
		Compat.overlay(minecraft, Component.translatable("slashclient-hud.keyPresets.loaded", preset));
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		bar.hide();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("keyPresets", px, py, pw, ph);
		int x = px + 12, y = py + 10;
		Ui.icon(g, "m-keypresets", x, y, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.keyPresets"), pw - 60), x + 16, y + 1, Ui.TEXT);
		Ui.button(g, "kp:close", px + pw - 24, y - 4, 16, 15, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 24, y - 4, 16, 15, this::onClose));
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.keyPresets.hint"), pw - 24), x, y + 18, Ui.MUTED);
		// the name and Save
		int sw = saveWidth(), fw = pw - 24 - sw - 6;
		Ui.round(g, x, py + 46, fw, 20, 4, Ui.CARD);
		Ui.roundOutline(g, x, py + 46, fw, 20, 4, name.isFocused() ? 0x993B82F6 : Ui.BORDER);
		if (name.getValue().isEmpty() && !name.isFocused()) Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.keyPresets.name"), fw - 12), x + 6, py + 52, Ui.MUTED);
		boolean ok = KeyPresets.canSave(name.getValue());
		Ui.button(g, "kp:save", px + pw - 12 - sw, py + 46, sw, 20, "save", Ui.tr("slashclient-hud.keyPresets.save"), ok, mx, my);
		if (ok) hits.add(new Hit(px + pw - 12 - sw, py + 46, sw, 20, this::save));
		// the saved ones
		List<KeyPresets.Preset> list = KeyPresets.all();
		int listTop = py + 76, listBottom = py + ph - 8;
		if (list.isEmpty()) Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.keyPresets.empty"), pw - 24), x, listTop + 6, Ui.MUTED);
		maxScroll = Math.max(0, list.size() * ROW_H - (listBottom - listTop));
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		g.enableScissor(px, listTop, px + pw, listBottom);
		Ui.beginClip("keyPresets list", px, listTop, pw, listBottom - listTop);
		Component loadLabel = Ui.tr("slashclient-hud.keyPresets.load");
		int lw = Ui.buttonWidth(loadLabel, null, 17, 4);
		for (int i = 0; i < list.size(); i++) {
			KeyPresets.Preset p = list.get(i);
			int ry = listTop + i * ROW_H - scroll;
			if (ry + ROW_H < listTop || ry > listBottom) continue;
			boolean visible = ry + 2 >= listTop && ry + 19 <= listBottom;
			boolean active = p.name.equalsIgnoreCase(KeyPresets.active());
			int bx = px + pw - 12 - 17;
			// the bin, red and asking once clicked
			boolean asking = p.name.equals(deleting);
			Ui.button(g, "kp:delete:" + p.name, bx, ry + 2, 17, 17, "trash", Component.empty(), asking, mx, my);
			if (visible) hits.add(new Hit(bx, ry + 2, 17, 17, () -> {
				if (!p.name.equals(deleting)) {
					deleting = p.name;
					return;
				}
				KeyPresets.delete(p.name);
				deleting = null;
				rebuildWidgets();
			}));
			bx -= 17 + 4;
			// written over with the keys as they are now
			Ui.button(g, "kp:overwrite:" + p.name, bx, ry + 2, 17, 17, "save", Component.empty(), false, mx, my);
			if (visible) hits.add(new Hit(bx, ry + 2, 17, 17, () -> {
				KeyPresets.save(minecraft, p.name);
				Compat.overlay(minecraft, Component.translatable("slashclient-hud.keyPresets.saved", p.name));
			}));
			bx -= lw + 4;
			Ui.button(g, "kp:load:" + p.name, bx, ry + 2, lw, 17, loadLabel, !active, mx, my);
			if (visible) hits.add(new Hit(bx, ry + 2, lw, 17, () -> load(p.name)));
			Component label = Ui.text(p.name);
			if (active) label = label.copy().append(Ui.tr("slashclient-hud.keyPresets.active").withStyle(s -> s.withColor(Ui.MUTED)));
			Ui.draw(g, Ui.fit(asking ? Ui.tr("slashclient-hud.keyPresets.deleteAsk", p.name) : label, bx - x - 6), x, ry + 6, asking ? 0xF87171 : active ? Ui.ACCENT_LIGHT : Ui.TEXT_2);
		}
		Ui.end();
		g.disableScissor();
		bar.draw(g, px + pw - 7, listTop, listBottom - listTop, scroll, maxScroll, mx, my);
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// the main menu's panorama, or the game dimmed behind
		if (minecraft.level == null) extractPanorama(g, delta);
		g.fill(0, 0, width, height, minecraft.level == null ? 0x800A0D14 : 0x90000000);
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		if ((e.key() == InputConstants.KEY_RETURN || e.key() == InputConstants.KEY_NUMPADENTER) && name.isFocused()) {
			save();
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT && bar.press(e.x(), e.y())) {
			scroll = Math.round(bar.drag(e.y()));
			return true;
		}
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				String was = deleting;
				h.action().run();
				// any other click takes back a half-done delete
				if (was != null && was.equals(deleting)) deleting = null;
				return true;
			}
		}
		deleting = null;
		//#if MC >= 1.21.9
		return super.mouseClicked(e, doubleClick);
		//#else
		//$ return super.mouseClicked(e.x(), e.y(), e.button());
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
	//#else
	//$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (bar.dragging()) {
			scroll = Math.round(bar.drag(e.y()));
			return true;
		}
		//#if MC >= 1.21.9
		return super.mouseDragged(e, dx, dy);
		//#else
		//$ return super.mouseDragged(e.x(), e.y(), e.button(), dx, dy);
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseReleased(MouseButtonEvent e) {
	//#else
	//$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		bar.release();
		//#if MC >= 1.21.9
		return super.mouseReleased(e);
		//#else
		//$ return super.mouseReleased(e.x(), e.y(), e.button());
		//#endif
	}

	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//#endif
		scroll = Math.max(0, Math.min(maxScroll, scroll - (int) Math.round(v * ROW_H)));
		return true;
	}

	@Override
	public void onClose() {
		minecraft.setScreenAndShow(parent);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	/** For the test: a name typed and Save pressed. */
	public void saveForTest(String typed) {
		name.setValue(typed);
		save();
	}
}
