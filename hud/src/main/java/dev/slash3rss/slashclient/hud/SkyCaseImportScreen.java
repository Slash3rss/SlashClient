// SkyUp's cases are played on 26.3: the case counter is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.MultiLineEditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Wins the case counter missed, added by hand: the player pastes the part of the game's log
 * (logs/latest.log) with SkyUp's win lines, and each of them is counted for good (not for this
 * session). What was added once is not added again.
 */
public class SkyCaseImportScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private MultiLineEditBox box;
	private String text = "";
	/** After "Add": how many wins were added (-1 before). */
	private int added = -1;
	private int px, py, pw, ph;

	public SkyCaseImportScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.skyCase.import"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 470);
		ph = Math.min(height - 24, 260);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		box = MultiLineEditBox.builder().setX(px + 12).setY(py + 62).setPlaceholder(Ui.tr("slashclient-hud.skyCase.importHint"))
			.build(font, pw - 24, ph - 62 - 36, Ui.tr("slashclient-hud.skyCase.import"));
		box.setValue(text);
		box.setValueListener(v -> {
			text = v;
			added = -1;
		});
		addRenderableWidget(box);
		setInitialFocus(box);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		hits.clear();
		Ui.panel(g, px, py, pw, ph);
		super.extractRenderState(g, mx, my, delta);
		Ui.begin("skycase import", px, py, pw, ph);
		int x = px + 12, y = py + 10;
		Ui.draw(g, Ui.trBold("slashclient-hud.skyCase.import"), x, y, Ui.TEXT);
		Ui.wrapped(g, Ui.tr("slashclient-hud.skyCase.importHelp"), x, y + 16, pw - 24, Ui.MUTED);
		int by = py + ph - 26;
		Component add = Ui.tr("slashclient-hud.skyCase.importAdd"), back = Ui.tr("slashclient-hud.ui.back");
		int aw = Ui.buttonWidth(add, null, 18, 6), bw = Ui.buttonWidth(back, "back", 18, 6);
		Ui.button(g, "skycase:import:back", x, by, bw, 18, "back", back, false, mx, my);
		hits.add(new Hit(x, by, bw, 18, this::onClose));
		int ax = px + pw - 12 - aw;
		Ui.button(g, "skycase:import:add", ax, by, aw, 18, add, true, mx, my);
		hits.add(new Hit(ax, by, aw, 18, this::add));
		if (added >= 0) {
			Component done = added == 0 ? Ui.tr("slashclient-hud.skyCase.importNone") : Ui.tr("slashclient-hud.skyCase.importDone", added);
			Ui.draw(g, Ui.fit(done, ax - x - bw - 16), x + bw + 10, by + 5, added == 0 ? Ui.MUTED : Ui.ACCENT_LIGHT);
		}
		Ui.end();
	}

	void add() {
		added = SkyCase.addFromLog(text, minecraft.player == null ? "" : minecraft.player.getGameProfile().name());
	}

	/** For the test: pastes the text, as Ctrl+V would. */
	void paste(String value) {
		box.setValue(value);
	}

	int addedForTest() {
		return added;
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT) for (Hit h : hits) {
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return super.mouseClicked(e, doubleClick);
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		if (minecraft.level == null) extractPanorama(g, delta);
		g.fill(0, 0, width, height, minecraft.level == null ? 0x800A0D14 : 0x90000000);
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
//#endif
