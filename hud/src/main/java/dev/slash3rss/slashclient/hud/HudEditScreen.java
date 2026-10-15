package dev.slash3rss.slashclient.hud;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Drag modules where you want them. "Modules" switches them on and off, "Extras" holds
 * zoom, fullbright, the crosshair and the rest, and "Share" copies or pastes a code.
 * A module keeps to the corner, edge or middle it was dropped nearest to, and snaps to
 * the screen edges and the centre line.
 */
public class HudEditScreen extends Screen {
	private static final int SNAP = 6;
	private static final int EDGE = 2;
	private static final int COLUMNS = 3;
	private static final int CELL_W = 104;
	private static final int CELL_H = 18;

	/** The window open over the HUD, if any. */
	private enum Panel { NONE, MODULES, EXTRAS, SHARE }

	private HudModule dragging;
	private double grabX;
	private double grabY;
	private Panel panel = Panel.NONE;
	private final List<Button> panelButtons = new ArrayList<>();
	private int panelTop;
	private int panelRows;
	private Component shareStatus = Component.empty();

	public HudEditScreen() {
		super(Component.translatable("slashclient-hud.editor"));
	}

	private static Component onOff(String key, boolean on) {
		return Component.translatable(key).append(on ? " ✔" : " ✘");
	}

	private static Component crosshairLabel(HudConfig cfg) {
		return Component.translatable("slashclient-hud.crosshair").append(": ").append(Component.translatable("slashclient-hud.crosshair." + cfg.crosshair));
	}

	/** A button in the open panel's grid. */
	private Button cell(int index, Component label, Button.OnPress onPress) {
		int left = width / 2 - COLUMNS * CELL_W / 2;
		Button b = Button.builder(label, onPress).bounds(left + (index % COLUMNS) * CELL_W, panelTop + (index / COLUMNS) * CELL_H, CELL_W - 2, CELL_H - 2).build();
		panelButtons.add(addRenderableWidget(b));
		return b;
	}

	/** A switch for a setting: flips it and updates its own label. */
	private void toggle(int index, String key, java.util.function.Supplier<Boolean> get, java.util.function.Consumer<Boolean> set) {
		cell(index, onOff(key, get.get()), b -> {
			set.accept(!get.get());
			b.setMessage(onOff(key, get.get()));
		});
	}

