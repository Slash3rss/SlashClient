package dev.slash3rss.slashclient.hud.replay;

import com.mojang.blaze3d.platform.InputConstants;
import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * The instant replay's viewer (Replay): the last seconds of the screen over the whole window, with a
 * timeline to click or drag, play/pause (Space), frame by frame (← → or , .), 0.25×–2×, a loop, a
 * selection (I and O) and "Save as clip" through the clips' own writer. The game goes on under it
 * (in singleplayer it can stop, see the card's setting); frames are not recorded while it is open.
 */
public class ReplayScreen extends Screen {
	static final float[] SPEEDS = { 0.25f, 0.5f, 1f, 2f };
	private static final Identifier TEXTURE = Identifier.fromNamespaceAndPath(SlashHud.ID, "replay_frame");

	private final List<Clips.Frame> frames;
	/** Each frame's time in seconds from the first one. */
	private final double[] times;
	private final ReplayDecoder decoder;
	private DynamicTexture texture;
	private int shown = -1;

	private double pos;
	private boolean playing = true, loop, scrubbing, playingBeforeScrub;
	private float speed = 1f;
	/** The selection's first and last frame (-1: not set). */
	private int in = -1, out = -1;
	private long lastNanos;
	private Path saved;
	private long savedAt;

	private record Hit(int x, int y, int w, int h, Runnable run) {}
	private final List<Hit> hits = new ArrayList<>();
	/** The timeline on screen, from the last frame drawn (for the mouse). */
	private int tx, ty, tw;

	public ReplayScreen(List<Clips.Frame> frames) {
		super(Component.translatable("slashclient-hud.replay.title"));
		this.frames = frames;
		this.times = new double[frames.size()];
		long first = frames.get(0).at();
		for (int i = 0; i < times.length; i++) times[i] = (frames.get(i).at() - first) / 1e9;
		this.decoder = new ReplayDecoder(frames);
	}

	// ---------- playback ----------

	double duration() {
		return times[times.length - 1];
	}

	/** The frame shown at `seconds`: the last one taken at or before it. */
	int indexAt(double seconds) {
		int lo = 0, hi = times.length - 1;
		while (lo < hi) {
			int mid = (lo + hi + 1) >>> 1;
			if (times[mid] <= seconds + 1e-9) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	int index() {
		return indexAt(pos);
	}

	boolean playing() {
		return playing;
	}

	double position() {
		return pos;
	}

	/** The picture in the texture now (null before the first one is decoded). */
	NativeImage shownPicture() {
		return texture == null ? null : texture.getPixels();
	}

	private int rangeStart() {
		return in >= 0 && out >= 0 ? Math.min(in, out) : in >= 0 ? in : 0;
	}

	private int rangeEnd() {
		return in >= 0 && out >= 0 ? Math.max(in, out) : out >= 0 ? out : times.length - 1;
	}

	private boolean hasSelection() {
		return in >= 0 || out >= 0;
	}

	/** Moves the playback on by the real time since the last frame, at the chosen speed. */
	private void advance() {
		long now = System.nanoTime();
		double dt = lastNanos == 0 ? 0 : Math.min(0.25, (now - lastNanos) / 1e9);
		lastNanos = now;
		if (!playing || scrubbing) return;
		pos += dt * speed;
		double start = times[rangeStart()], end = times[rangeEnd()];
		if (pos >= end) {
			if (loop && end > start) pos = start + (pos - end) % (end - start);
			else {
				pos = end;
				playing = false;
			}
		}
	}

	void togglePlay() {
		if (!playing && pos >= times[rangeEnd()] - 1e-6) pos = times[rangeStart()];
		playing = !playing;
	}

	void step(int frames) {
		playing = false;
		pos = times[Math.max(0, Math.min(times.length - 1, index() + frames))];
	}

	void seek(double seconds) {
		pos = Math.max(0, Math.min(duration(), seconds));
	}

	void setSpeed(float s) {
		speed = s;
	}

	void setLoop(boolean on) {
		loop = on;
	}

	void markIn() {
		in = index();
		if (out >= 0 && out < in) out = -1;
	}

	void markOut() {
		out = index();
		if (in >= 0 && in > out) in = -1;
	}

	void clearMarks() {
		in = out = -1;
	}

	/** Saves the selection (or all that the viewer has) as a clip; the file, or null when one is already being written. */
	Path save() {
		List<Clips.Frame> range = new ArrayList<>(frames.subList(rangeStart(), rangeEnd() + 1));
		Path file = Clips.write(Minecraft.getInstance(), range, "replay");
		if (file != null) {
			saved = file;
			savedAt = System.currentTimeMillis();
		}
		return file;
	}

	/** For the test: frames in the viewer, the one shown, the selection's size and the decoder's work. */
	String state() {
		return times.length + " " + shown + " " + index() + " " + (rangeEnd() - rangeStart() + 1) + " " + decoder.decoded.get() + " "
			+ (decoder.decoded.get() == 0 ? 0 : decoder.decodeNanos / decoder.decoded.get() / 1000) + " " + speed + " " + playing;
	}

	// ---------- drawing ----------

	/** Puts the frame for the playback's position in the texture once it is decoded (until then the last one stays). */
	private void updateTexture() {
		int i = index();
		NativeImage image = decoder.get(i, 1);
		if (image == null || i == shown) return;
		Clips.Frame f = frames.get(i);
		if (texture == null) {
			texture = new DynamicTexture(() -> "SlashClient replay", new NativeImage(f.width(), f.height(), false));
			Minecraft.getInstance().getTextureManager().register(TEXTURE, texture);
		}
		texture.getPixels().copyFrom(image);
		texture.upload();
		shown = i;
	}

	private static String clock(double s) {
		int m = (int) (s / 60);
		return String.format(Locale.ROOT, "%d:%04.1f", m, s - m * 60);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// before 1.21.6 a screen's own render() draws its background
		//#if MC < 1.21.6
		//$ extractBackground(g, mx, my, delta);
		//#endif
		Minecraft mc = Minecraft.getInstance();
		advance();
		updateTexture();
		hits.clear();

		// the top bar: what this is, whether the game goes on, ✕
		Component title = Ui.trBold("slashclient-hud.replay.title");
		Ui.icon(g, "m-replay", 10, 7, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, title, 25, 8, Ui.TEXT);
		Component state = Ui.tr(mc.isPaused() ? "slashclient-hud.replay.paused" : "slashclient-hud.replay.running");
		int sx = 25 + Ui.width(title) + 10, sw = Ui.width(state) + 14;
		Ui.round(g, sx, 5, sw, 14, 7, mc.isPaused() ? 0x40FACC15 : 0x404ADE80);
		g.fill(sx + 5, 11, sx + 8, 14, mc.isPaused() ? 0xFFFACC15 : 0xFF4ADE80);
		Ui.draw(g, state, sx + 11, 8, 0xFFE5E7EB);
		int cw = Ui.buttonWidth(Ui.tr("slashclient-hud.replay.close"), "close", 16, 2);
		button(g, "close", width - cw - 6, 4, cw, 16, "close", Ui.tr("slashclient-hud.replay.close"), false, mx, my, this::onClose);

		// the controls at the bottom: help, two rows of buttons, the timeline above them
		int row2 = height - 34, row1 = row2 - 22, lineY = row1 - 14;
		Component help = Ui.tr("slashclient-hud.replay.help");
		if (Ui.width(help) <= width - 20) Ui.centered(g, help, width / 2, height - 12, Ui.MUTED);

		// the picture, as large as fits between the bars
		Clips.Frame f = frames.get(Math.max(0, shown));
		int areaTop = 26, areaH = lineY - 10 - areaTop, areaW = width - 20;
		float fit = Math.min((float) areaW / f.width(), (float) areaH / f.height());
		int vw = Math.max(1, Math.round(f.width() * fit)), vh = Math.max(1, Math.round(f.height() * fit));
		int vx = (width - vw) / 2, vy = areaTop + (areaH - vh) / 2;
		g.fill(vx - 1, vy - 1, vx + vw + 1, vy + vh + 1, 0xFF1F2937);
		if (texture != null) {
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, TEXTURE, vx, vy, 0, 0, vw, vh, f.width(), f.height(), f.width(), f.height(), 0xFFFFFFFF);
		} else {
			g.fill(vx, vy, vx + vw, vy + vh, 0xFF000000);
		}

		drawTimeline(g, mx, my, 12, lineY, width - 24);

		// row 1: ⏮ ▶ ⏭, the time, the speeds
		int x = 12;
		button(g, "back", x, row1, 22, 18, "step-back", Component.empty(), false, mx, my, () -> step(-1));
		x += 24;
		button(g, "play", x, row1, 26, 18, playing ? "pause" : "play", Component.empty(), true, mx, my, this::togglePlay);
		x += 28;
		button(g, "forward", x, row1, 22, 18, "step-forward", Component.empty(), false, mx, my, () -> step(1));
		x += 30;
		Component time = Ui.text(clock(pos) + " / " + clock(duration()));
		Ui.draw(g, time, x, row1 + 5, Ui.TEXT);
		x += Ui.width(time) + 6;
		Component ago = Ui.text(String.format(Locale.ROOT, "(-%.1f s)", duration() - pos));
		if (x + Ui.width(ago) < width - 12 - 4 * 34) Ui.draw(g, ago, x, row1 + 5, Ui.MUTED);
		int bx = width - 12;
		for (int k = SPEEDS.length - 1; k >= 0; k--) {
			float s = SPEEDS[k];
			Component label = Ui.text((s == 0.25f ? "0.25" : s == 0.5f ? "0.5" : String.valueOf((int) s)) + "×");
			int w = Ui.width(label) + 12;
			bx -= w;
			boolean active = s == speed;
			if (active) {
				Ui.accent(g, bx, row1 + 1, w, 16, 4, 0);
				Ui.centered(g, label, bx + w / 2, row1 + 5, 0xFFFFFFFF);
			} else Ui.button(g, "speed" + k, bx, row1 + 1, w, 16, label, false, mx, my);
			hits.add(new Hit(bx, row1 + 1, w, 16, () -> setSpeed(s)));
			bx -= 4;
		}

		// row 2: loop and the selection on the left, saving on the right
		x = 12;
		x += toggleButton(g, "loop", x, row2, "repeat", Ui.tr("slashclient-hud.replay.loop"), loop, mx, my, () -> setLoop(!loop)) + 4;
		x += toggleButton(g, "in", x, row2, null, Ui.text("[ ").append(Ui.tr("slashclient-hud.replay.markIn")), in >= 0, mx, my, this::markIn) + 4;
		x += toggleButton(g, "out", x, row2, null, Ui.tr("slashclient-hud.replay.markOut").append(Ui.text(" ]")), out >= 0, mx, my, this::markOut) + 4;
		if (hasSelection()) x += toggleButton(g, "all", x, row2, null, Ui.tr("slashclient-hud.replay.clearMarks"), false, mx, my, this::clearMarks) + 4;
		Component saveLabel = Ui.tr(hasSelection() ? "slashclient-hud.replay.saveRange" : "slashclient-hud.replay.save");
		int svw = Ui.buttonWidth(saveLabel, "save", 18, 4);
		int svx = width - 12 - svw;
		button(g, "save", svx, row2, svw, 18, "save", saveLabel, true, mx, my, this::save);
		// how the saving goes, left of its button
		Component status = null;
		if (Clips.saving()) status = Ui.tr("slashclient-hud.replay.saving");
		else if (saved != null && System.currentTimeMillis() - savedAt < 5000) status = Ui.tr("slashclient-hud.replay.saved", saved.getFileName().toString());
		if (status != null) {
			status = Ui.fit(status, Math.max(0, svx - x - 10));
			Ui.draw(g, status, svx - 8 - Ui.width(status), row2 + 5, Ui.GREEN);
		}
	}

	/** A button that stays lit while its option is on; returns its width. */
	private int toggleButton(GuiGraphicsExtractor g, String id, int x, int y, String icon, Component label, boolean on, int mx, int my, Runnable run) {
		int w = Ui.buttonWidth(label, icon, 18, 2);
		if (on) {
			Ui.round(g, x, y, w, 18, 4, 0xFF1B2B4D);
			Ui.roundOutline(g, x, y, w, 18, 4, Ui.ACCENT);
			int iw = icon == null ? 0 : 15;
			int left = x + (w - iw - Ui.width(label)) / 2;
			if (icon != null) Ui.icon(g, icon, left, y + 4, 10, Ui.ACCENT_LIGHT);
			Ui.draw(g, label, left + iw, y + 5, Ui.TEXT);
		} else Ui.button(g, id, x, y, w, 18, icon, label, false, mx, my);
		hits.add(new Hit(x, y, w, 18, run));
		return w;
	}

	private void button(GuiGraphicsExtractor g, String id, int x, int y, int w, int h, String icon, Component label, boolean primary, int mx, int my, Runnable run) {
		Ui.button(g, "replay:" + id, x, y, w, h, icon, label, primary, mx, my);
		hits.add(new Hit(x, y, w, h, run));
	}

	/** The timeline: what has played, the selection, a tick every 5 s and the playhead. */
	private void drawTimeline(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w) {
		tx = x;
		ty = y;
		tw = w;
		double d = Math.max(0.001, duration());
		Ui.round(g, x, y, w, 6, 3, 0xFF2A3142);
		for (int s = 5; s < d; s += 5) {
			int px = x + (int) Math.round(w * s / d);
			g.fill(px, y + 7, px + 1, y + 10, 0x50FFFFFF);
		}
		int head = x + (int) Math.round(w * pos / d);
		Ui.round(g, x, y, Math.max(6, head - x), 6, 3, Ui.ACCENT);
		// the selection: a yellow band with its ends marked
		if (hasSelection()) {
			int a = x + (int) Math.round(w * times[rangeStart()] / d), b = x + (int) Math.round(w * times[rangeEnd()] / d);
			g.fill(a, y - 3, Math.max(a + 1, b), y + 9, 0x50FACC15);
			g.fill(a, y - 4, a + 2, y + 10, 0xFFFACC15);
			g.fill(b - 1, y - 4, b + 1, y + 10, 0xFFFACC15);
		}
		Ui.round(g, head - 3, y - 3, 7, 12, 3, 0xFFFFFFFF);
		// where a click would go
		if (!scrubbing && Ui.inside(mx, my, x, y - 5, w, 16)) {
			Component at = Ui.text(clock(Math.max(0, Math.min(d, (mx - x) * d / w))));
			int lw = Ui.width(at) + 8;
			int lx = Math.max(x, Math.min(x + w - lw, mx - lw / 2));
			Ui.round(g, lx, y - 17, lw, 12, 3, 0xE0111622);
			Ui.draw(g, at, lx + 4, y - 15, Ui.TEXT);
		}
	}

	private void seekTo(double mouseX) {
		if (tw <= 0) return;
		seek((mouseX - tx) * duration() / tw);
	}

	// ---------- input ----------

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		if (e.button() == 0) {
			if (Ui.inside(e.x(), e.y(), tx - 4, ty - 5, tw + 8, 16)) {
				scrubbing = true;
				playingBeforeScrub = playing;
				seekTo(e.x());
				return true;
			}
			for (Hit h : List.copyOf(hits)) {
				if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
					h.run().run();
					return true;
				}
			}
		}
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
		if (scrubbing) {
			seekTo(e.x());
			return true;
		}
		return false;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseReleased(MouseButtonEvent e) {
	//#else
	//$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (scrubbing) {
			scrubbing = false;
			playing = playingBeforeScrub && pos < duration();
			return true;
		}
		//#if MC >= 1.21.9
		return super.mouseReleased(e);
		//#else
		//$ return super.mouseReleased(e.x(), e.y(), e.button());
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		int k = e.key();
		if (k == InputConstants.KEY_SPACE) togglePlay();
		else if (k == InputConstants.KEY_LEFT || k == InputConstants.KEY_COMMA) step(-1);
		else if (k == InputConstants.KEY_RIGHT || k == InputConstants.KEY_PERIOD) step(1);
		else if (k == InputConstants.KEY_I) markIn();
		else if (k == InputConstants.KEY_O) markOut();
		else if (k == InputConstants.KEY_L) setLoop(!loop);
		else if (Replay.key != null && Replay.key.matches(e)) onClose();
		else {
			//#if MC >= 1.21.9
			return super.keyPressed(e);
			//#else
			//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
			//#endif
		}
		return true;
	}

	@Override
	public boolean isPauseScreen() {
		// only singleplayer stops (the game decides that), and only when the card says so
		return SlashHud.config.replayPause;
	}

	@Override
	public void removed() {
		decoder.close();
		if (texture != null) {
			Minecraft.getInstance().getTextureManager().release(TEXTURE);
			texture = null;
		}
		super.removed();
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		g.fill(0, 0, width, height, 0xFF07090E);
	}
}
