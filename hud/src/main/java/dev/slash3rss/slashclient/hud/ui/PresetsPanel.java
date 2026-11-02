package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.config.HudPresets;
import dev.slash3rss.slashclient.hud.servers.ServerLayoutsPanel;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * The editor's "Share" page, under the codes: the ready layouts and the player's saved ones as
 * cards (one click puts one on, a saved one has a × that forgets it after a second click), a name
 * and Save that keep the modules as they are now, and over the cards "Back to my layout" while the
 * player's own modules wait to come back.
 */
public final class PresetsPanel {
	private PresetsPanel() {}

	/** For the test: the middle of each card (by its id), of Save, of the first saved one's × and of the way back, as last drawn. */
	public static final Map<String, double[]> centers = new HashMap<>();
	public static double[] saveCenter, firstDelete, backCenter;
	/** What the last click here did, shown under the cards. */
	public static Component message = Component.empty();
	/** The saved preset whose × was clicked once: the next click forgets it. */
	private static String deleting;

	/**
	 * Draws the section from `y` down; returns the y under it. `name` is the editor's field for a
	 * new preset's name (shown only while all of it is between `clipTop` and `clipBottom`), and
	 * `changed` runs after the HUD got another layout.
	 */
	public static int draw(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int clipTop, int clipBottom,
			EditBox name, ServerLayoutsPanel.Hits hits, Runnable changed) {
		Consumer<Component> done = m -> {
			message = m;
			changed.run();
		};
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.presets.title"), w), x, y + 2, Ui.TEXT);
		y = Ui.wrapped(g, Ui.tr("slashclient-hud.presets.help"), x, y + 16, w, Ui.TEXT_2) + 4;

		// the way back and what the last click did first, where they are seen without scrolling
		if (!message.getString().isEmpty()) y = Ui.wrapped(g, message, x, y, w, Ui.GREEN) + 3;
		backCenter = null;
		if (HudPresets.canGoBack()) {
			int bw = Math.min(w, 200);
			Ui.button(g, "presetBack", x, y, bw, 20, "undo", Ui.tr("slashclient-hud.presets.back"), false, mx, my);
			backCenter = new double[] { x + bw / 2.0, y + 10 };
			hits.add(x, y, bw, 20, () -> {
				HudPresets.goBack();
				done.accept(Ui.tr("slashclient-hud.presets.backDone"));
			});
			y += 24;
		}

		List<String> ids = new ArrayList<>(List.of(HudPresets.IDS));
		for (String saved : HudPresets.saved()) ids.add(HudPresets.OWN + saved);
		// three cards in a row, two in a narrow window
		int cols = w >= 330 ? 3 : 2, gap = 5, cw = (w - gap * (cols - 1)) / cols, ch = 30;
		String picked = HudPresets.picked();
		centers.clear();
		firstDelete = null;
		for (int i = 0; i < ids.size(); i++) {
			String id = ids.get(i);
			boolean own = id.startsWith(HudPresets.OWN);
			String savedName = own ? id.substring(HudPresets.OWN.length()) : null;
			int cx = x + (i % cols) * (cw + gap), cy = y + (i / cols) * (ch + gap);
			boolean on = id.equalsIgnoreCase(picked == null ? "" : picked), over = Ui.inside(mx, my, cx, cy, cw, ch);
			Ui.round(g, cx, cy, cw, ch, 4, over ? Ui.CARD_HOVER : Ui.CARD);
			Ui.roundOutline(g, cx, cy, cw, ch, 4, on ? Ui.withAlpha(Ui.ACCENT, 0xAA) : Ui.BORDER);
			Ui.icon(g, own ? "user" : HudPresets.ICONS.get(id), cx + 6, cy + 6, 10, on ? Ui.ACCENT_LIGHT : Ui.TEXT_2);
			Component title = own ? Ui.text(savedName).copy().withStyle(st -> st.withBold(true)) : Ui.trBold("slashclient-hud.presets." + id);
			if (on) title = title.copy().append(Ui.tr("slashclient-hud.servers.on").copy().withStyle(st -> st.withColor(Ui.ACCENT_LIGHT).withBold(false)));
			int textRight = own ? cw - 44 : cw - 26;
			Ui.draw(g, Ui.fit(title, textRight), cx + 21, cy + 6, Ui.TEXT);
			Component help = own ? Ui.tr(savedName.equals(deleting) ? "slashclient-hud.presets.deleteAsk" : "slashclient-hud.presets.own.help")
				: Ui.tr("slashclient-hud.presets." + id + ".help");
			Ui.draw(g, Ui.fit(help, cw - 12), cx + 6, cy + 18, own && savedName.equals(deleting) ? Ui.DANGER : Ui.MUTED);
			centers.put(id, new double[] { cx + cw / 2.0, cy + ch / 2.0 });
			hits.add(cx, cy, cw, ch, () -> {
				deleting = null;
				HudPresets.apply(id);
				done.accept(Ui.tr("slashclient-hud.presets.done", own ? Ui.text(savedName) : Ui.tr("slashclient-hud.presets." + id)));
			});
			if (own) {
				// the × after the card: the later place wins a click
				int bx = cx + cw - 18;
				Ui.button(g, "presetDelete:" + savedName, bx, cy + 3, 15, 13, "close", Component.empty(), savedName.equals(deleting), mx, my);
				if (firstDelete == null) firstDelete = new double[] { bx + 7.5, cy + 9.5 };
				hits.add(bx, cy + 3, 15, 13, () -> {
					if (!savedName.equals(deleting)) {
						deleting = savedName;
						return;
					}
					deleting = null;
					HudPresets.delete(savedName);
					done.accept(Ui.tr("slashclient-hud.presets.deleted", savedName));
				});
			}
		}
		y += ((ids.size() + cols - 1) / cols) * (ch + gap) + 1;

		// a name and Save: the modules as they are now become a preset of the player's own
		saveCenter = null;
		if (name != null) {
			int sw = Math.max(70, Ui.width(Ui.tr("slashclient-hud.presets.save")) + 26), fw = w - sw - 5;
			Ui.round(g, x, y, fw, 18, 4, 0xFF202839);
			Ui.roundOutline(g, x, y, fw, 18, 4, name.isFocused() ? Ui.withAlpha(Ui.ACCENT, 0x99) : Ui.BORDER);
			if (name.getValue().isEmpty() && !name.isFocused()) Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.presets.name"), fw - 12), x + 6, y + 5, Ui.MUTED);
			name.setX(x + 6);
			name.setY(y + 5);
			name.setWidth(fw - 12);
			// the widget is not clipped by the page's scissor: only while all of it is in the page's box
			name.visible = y >= clipTop && y + 18 <= clipBottom;
			boolean ok = HudPresets.canSave(name.getValue());
			Ui.button(g, "presetSave", x + fw + 5, y, sw, 18, "save", Ui.tr("slashclient-hud.presets.save"), ok, mx, my);
			saveCenter = new double[] { x + fw + 5 + sw / 2.0, y + 9 };
			hits.add(x + fw + 5, y, sw, 18, () -> {
				String typed = name.getValue().trim();
				if (!HudPresets.save(typed)) {
					done.accept(Ui.tr(typed.isEmpty() ? "slashclient-hud.presets.nameFirst" : "slashclient-hud.presets.full", HudPresets.MAX_SAVED)
						.copy().withStyle(st -> st.withColor(Ui.DANGER)));
					return;
				}
				name.setValue("");
				name.setFocused(false);
				done.accept(Ui.tr("slashclient-hud.presets.saved", typed));
			});
			y += 22;
		}

		return y + 4;
	}
}
