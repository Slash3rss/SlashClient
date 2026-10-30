package dev.slash3rss.slashclient.hud.ui;

import net.minecraft.client.gui.GuiGraphicsExtractor;

/**
 * A scrollbar to take hold of: drag its thumb, or click the track to jump there. A screen draws it
 * each frame next to its list, hands it the mouse presses, drags and releases, and reads the
 * scroll back while it is dragged.
 */
public final class Scrollbar {
	/** The track: where the thumb moves. */
	private int x, y, h;
	private int thumbY, thumbH;
	private float max;
	private boolean shown;
	/** Where on the thumb it was taken (from its top), or -1 when it is not held. */
	private double grab = -1;

	/** Before a frame: hidden until drawn again (a list that fits has none). */
	public void hide() {
		shown = false;
	}

	public boolean dragging() {
		return grab >= 0;
	}

	/** Draws the bar for a list scrolled `scroll` of `max` (nothing when it all fits). */
	public void draw(GuiGraphicsExtractor g, int x, int y, int h, float scroll, float max, int mx, int my) {
		if (!layout(x, y, h, scroll, max)) return;
		boolean over = dragging() || Ui.inside(mx, my, x - 3, thumbY, 9, thumbH);
		g.fill(x, y, x + 3, y + h, 0x18FFFFFF);
		Ui.round(g, x, thumbY, 3, thumbH, 1, over ? Ui.withAlpha(Ui.ACCENT_LIGHT, 0xC0) : 0x50FFFFFF);
	}

	/** Where the bar and its thumb are (without drawing them); false when the list fits and there is none. */
	public boolean layout(int x, int y, int h, float scroll, float max) {
		shown = max > 0 && h > 0;
		if (!shown) return false;
		this.x = x;
		this.y = y;
		this.h = h;
		this.max = max;
		thumbH = Math.max(16, Math.round(h * (float) h / (h + max)));
		thumbY = y + Math.round((h - thumbH) * Math.max(0, Math.min(1, scroll / max)));
		return true;
	}

	/** A press: true when it took the bar (the caller then reads `drag`). */
	public boolean press(double mx, double my) {
		if (!shown || !Ui.inside(mx, my, x - 4, y, 11, h)) return false;
		// on the thumb: held where taken; on the track: the thumb's middle jumps under the mouse
		grab = my >= thumbY && my < thumbY + thumbH ? my - thumbY : thumbH / 2.0;
		return true;
	}

	/** While held: the scroll for the mouse at `my`; NaN when not held. */
	public float drag(double my) {
		if (!dragging()) return Float.NaN;
		double span = Math.max(1, h - thumbH);
		return (float) (Math.max(0, Math.min(1, (my - grab - y) / span)) * max);
	}

	public void release() {
		grab = -1;
	}
}
