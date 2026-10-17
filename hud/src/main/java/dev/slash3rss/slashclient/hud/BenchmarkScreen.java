package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * A benchmark's result: average FPS large, the lows and the load as tiles, every frame's time
 * as a graph, the settings it ran with and how it compares to the run before.
 */
public class BenchmarkScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final List<Hit> hits = new ArrayList<>();
	private final Benchmark.Result result, before;

	public BenchmarkScreen(Benchmark.Result result, Benchmark.Result before) {
		super(Component.translatable("slashclient-hud.benchmark"));
		this.result = result;
		this.before = before;
	}

	/** The last run, from the settings window. */
	public static BenchmarkScreen latest() {
		List<Benchmark.Result> all = Benchmark.load();
		all.sort((a, b) -> Long.compare(b.at, a.at));
		return new BenchmarkScreen(all.isEmpty() ? null : all.get(0), all.size() > 1 ? all.get(1) : null);
	}

	private static String num(double v) {
		return String.valueOf(Math.round(v));
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		hits.clear();
		int pw = Math.min(width - 16, 440);
		int ph = Math.min(height - 16, 286);
		int px = (width - pw) / 2, py = (height - ph) / 2;
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("benchmark", px, py, pw, ph);
		Ui.icon(g, "m-benchmark", px + 14, py + 11, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.trBold("slashclient-hud.benchmark"), px + 30, py + 12, Ui.TEXT);
		Ui.button(g, "bench:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		g.fill(px + 1, py + 31, px + pw - 1, py + 32, Ui.BORDER);

		int x = px + 12, w = pw - 24, y = py + 40;
		int buttonsY = py + ph - 30;
		if (result == null) {
			Ui.wrapped(g, Ui.tr("slashclient-hud.benchmark.none"), x, y + 20, w, Ui.TEXT_2);
		} else {
			y = summary(g, x, y, w);
			y = tiles(g, x, y + 8, w);
			// the graph takes what is left above the settings line
			int settingsY = buttonsY - 16;
			if (result.frameTimes != null && settingsY - y - 10 >= 24) graph(g, x, y + 8, w, settingsY - y - 14);
			Component settings = Ui.text(settingsLine());
			Ui.draw(g, Ui.fit(settings, w), x, settingsY, Ui.MUTED);
		}
		buttons(g, px, buttonsY, pw, mx, my);
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	/** Average FPS large, where it ran and the change since the last run. Returns the y below. */
	private int summary(GuiGraphicsExtractor g, int x, int y, int w) {
		var pose = g.pose();
		Component big = Ui.bold(num(result.fps.avg));
		pose.pushMatrix();
		pose.translate(x, y);
		pose.scale(2, 2);
		Ui.draw(g, big, 0, 0, Ui.TEXT);
		pose.popMatrix();
		int bw = Ui.width(big) * 2;
		Ui.draw(g, Ui.tr("slashclient-hud.benchmark.avg"), x + bw + 6, y + 2, Ui.TEXT_2);
		if (before != null && before.fps.avg > 0) {
			double change = (result.fps.avg - before.fps.avg) / before.fps.avg * 100;
			String sign = change >= 0 ? "+" : "−";
			Component c = Ui.tr("slashclient-hud.benchmark.change", sign + Math.round(Math.abs(change)) + "%");
			Ui.draw(g, Ui.fit(c, w - bw - 6), x + bw + 6, y + 12, Math.abs(change) < 3 ? Ui.TEXT_2 : change > 0 ? Ui.GREEN : 0xFFF87171);
		}
		String where = (result.world == null ? "" : result.world + "  ·  ") + result.version + "  ·  "
			+ java.time.format.DateTimeFormatter.ofPattern("d.MM HH:mm").format(java.time.Instant.ofEpochMilli(result.at).atZone(java.time.ZoneId.systemDefault()));
		Component wc = Ui.fit(Ui.text(where), w);
		Ui.draw(g, wc, x, y + 22, Ui.MUTED);
		return y + 32;
	}

	private int tiles(GuiGraphicsExtractor g, int x, int y, int w) {
		List<String[]> t = new ArrayList<>();
		t.add(new String[] { "slashclient-hud.benchmark.low1", num(result.fps.low1) });
		t.add(new String[] { "slashclient-hud.benchmark.low01", num(result.fps.low01) });
		t.add(new String[] { "slashclient-hud.benchmark.median", num(result.fps.median) });
		t.add(new String[] { "slashclient-hud.benchmark.stutters", String.valueOf(result.stutters) });
		t.add(new String[] { "slashclient-hud.benchmark.cpu", result.cpu == null ? "—" : Math.round(result.cpu * 100) + "%" });
		t.add(new String[] { "slashclient-hud.benchmark.gpu", result.gpu == null ? "—" : Math.round(result.gpu) + "%" });
		int cols = w >= 330 ? 6 : 3, gap = 5;
		int tw = (w - gap * (cols - 1)) / cols, th = 30;
		for (int i = 0; i < t.size(); i++) {
			int tx = x + i % cols * (tw + gap), ty = y + i / cols * (th + gap);
			Ui.round(g, tx, ty, tw, th, 4, Ui.CARD);
			Ui.begin("tile " + i, tx, ty, tw, th);
			Ui.draw(g, Ui.fit(Ui.bold(t.get(i)[1]), tw - 12), tx + 6, ty + 5, Ui.TEXT);
			Ui.draw(g, Ui.fit(Ui.tr(t.get(i)[0]), tw - 12), tx + 6, ty + 17, Ui.MUTED);
			Ui.end();
		}
		int rows = (t.size() + cols - 1) / cols;
		return y + rows * th + (rows - 1) * gap;
	}

	/** Every frame's time, slowest of each column; red where a frame took twice the usual. */
	private void graph(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		Ui.round(g, x, y, w, h, 4, Ui.CARD);
		float[] times = result.frameTimes;
		if (times.length == 0) return;
		float[] sorted = times.clone();
		java.util.Arrays.sort(sorted);
		float median = sorted[sorted.length / 2];
		// the scale ends a bit above the slow frames, so one huge hitch does not flatten the rest
		float top = Math.max(median * 2.5f, sorted[Math.min(sorted.length - 1, (int) (sorted.length * 0.995))] * 1.15f);
		int gx = x + 4, gw = w - 8, gy = y + 4, gh = h - 8;
		// the median as a guide line
		int my = gy + gh - Math.round(Math.min(1, median / top) * gh);
		g.fill(gx, my, gx + gw, my + 1, 0x30FFFFFF);
		for (int col = 0; col < gw; col++) {
			int from = (int) ((long) col * times.length / gw), to = Math.max(from + 1, (int) ((long) (col + 1) * times.length / gw));
			float worst = 0;
			for (int i = from; i < Math.min(to, times.length); i++) worst = Math.max(worst, times[i]);
			int bh = Math.max(1, Math.round(Math.min(1, worst / top) * gh));
			g.fill(gx + col, gy + gh - bh, gx + col + 1, gy + gh, worst > median * 2 ? 0xFFF87171 : Ui.ACCENT);
		}
		Component label = Ui.text(String.format("%.1f ms", median));
		Ui.draw(g, label, gx + gw - Ui.width(label) - 2, Math.max(gy, my - 10), Ui.TEXT_2);
	}

	private String settingsLine() {
		var s = result.settings;
		String on = Component.translatable("options.on").getString(), off = Component.translatable("options.off").getString();
		return Component.translatable("slashclient-hud.benchmark.settings", s.renderDistance, s.width + "×" + s.height,
			s.vsync ? on : off, s.maxFps >= 260 ? "∞" : String.valueOf(s.maxFps), s.mods).getString();
	}

	private void buttons(GuiGraphicsExtractor g, int px, int y, int pw, int mx, int my) {
		List<Component> labels = new ArrayList<>();
		List<Runnable> actions = new ArrayList<>();
		List<String> icons = new ArrayList<>();
		if (minecraft.player != null) {
			labels.add(Ui.tr("slashclient-hud.benchmark.again"));
			icons.add("reset");
			actions.add(() -> Benchmark.start(minecraft));
		}
		if (Benchmark.fromLauncher()) {
			labels.add(Ui.tr("slashclient-hud.benchmark.quit"));
			icons.add("power");
			actions.add(minecraft::stop);
		}
		labels.add(Ui.tr("gui.done"));
		icons.add("check");
		actions.add(this::onClose);
		int gap = 6, total = -gap;
		int[] ws = new int[labels.size()];
		for (int i = 0; i < ws.length; i++) total += (ws[i] = Ui.buttonWidth(labels.get(i), icons.get(i), 20, 6)) + gap;
		int bx = px + pw - 12 - total;
		for (int i = 0; i < ws.length; i++) {
			Ui.button(g, "bench:b" + i, bx, y, ws[i], 20, icons.get(i), labels.get(i), i == 0, mx, my);
			hits.add(new Hit(bx, y, ws[i], 20, actions.get(i)));
			bx += ws[i] + gap;
		}
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		if (super.mouseClicked(e, doubleClick)) return true;
		for (Hit h : List.copyOf(hits)) {
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		g.fill(0, 0, width, height, 0x90000000);
	}
}
