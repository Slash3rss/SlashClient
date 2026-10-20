package dev.slash3rss.slashclient.hud.social;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;

import java.io.File;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * "Send a screenshot" from the friends chat: the player's newest screenshots as a grid, one click
 * sends that one to the friend. The launcher encrypts it before it leaves the computer, so only
 * the two of them can see it.
 */
public class ShotPickerScreen extends Screen {
	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd.MM HH:mm").withZone(ZoneId.systemDefault());
	private static final int COLS = 3, ROWS = 2;

	private final Screen parent;
	private final String friendId;
	private final String friendName;
	private final List<File> shots;
	private record Hit(int x, int y, int w, int h, Runnable action) {}
	private final List<Hit> hits = new ArrayList<>();
	private int px, py, pw, ph;

	/** Set when the picture goes to a group (or the clan's) chat instead of a friend. */
	private String groupId;

	public ShotPickerScreen(Screen parent, String friendId, String friendName) {
		super(Component.translatable("slashclient-hud.picture.pick"));
		this.parent = parent;
		this.friendId = friendId;
		this.friendName = friendName;
		this.shots = newest(COLS * ROWS);
	}

	/** The picker for a group's chat (`title`: the group's name, for the toast). */
	public static ShotPickerScreen forGroup(Screen parent, String groupId, String title) {
		ShotPickerScreen s = new ShotPickerScreen(parent, null, title);
		s.groupId = groupId;
		return s;
	}

	/** The newest PNGs in this game's screenshots folder. */
	static List<File> newest(int n) {
		File[] files = new File(net.minecraft.client.Minecraft.getInstance().gameDirectory, "screenshots").listFiles((d, name) -> name.endsWith(".png"));
		if (files == null) return List.of();
		return Arrays.stream(files).sorted(Comparator.comparingLong(File::lastModified).reversed()).limit(n).toList();
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 420);
		ph = Math.min(height - 24, 268);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("screenshot picker", px, py, pw, ph);
		Ui.button(g, "shots:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		Ui.icon(g, "m-screenshot", px + 10, py + 10, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.picture.pickTitle", friendName), pw - 60), px + 25, py + 10, Ui.TEXT);
		Ui.icon(g, "lock", px + 10, py + 22, 8, Ui.MUTED);
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.picture.private", friendName), pw - 40), px + 22, py + 22, Ui.MUTED);
		g.fill(px + 8, py + 34, px + pw - 8, py + 35, Ui.BORDER);

		if (shots.isEmpty()) {
			Ui.icon(g, "image", px + pw / 2 - 8, py + ph / 2 - 24, 16, Ui.MUTED);
			Ui.centered(g, Ui.fit(Ui.tr("slashclient-hud.picture.none"), pw - 20), px + pw / 2, py + ph / 2, Ui.MUTED);
		} else {
			int gap = 8, top = py + 42;
			int cw = (pw - 20 - gap * (COLS - 1)) / COLS, ch = (ph - (top - py) - 10 - gap * (ROWS - 1)) / ROWS;
			File recent = dev.slash3rss.slashclient.hud.Shots.recent();
			for (int i = 0; i < shots.size(); i++) {
				File f = shots.get(i);
				int cx = px + 10 + (i % COLS) * (cw + gap), cy = top + (i / COLS) * (ch + gap);
				boolean over = Ui.inside(mx, my, cx, cy, cw, ch);
				float t = Ui.hover("shot:" + f.getName(), over);
				Ui.round(g, cx, cy, cw, ch, 5, Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
				Ui.roundOutline(g, cx, cy, cw, ch, 5, Ui.blend(Ui.BORDER, 0x993B82F6, t));
				// the picture above its date
				int iw = cw - 8, ih = ch - 20;
				ChatImages.Texture tex = ChatImages.file(f);
				if (tex.ready()) {
					int[] size = ChatImages.fit(tex.w(), tex.h(), iw, ih);
					g.blit(RenderPipelines.GUI_TEXTURED, tex.id(), cx + 4 + (iw - size[0]) / 2, cy + 4 + (ih - size[1]) / 2, 0, 0, size[0], size[1], tex.w(), tex.h(), tex.w(), tex.h(), 0xFFFFFFFF);
				} else Ui.icon(g, "image", cx + cw / 2 - 6, cy + 4 + ih / 2 - 6, 12, Ui.MUTED);
				Component when = Ui.text(WHEN.format(Instant.ofEpochMilli(f.lastModified())));
				Ui.draw(g, Ui.fit(when, cw - 10), cx + 5, cy + ch - 12, Ui.TEXT_2);
				if (f.equals(recent)) {
					Component fresh = Ui.trBold("slashclient-hud.picture.new");
					int bw = Ui.width(fresh) + 8;
					Ui.round(g, cx + cw - bw - 4, cy + ch - 14, bw, 11, 4, Ui.ACCENT);
					Ui.draw(g, fresh, cx + cw - bw, cy + ch - 12, 0xFFFFFFFF);
				}
				hits.add(new Hit(cx, cy, cw, ch, () -> send(f)));
			}
		}
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	private void send(File f) {
		if (groupId != null) Social.sendGroupImage(groupId, f);
		else Social.sendImage(friendId, f, null);
		if (f.equals(dev.slash3rss.slashclient.hud.Shots.recent())) dev.slash3rss.slashclient.hud.Shots.forgetRecent();
		Social.toast(friendName, Component.translatable("slashclient-hud.picture.sending").getString(), "m-screenshot");
		onClose();
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (e.button() != InputConstants.MOUSE_BUTTON_LEFT) return false;
		for (Hit h : List.copyOf(hits)) {
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}

	@Override
	public void onClose() {
		minecraft.setScreenAndShow(parent);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		if (minecraft.level == null) {
			extractPanorama(g, delta);
			g.fill(0, 0, width, height, 0x800A0D14);
		} else g.fill(0, 0, width, height, 0x50000000);
	}
}
