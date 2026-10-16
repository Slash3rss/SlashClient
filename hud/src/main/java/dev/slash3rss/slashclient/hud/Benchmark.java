package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * A repeatable FPS test: after a short warm-up the camera turns slowly once around at eye
 * level, then half around looking at the sky, then stands still, while every frame's time is
 * written down. The results go to config/slashclient-benchmarks.json (the launcher reads them)
 * and are shown on {@link BenchmarkScreen}, next to the run before.
 *
 * Started from the HUD settings window, or by itself a few seconds after the world loads when
 * the launcher asks for it (-Dslashclient.benchmark=true).
 */
public final class Benchmark {
	private Benchmark() {}

	static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-benchmarks.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	/** Runs kept in the file. */
	private static final int KEEP = 50;

	static final double WARMUP = 3, SPIN = 15, SKY = 6, STILL = 5;
	static final double LENGTH = WARMUP + SPIN + SKY + STILL;

	/** Asked for by the launcher: runs once, by itself, once the world is there. */
	private static boolean auto = Boolean.getBoolean("slashclient.benchmark");
	private static int autoWait;

	private static boolean running;
	private static long startedAt, lastFrame;
	private static float startYaw, startPitch;
	private static float[] frames = new float[4096];
	private static int count;
	private static double cpuSum;
	private static int cpuSamples;
	private static double gpuSum;
	private static int gpuSamples;
	private static long lastSample;

	/** The game measures the GPU only while something needs it (see GpuTimerMixin). */
	public static boolean running() {
		return running;
	}

	/** Whether this game was started by the launcher's Benchmark button. */
	public static boolean fromLauncher() {
		return Boolean.getBoolean("slashclient.benchmark");
	}

	/** One result, written exactly as the launcher reads it (src/main/benchmark.ts). */
	public static final class Result {
		public long at;
		public String version;
		public String world;
		public Fps fps = new Fps();
		public int frames;
		public int stutters;
		public Double cpu;
		public Double gpu;
		public Settings settings = new Settings();
		/** Frame times in ms; only for the screen right after the run, not saved. */
		public transient float[] frameTimes;
	}

	public static final class Fps {
		public double avg, low1, low01, median, min, max;
	}

	public static final class Settings {
		public int renderDistance;
		public Integer simulationDistance;
		public int width, height;
		public boolean vsync;
		public int maxFps;
		public boolean fullscreen;
		public int mods;
		public Long memoryMb;
	}

	public static void start(Minecraft mc) {
		if (mc.player == null || running) return;
		running = true;
		startedAt = System.nanoTime();
		lastFrame = 0;
		count = 0;
		cpuSum = gpuSum = 0;
		cpuSamples = gpuSamples = 0;
		lastSample = 0;
		startYaw = mc.player.getYRot();
		startPitch = mc.player.getXRot();
		if (Compat.screen(mc) != null) mc.setScreenAndShow(null);
	}

	/** Stops without a result (a menu was opened, the world was left). */
	public static void cancel(Minecraft mc) {
		if (!running) return;
		running = false;
		if (mc.player != null) look(mc, startYaw, startPitch);
		Compat.overlay(mc, Component.translatable("slashclient-hud.benchmark.cancelled"));
	}

	static void tick(Minecraft mc) {
		if (running) {
			if (mc.player == null) running = false;
			// Esc, the chat or an inventory spoil the measurement
			else if (Compat.screen(mc) != null && !(Compat.screen(mc) instanceof BenchmarkScreen)) cancel(mc);
			return;
		}
		if (!auto) return;
		// a few seconds in the world first, so chunks around are loaded
		if (mc.player != null && mc.level != null && Compat.screen(mc) == null) {
			if (++autoWait >= 100) {
				auto = false;
				start(mc);
			}
		} else autoWait = 0;
	}

	/** Every frame while drawing the HUD: the frame time, the camera, the progress line. */
	static void frame(GuiGraphicsExtractor g, Minecraft mc) {
		if (!running || mc.player == null) return;
		long now = System.nanoTime();
		double t = (now - startedAt) / 1e9;
		if (t >= WARMUP && lastFrame != 0) {
			if (count == frames.length) frames = Arrays.copyOf(frames, count * 2);
			frames[count++] = (now - lastFrame) / 1e6f;
		}
		lastFrame = now;
		if (t >= WARMUP && now - lastSample > 1_000_000_000L) {
			lastSample = now;
			double cpu = MoreModules.Cpu.load();
			if (cpu >= 0) {
				cpuSum += cpu;
				cpuSamples++;
			}
			double gpu = mc.getGpuUtilization();
			if (gpu > 0) {
				gpuSum += Math.min(100, gpu);
				gpuSamples++;
			}
		}

		// where the camera looks at this moment
		double s = t - WARMUP;
		if (s < 0) look(mc, startYaw, 0);
		else if (s < SPIN) look(mc, startYaw + (float) (s / SPIN * 360), 0);
		else if (s < SPIN + SKY) look(mc, startYaw + (float) ((s - SPIN) / SKY * 180), -35);
		else look(mc, startYaw, 0);

		if (t >= LENGTH) {
			finish(mc);
			return;
		}
		drawProgress(g, mc, t);
	}

	private static void look(Minecraft mc, float yaw, float pitch) {
		var p = mc.player;
		p.setYRot(yaw);
		p.setXRot(pitch);
		// no smoothing between the last frame's look and this one
		p.yRotO = yaw;
		p.xRotO = pitch;
	}