	@Override
	protected void init() {
		HudConfig cfg = SlashHud.config;
		panelButtons.clear();
		int count = switch (panel) {
			case MODULES -> SlashHud.MODULES.size();
			case EXTRAS -> 12;
			case SHARE -> 3;
			case NONE -> 0;
		};
		panelRows = (count + COLUMNS - 1) / COLUMNS;
		panelTop = Math.max(24, height / 2 - panelRows * CELL_H / 2 - 20);

		if (panel == Panel.MODULES) {
			for (int i = 0; i < SlashHud.MODULES.size(); i++) {
				HudConfig.Placement p = cfg.placement(SlashHud.MODULES.get(i).id());
				toggle(i, "slashclient-hud.module." + SlashHud.MODULES.get(i).id(), () -> p.enabled, v -> p.enabled = v);
			}
		} else if (panel == Panel.EXTRAS) {
			toggle(0, "slashclient-hud.zoom", () -> cfg.zoom, v -> cfg.zoom = v);
			toggle(1, "slashclient-hud.zoomSmooth", () -> cfg.zoomSmooth, v -> cfg.zoomSmooth = v);
			toggle(2, "slashclient-hud.fullbright", () -> cfg.fullbright, v -> cfg.fullbright = v);
			toggle(3, "slashclient-hud.lowFire", () -> cfg.lowFire, v -> cfg.lowFire = v);
			toggle(4, "slashclient-hud.chatTimestamps", () -> cfg.chatTimestamps, v -> cfg.chatTimestamps = v);
			cell(5, Component.translatable("slashclient-hud.chat.tabs"), b -> {
				cfg.save();
				minecraft.setScreenAndShow(new ChatTabsScreen());
			});
			cell(6, crosshairLabel(cfg), b -> {
				int next = (java.util.Arrays.asList(Extras.CROSSHAIRS).indexOf(cfg.crosshair) + 1) % Extras.CROSSHAIRS.length;
				cfg.crosshair = Extras.CROSSHAIRS[next];
				b.setMessage(crosshairLabel(cfg));
			});
			cell(7, Component.translatable("slashclient-hud.crosshairColor"), b -> {
				int i = 0;
				while (i < Extras.COLORS.length && Extras.COLORS[i] != cfg.crosshairColor) i++;
				cfg.crosshairColor = Extras.COLORS[(i + 1) % Extras.COLORS.length];
			});
			cell(8, Component.translatable("slashclient-hud.crosshairSize", cfg.crosshairSize), b -> {
				cfg.crosshairSize = cfg.crosshairSize % 10 + 1;
				b.setMessage(Component.translatable("slashclient-hud.crosshairSize", cfg.crosshairSize));
			});
			toggle(9, "slashclient-hud.background", () -> cfg.background, v -> cfg.background = v);
			toggle(10, "slashclient-hud.shadow", () -> cfg.textShadow, v -> cfg.textShadow = v);
			cell(11, Component.translatable("slashclient-hud.textColor"), b -> {
				int i = 0;
				while (i < Extras.COLORS.length - 1 && Extras.COLORS[i] != cfg.textColor) i++;
				// black text would vanish on the dark background, so it is skipped
				cfg.textColor = Extras.COLORS[(i + 1) % (Extras.COLORS.length - 1)];
			});
		} else if (panel == Panel.SHARE) {
			cell(0, Component.translatable("slashclient-hud.share.copy"), b -> {
				minecraft.keyboardHandler.setClipboard(ShareCode.encode(cfg));
				shareStatus = Component.translatable("slashclient-hud.share.copied");
			});
			cell(1, Component.translatable("slashclient-hud.share.paste"), b -> {
				HudConfig pasted = ShareCode.decode(minecraft.keyboardHandler.getClipboard());
				if (pasted == null) {
					shareStatus = Component.translatable("slashclient-hud.share.invalid");
					return;
				}
				cfg.copyFrom(pasted);
				ChatTabs.changed();
				shareStatus = Component.translatable("slashclient-hud.share.pasted");
			});
			cell(2, Component.translatable("slashclient-hud.reset"), b -> {
				cfg.copyFrom(HudConfig.defaults());
				ChatTabs.changed();
				shareStatus = Component.translatable("slashclient-hud.share.reset");
			});
		}

		int bw = 74;
		int x = width / 2 - (bw * 4 + 6) / 2;
		int y = height - 24;
		Panel[] tabs = { Panel.MODULES, Panel.EXTRAS, Panel.SHARE };
		String[] keys = { "slashclient-hud.modules", "slashclient-hud.extras", "slashclient-hud.share" };
		for (int i = 0; i < tabs.length; i++) {
			Panel target = tabs[i];
			Component label = Component.translatable(keys[i]);
			addRenderableWidget(Button.builder(panel == target ? Component.literal("» ").append(label) : label, b -> {
				panel = panel == target ? Panel.NONE : target;
				shareStatus = Component.empty();
				rebuildWidgets();
			}).bounds(x + (bw + 2) * i, y, bw, 20).build());
		}
		addRenderableWidget(Button.builder(Component.translatable("gui.done"), b -> onClose()).bounds(x + (bw + 2) * 3, y, bw, 20).build());
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
			boolean hot = panel == Panel.NONE && (m == dragging || inside(b, mouseX, mouseY));
			g.outline(b[0] - 1, b[1] - 1, b[2] + 2, b[3] + 2, hot ? 0xFF60A5FA : 0x80FFFFFF);
		}
		if (panel != Panel.NONE) {
			int left = width / 2 - COLUMNS * CELL_W / 2;
			int extra = panel == Panel.SHARE ? 34 : 4;
			g.fill(left - 6, panelTop - 20, left + COLUMNS * CELL_W + 4, panelTop + panelRows * CELL_H + extra, 0xE0101018);
			String key = switch (panel) {
				case MODULES -> "slashclient-hud.modules";
				case EXTRAS -> "slashclient-hud.extras.title";
				default -> "slashclient-hud.share.title";
			};
			g.centeredText(font, Component.translatable(key), width / 2, panelTop - 14, 0xFFFFFFFF);
			if (panel == Panel.SHARE) {
				g.centeredText(font, Component.translatable("slashclient-hud.share.help"), width / 2, panelTop + CELL_H + 4, 0xFFAAAAAA);
				g.centeredText(font, shareStatus, width / 2, panelTop + CELL_H + 16, 0xFF55FF55);
			}
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
		if (super.mouseClicked(e, doubleClick) || panel != Panel.NONE) return true;
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
