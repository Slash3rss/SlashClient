package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * SlashClient's keys, set right here instead of in the game's Controls: a click on a key waits for
 * the next key (or mouse button), Esc unbinds it, the arrow sets it back to its default. A key
 * another binding uses too is shown red.
 */
public class KeybindsScreen extends Screen {
	private static final int ROW_H = 22, KEY_W = 96;

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	/** The binding waiting for a key, or null. */
	private KeyMapping waiting;
	private int scroll, maxScroll;
	private final dev.slash3rss.slashclient.hud.ui.Scrollbar bar = new dev.slash3rss.slashclient.hud.ui.Scrollbar();
	private int px, py, pw, ph;

	public KeybindsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.keybinds"));
		this.parent = parent;
	}

	private List<KeyMapping> ours() {
		return Arrays.stream(minecraft.options.keyMappings).filter(k -> SlashHud.keyCategory.equals(k.getCategory())).toList();
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 340);
		ph = Math.min(height - 24, 46 + ours().size() * ROW_H + 10);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
	}

	private void bind(KeyMapping key, InputConstants.Key to) {
		key.setKey(to);
		KeyMapping.resetMapping();
		minecraft.options.save();
		waiting = null;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		super.extractRenderState(g, mx, my, delta);
		hits.clear();
		bar.hide();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("keybinds", px, py, pw, ph);
		int x = px + 12, y = py + 10;
		Ui.draw(g, Ui.trBold("slashclient-hud.keybinds"), x, y, Ui.TEXT);
		Ui.button(g, "keys:close", px + pw - 24, y - 4, 16, 15, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 24, y - 4, 16, 15, this::onClose));
		y += 13;
		Ui.draw(g, Ui.fit(Ui.tr(waiting != null ? "slashclient-hud.keybinds.press" : "slashclient-hud.keybinds.hint"), pw - 24), x, y, waiting != null ? Ui.ACCENT_LIGHT : Ui.MUTED);
		y += 18;
		List<KeyMapping> keys = ours();
		int listTop = y, listBottom = py + ph - 8;
		maxScroll = Math.max(0, keys.size() * ROW_H - (listBottom - listTop));
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		g.enableScissor(px, listTop, px + pw, listBottom);
		Ui.beginClip("keybinds list", px, listTop, pw, listBottom - listTop);
		var all = minecraft.options.keyMappings;
		for (int i = 0; i < keys.size(); i++) {
			KeyMapping key = keys.get(i);
			int ry = listTop + i * ROW_H - scroll;
			if (ry + ROW_H < listTop || ry > listBottom) continue;
			Ui.draw(g, Ui.fit(Component.translatable(key.getName()), pw - 24 - KEY_W - 26), x, ry + 6, Ui.TEXT_2);
			boolean clash = !key.isUnbound() && Arrays.stream(all).anyMatch(o -> o != key && o.same(key));
			Component label = key == waiting ? Ui.text("> … <") : key.isUnbound() ? Ui.tr("slashclient-hud.keybinds.none") : key.getTranslatedKeyMessage();
			int kx = px + pw - 12 - 20 - KEY_W;
			Ui.button(g, "keys:" + key.getName(), kx, ry + 2, KEY_W, 17, null, label.copy().withStyle(s -> clash ? s.withColor(0xF87171) : s), key == waiting, mx, my);
			boolean visible = ry + 2 >= listTop && ry + 19 <= listBottom;
			if (visible) hits.add(new Hit(kx, ry + 2, KEY_W, 17, () -> waiting = key == waiting ? null : key));
			// back to its default
			boolean changed = !key.getDefaultKey().equals(keyOf(key));
			Ui.button(g, "keys:reset:" + key.getName(), px + pw - 12 - 17, ry + 2, 17, 17, "reset", Component.empty(), false, mx, my);
			if (visible && changed) hits.add(new Hit(px + pw - 12 - 17, ry + 2, 17, 17, () -> bind(key, key.getDefaultKey())));
		}
		Ui.end();
		g.disableScissor();
		bar.draw(g, px + pw - 7, listTop, listBottom - listTop, scroll, maxScroll, mx, my);
		Ui.end();
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// the main menu's panorama, or the game dimmed behind
		if (minecraft.level == null) extractPanorama(g, delta);
		g.fill(0, 0, width, height, minecraft.level == null ? 0x800A0D14 : 0x90000000);
	}

	/** The key a binding has now (its saved name read back: the field itself is private). */
	private static InputConstants.Key keyOf(KeyMapping key) {
		return InputConstants.getKey(key.saveString());
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		if (waiting != null) {
			//#if MC >= 1.21.9
			InputConstants.Key key = InputConstants.getKey(e);
			//#else
			//$ InputConstants.Key key = InputConstants.getKey(e.key(), e.scancode());
			//#endif
			bind(waiting, e.key() == InputConstants.KEY_ESCAPE ? InputConstants.UNKNOWN : key);
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
	//#endif
		// waiting: any mouse button but a plain click on the list binds to it
		if (waiting != null && e.button() != InputConstants.MOUSE_BUTTON_LEFT) {
			bind(waiting, InputConstants.Type.MOUSE.getOrCreate(e.button()));
			return true;
		}
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT && bar.press(e.x(), e.y())) {
			scroll = Math.round(bar.drag(e.y()));
			return true;
		}
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		waiting = null;
		return false;
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
	public boolean shouldCloseOnEsc() {
		return waiting == null;
	}

	@Override
	public void onClose() {
		minecraft.setScreenAndShow(parent);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
