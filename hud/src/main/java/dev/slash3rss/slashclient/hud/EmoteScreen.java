package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

/**
 * The emote wheel: eight emotes around the middle of the screen. Click one, press 1–8, or hold
 * the key, point and let go. The game keeps running behind it.
 */
public class EmoteScreen extends Screen {
	private static final int RADIUS = 62, SLOT = 34;
	private final KeyMapping key;
	private int hovered = -1;

	public EmoteScreen(KeyMapping key) {
		super(Component.translatable("slashclient-hud.emote"));
		this.key = key;
	}

	private int[] slot(int i) {
		double a = -Math.PI / 2 + i * Math.PI * 2 / Cosmetics.EMOTES.size();
		return new int[] { width / 2 + (int) Math.round(Math.cos(a) * RADIUS) - SLOT / 2, height / 2 + (int) Math.round(Math.sin(a) * RADIUS) - SLOT / 2 };
	}

	/** The emote the mouse points at: by direction from the middle, once it is away from it. */
	private int at(double mx, double my) {
		double dx = mx - width / 2.0, dy = my - height / 2.0;
		if (dx * dx + dy * dy < 18 * 18) return -1;
		double a = Math.atan2(dy, dx) + Math.PI / 2;
		int n = Cosmetics.EMOTES.size();
		return (int) Math.floorMod(Math.round(a / (Math.PI * 2) * n), n);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		hovered = at(mx, my);
		int cx = width / 2, cy = height / 2;
		Ui.round(g, cx - RADIUS - SLOT / 2 - 8, cy - RADIUS - SLOT / 2 - 8, (RADIUS + SLOT / 2 + 8) * 2, (RADIUS + SLOT / 2 + 8) * 2, RADIUS + SLOT / 2 + 8, 0xB0111622);
		for (int i = 0; i < Cosmetics.EMOTES.size(); i++) {
			int[] p = slot(i);
			boolean on = i == hovered;
			float t = Ui.hover("emote:" + i, on);
			Ui.round(g, p[0], p[1], SLOT, SLOT, SLOT / 2, Ui.blend(Ui.CARD, Ui.ACCENT_DARK, t));
			if (on) Ui.roundOutline(g, p[0], p[1], SLOT, SLOT, SLOT / 2, Ui.ACCENT_LIGHT);
			int size = 22 + Math.round(t * 4);
			Identifier tex = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/emote/" + Cosmetics.EMOTES.get(i) + ".png");
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, tex, p[0] + (SLOT - size) / 2, p[1] + (SLOT - size) / 2, 0, 0, size, size, 64, 64, 64, 64, 0xFFFFFFFF);
			Component num = Ui.text(String.valueOf(i + 1));
			Ui.draw(g, num, p[0] + SLOT - Ui.width(num) - 1, p[1] + SLOT - 8, Ui.MUTED);
		}
		Component label = hovered >= 0 ? Ui.trBold("slashclient-hud.emote." + Cosmetics.EMOTES.get(hovered)) : Ui.tr("slashclient-hud.emote.pick");
		Ui.centered(g, Ui.fit(label, 80), cx, cy - 4, hovered >= 0 ? Ui.TEXT : Ui.TEXT_2);
		super.extractRenderState(g, mx, my, delta);
	}

	private void pick(int i) {
		onClose();
		if (i >= 0) Cosmetics.send(minecraft, Cosmetics.EMOTES.get(i));
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT) {
			pick(at(e.x(), e.y()));
			return true;
		}
		return super.mouseClicked(e, doubleClick);
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		int n = e.key() - InputConstants.KEY_1;
		if (n >= 0 && n < Cosmetics.EMOTES.size()) {
			pick(n);
			return true;
		}
		return super.keyPressed(e);
	}

	/** Holding the key, pointing and letting go picks what is pointed at. */
	@Override
	//#if MC >= 1.21.9
	public boolean keyReleased(KeyEvent e) {
	//#else
	//$ public boolean keyReleased(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		if (key.matches(e) && hovered >= 0) {
			pick(hovered);
			return true;
		}
		return super.keyReleased(e);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		g.fill(0, 0, width, height, 0x40000000);
	}
}
