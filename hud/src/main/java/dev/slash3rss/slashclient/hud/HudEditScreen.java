package dev.slash3rss.slashclient.hud;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Drag modules where you want them. "Modules" opens a list to switch them on and off.
 * A module keeps to the corner, edge or middle it was dropped nearest to, and snaps to
 * the screen edges and the centre line.
 */
public class HudEditScreen extends Screen {
	private static final int SNAP = 6;
	private static final int EDGE = 2;
	private static final int COLUMNS = 3;
	private static final int CELL_W = 104;
	private static final int CELL_H = 18;

	private HudModule dragging;
	private double grabX;
	private double grabY;
	private boolean showList;
	private final List<Button> moduleButtons = new ArrayList<>();

	public HudEditScreen() {
		super(Component.translatable("slashclient-hud.editor"));
	}

	private static Component onOff(String key, boolean on) {
		return Component.translatable(key).append(on ? " ✔" : " ✘");
	}

	@Override
	protected void init() {
		HudConfig cfg = SlashHud.config;
		moduleButtons.clear();
		int rows = (SlashHud.MODULES.size() + COLUMNS - 1) / COLUMNS;
		int left = width / 2 - COLUMNS * CELL_W / 2;
		int top = Math.max(24, height / 2 - rows * CELL_H / 2 - 10);
		for (int i = 0; i < SlashHud.MODULES.size(); i++) {
			HudModule m = SlashHud.MODULES.get(i);
			HudConfig.Placement p = cfg.placement(m.id());
			String key = "slashclient-hud.module." + m.id();
			Button b = addRenderableWidget(Button.builder(onOff(key, p.enabled), btn -> {
				p.enabled = !p.enabled;
				btn.setMessage(onOff(key, p.enabled));
			}).bounds(left + (i % COLUMNS) * CELL_W, top + (i / COLUMNS) * CELL_H, CELL_W - 2, CELL_H - 2).build());
			b.visible = showList;
			moduleButtons.add(b);
		}

		int bw = 74;
		int x = width / 2 - (bw * 5 + 8) / 2;
		int y = height - 24;
		addRenderableWidget(Button.builder(Component.translatable("slashclient-hud.modules"), b -> {
			showList = !showList;
			moduleButtons.forEach(mb -> mb.visible = showList);
		}).bounds(x, y, bw, 20).build());
		addRenderableWidget(Button.builder(onOff("slashclient-hud.background", cfg.background), b -> {
			cfg.background = !cfg.background;
			b.setMessage(onOff("slashclient-hud.background", cfg.background));
		}).bounds(x + (bw + 2), y, bw, 20).build());
		addRenderableWidget(Button.builder(onOff("slashclient-hud.shadow", cfg.textShadow), b -> {
			cfg.textShadow = !cfg.textShadow;
			b.setMessage(onOff("slashclient-hud.shadow", cfg.textShadow));
		}).bounds(x + (bw + 2) * 2, y, bw, 20).build());
		addRenderableWidget(Button.builder(Component.translatable("slashclient-hud.reset"), b -> {
			HudConfig d = HudConfig.defaults();
			cfg.modules = d.modules;
			cfg.background = d.background;
			cfg.textShadow = d.textShadow;
			rebuildWidgets();
		}).bounds(x + (bw + 2) * 3, y, bw, 20).build());
		addRenderableWidget(Button.builder(Component.translatable("gui.done"), b -> onClose()).bounds(x + (bw + 2) * 4, y, bw, 20).build());
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta) {
		if (dragging != null) {
			g.fill(width / 2, 0, width / 2 + 1, height, 0x40FFFFFF);
			g.fill(0, height / 2, width, height / 2 + 1, 0x40FFFFFF);
		}
		SlashHud.drawAll(g, minecraft, true);
		for (HudModule m : SlashHud.MODULES) {
			if (!SlashHud.config.placement(m.id()).enabled) continue;
			int[] b = box(m);
			boolean hot = !showList && (m == dragging || inside(b, mouseX, mouseY));
			g.outline(b[0] - 1, b[1] - 1, b[2] + 2, b[3] + 2, hot ? 0xFF60A5FA : 0x80FFFFFF);
		}
		if (showList) {
			int rows = (SlashHud.MODULES.size() + COLUMNS - 1) / COLUMNS;
			Button first = moduleButtons.get(0);
			g.fill(first.getX() - 6, first.getY() - 20, first.getX() + COLUMNS * CELL_W + 4, first.getY() + rows * CELL_H + 4, 0xE0101018);
			g.centeredText(font, Component.translatable("slashclient-hud.modules"), width / 2, first.getY() - 14, 0xFFFFFFFF);
		} else {
			g.centeredText(font, title, width / 2, height - 48, 0xFFFFFFFF);
			g.centeredText(font, Component.translatable("slashclient-hud.hint"), width / 2, height - 37, 0xFFAAAAAA);
		}
		super.extractRenderState(g, mouseX, mouseY, delta);
	}

	/** x, y, width, height of a module on screen. */
	private int[] box(HudModule m) {
		int w = m.width(minecraft);
		int h = m.height(minecraft);
		int[] at = SlashHud.position(SlashHud.config.placement(m.id()), w, h, width, height);
		return new int[] { at[0], at[1], w, h };
	}

	private static boolean inside(int[] b, double x, double y) {
		return x >= b[0] && y >= b[1] && x < b[0] + b[2] && y < b[1] + b[3];
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (super.mouseClicked(e, doubleClick) || showList) return true;
		// the topmost (last drawn) module wins
		for (int i = SlashHud.MODULES.size() - 1; i >= 0; i--) {
			HudModule m = SlashHud.MODULES.get(i);
			if (!SlashHud.config.placement(m.id()).enabled) continue;
			int[] b = box(m);
			if (inside(b, e.x(), e.y())) {
				dragging = m;
				grabX = e.x() - b[0];
				grabY = e.y() - b[1];
				return true;
			}
		}
		return false;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
		if (dragging == null) return super.mouseDragged(e, dx, dy);
		int[] b = box(dragging);
		HudConfig.Placement p = SlashHud.config.placement(dragging.id());
		int x = snap((int) Math.round(e.x() - grabX), b[2], width);
		int y = snap((int) Math.round(e.y() - grabY), b[3], height);
		// keep to the third of the screen the module is in, so it stays there when the window changes
		p.ax = anchor(x + b[2] / 2.0, width);
		p.ay = anchor(y + b[3] / 2.0, height);
		p.dx = x - Math.round(p.ax * (width - b[2]));
		p.dy = y - Math.round(p.ay * (height - b[3]));
		return true;
	}

	private static float anchor(double center, int screen) {
		return center < screen / 3.0 ? 0f : center > screen * 2 / 3.0 ? 1f : 0.5f;
	}

	/** Pulls a position onto the screen edge or the centre line when it is close. */
	private static int snap(int pos, int size, int screen) {
		pos = Math.max(0, Math.min(screen - size, pos));
		if (pos < EDGE + SNAP) return EDGE;
		if (pos > screen - size - EDGE - SNAP) return screen - size - EDGE;
		int centered = (screen - size) / 2;
		return Math.abs(pos - centered) < SNAP ? centered : pos;
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent e) {
		dragging = null;
		return super.mouseReleased(e);
	}

	@Override
	public void onClose() {
		SlashHud.config.save();
		super.onClose();
	}

	/** For the screenshot test: switches every module on. */
	public static void enableAll() {
		SlashHud.MODULES.forEach(m -> SlashHud.config.placement(m.id()).enabled = true);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