	private static void drawProgress(GuiGraphicsExtractor g, Minecraft mc, double t) {
		Component label = Ui.trBold(t < WARMUP ? "slashclient-hud.benchmark.warmup" : "slashclient-hud.benchmark.running");
		int w = Math.min(g.guiWidth() - 12, Math.max(160, Ui.width(label) + 52)), x = (g.guiWidth() - w) / 2, y = 6;
		Ui.round(g, x, y, w, 26, 6, 0xC0111622);
		Ui.draw(g, Ui.fit(label, w - 50), x + 8, y + 5, Ui.TEXT);
		Component left = Ui.text((int) Math.ceil(LENGTH - t) + " s");
		Ui.draw(g, left, x + w - 8 - Ui.width(left), y + 5, Ui.TEXT_2);
		Ui.round(g, x + 8, y + 17, w - 16, 3, 1, 0xFF2A3142);
		Ui.round(g, x + 8, y + 17, Math.max(2, (int) ((w - 16) * Math.min(1, t / LENGTH))), 3, 1, Ui.ACCENT);
	}

	private static void finish(Minecraft mc) {
		running = false;
		look(mc, startYaw, startPitch);
		Result r = result(mc, Arrays.copyOf(frames, count));
		Result before = latest();
		save(r);
		mc.setScreenAndShow(new BenchmarkScreen(r, before));
	}

	/** The numbers from the frame times (ms), as other tools give them. */
	static Result result(Minecraft mc, float[] times) {
		Result r = new Result();
		r.at = System.currentTimeMillis();
		r.version = net.minecraft.SharedConstants.getCurrentVersion().name();
		var server = mc.getSingleplayerServer();
		if (server != null) r.world = server.getWorldData().getLevelName();
		else if (mc.getCurrentServer() != null) r.world = mc.getCurrentServer().name;
		stats(r, times);
		if (cpuSamples > 0) r.cpu = Math.round(cpuSum / cpuSamples * 1000) / 1000.0;
		if (gpuSamples > 0) r.gpu = (double) Math.round(gpuSum / gpuSamples);

		var o = mc.options;
		r.settings.renderDistance = o.renderDistance().get();
		r.settings.simulationDistance = o.simulationDistance().get();
		r.settings.width = mc.getWindow().getWidth();
		r.settings.height = mc.getWindow().getHeight();
		r.settings.vsync = o.enableVsync().get();
		r.settings.maxFps = o.framerateLimit().get();
		r.settings.fullscreen = o.fullscreen().get();
		r.settings.mods = mods();
		r.settings.memoryMb = Runtime.getRuntime().maxMemory() / (1024 * 1024);
		r.frameTimes = times;
		return r;
	}

	static void stats(Result r, float[] times) {
		r.frames = times.length;
		if (times.length == 0) return;
		float[] sorted = times.clone();
		Arrays.sort(sorted);
		double total = 0;
		for (float f : times) total += f;
		r.fps.avg = round(times.length / (total / 1000));
		r.fps.median = round(1000 / sorted[sorted.length / 2]);
		r.fps.min = round(1000 / sorted[sorted.length - 1]);
		r.fps.max = round(1000 / Math.max(0.01f, sorted[0]));
		r.fps.low1 = round(low(sorted, 0.01));
		r.fps.low01 = round(low(sorted, 0.001));
		// frames that took more than twice the usual: what is felt as a stutter
		float limit = sorted[sorted.length / 2] * 2;
		for (float f : times) if (f > limit) r.stutters++;
	}

	/** "1% low": the FPS of the slowest `part` of frames, taken together. */
	private static double low(float[] sorted, double part) {
		int n = Math.max(1, (int) Math.ceil(sorted.length * part));
		double sum = 0;
		for (int i = sorted.length - n; i < sorted.length; i++) sum += sorted[i];
		return 1000 / (sum / n);
	}

	private static double round(double v) {
		return Math.round(v * 10) / 10.0;
	}

	/** Mods the player added: not the game, Java, Fabric's own pieces or mods bundled inside others. */
	private static int mods() {
		int n = 0;
		for (var mod : FabricLoader.getInstance().getAllMods()) {
			String id = mod.getMetadata().getId();
			// Fabric API's modules count as one mod (in a development run they are not inside its jar)
			if (id.equals("minecraft") || id.equals("java") || id.equals("fabricloader") || id.startsWith("fabric-") && !id.equals("fabric-api")
				|| mod.getContainingMod().isPresent()) continue;
			n++;
		}
		return n;
	}

	static List<Result> load() {
		List<Result> out = new ArrayList<>();
		try {
			if (!Files.exists(FILE)) return out;
			JsonElement data = JsonParser.parseString(Files.readString(FILE));
			if (!data.isJsonArray()) return out;
			for (JsonElement e : data.getAsJsonArray()) {
				try {
					Result r = GSON.fromJson(e, Result.class);
					if (r != null && r.fps != null && r.settings != null) out.add(r);
				} catch (RuntimeException ignored) {
					// one broken entry does not lose the others
				}
			}
		} catch (Exception e) {
			SlashHud.LOG.warn("Could not read benchmark results", e);
		}
		return out;
	}

	/** The newest saved run, or null. */
	public static Result latest() {
		Result best = null;
		for (Result r : load()) if (best == null || r.at > best.at) best = r;
		return best;
	}

	private static void save(Result r) {
		List<Result> all = load();
		all.add(r);
		all.sort((a, b) -> Long.compare(a.at, b.at));
		if (all.size() > KEEP) all = all.subList(all.size() - KEEP, all.size());
		JsonArray arr = new JsonArray();
		for (Result x : all) arr.add(GSON.toJsonTree(x));
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(arr));
		} catch (Exception e) {
			SlashHud.LOG.warn("Could not save the benchmark result", e);
		}
	}
}
