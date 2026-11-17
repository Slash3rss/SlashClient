package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Opening the chat, the pause menu and the tab list does not stall the game: the frames right after
 * opening, and the ones around, take about as long as usual, also with every HUD module on. Switching
 * to a screen (the pause menu, the options, the inventory) is logged too. The tests step the game a tick at a time, so a frame's
 * time is how long the game's thread was busy in it (sampled); while the first frames after opening are
 * drawn, the sampler also counts where the time goes, logged to find what a stall comes from.
 */
public class GameScreenSpike implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(60);
			var server = world.getServer();
			// singleplayer shows the tab list only with an objective on it (or someone else on the server)
			server.runCommand("scoreboard objectives add spike dummy");
			server.runCommand("scoreboard objectives setdisplay list spike");
			for (int i = 0; i < 30; i++) server.runCommand("say line " + i + " of the chat history");
			context.waitTicks(40);
			Sampler sampler = new Sampler(context.computeOnClient(mc -> Thread.currentThread()));
			sampler.start();
			List<String> failures = new ArrayList<>();
			// the modules as they were, put back for the tests after this one
			Map<String, Boolean> was = context.computeOnClient(mc -> {
				Map<String, Boolean> on = new java.util.HashMap<>();
				for (var m : dev.slash3rss.slashclient.hud.SlashHud.MODULES) on.put(m.id(), dev.slash3rss.slashclient.hud.SlashHud.config.placement(m.id()).enabled);
				return on;
			});
			try {
				for (int phase = 0; phase < 2; phase++) {
					if (phase == 1) {
						// a player's HUD: every module on (the CPU one read its load on the game's thread, a tenth
						// of a second every second on Windows), a big window
						System.out.println("[spike] --- every module on, 1920x1080 ---");
						context.getInput().resizeWindow(1920, 1080);
						context.runOnClient(mc -> {
							for (var m : dev.slash3rss.slashclient.hud.SlashHud.MODULES) dev.slash3rss.slashclient.hud.SlashHud.config.placement(m.id()).enabled = true;
						});
						context.waitTicks(20);
					}
					for (int round = 1; round <= 3; round++) {
						shown(context, sampler, "pause", round, () -> new net.minecraft.client.gui.screens.PauseScreen(true));
						shown(context, sampler, "options", round, () -> dev.slash3rss.slashclient.hud.Compat.options(net.minecraft.client.Minecraft.getInstance(), null));
						shown(context, sampler, "inventory", round, () -> new net.minecraft.client.gui.screens.inventory.InventoryScreen(net.minecraft.client.Minecraft.getInstance().player));
					}
					for (int round = 1; round <= 3; round++) {
						measure(context, sampler, "chat", round, failures, () -> context.getInput().pressKey(o -> o.keyChat), () -> context.getInput().pressKey(InputConstants.KEY_ESCAPE));
						measure(context, sampler, "pause", round, failures, () -> context.getInput().pressKey(InputConstants.KEY_ESCAPE), () -> context.getInput().pressKey(InputConstants.KEY_ESCAPE));
						measure(context, sampler, "tab", round, failures, () -> context.getInput().holdKey(o -> o.keyPlayerList), () -> context.getInput().releaseKey(o -> o.keyPlayerList));
					}
				}
			} finally {
				sampler.stop = true;
				context.runOnClient(mc -> was.forEach((id, on) -> dev.slash3rss.slashclient.hud.SlashHud.config.placement(id).enabled = on));
				context.getInput().resizeWindow(854, 480);
			}
			// the first round may load classes the game never needed before; the later ones must be smooth
			if (!failures.isEmpty()) throw new AssertionError("a stall on opening: " + String.join("; ", failures));
		}
	}

	/** How long the game takes to switch to a screen (setScreen with the screen's init), logged with where the time goes. */
	private static void shown(ClientGameTestContext context, Sampler sampler, String what, int round, java.util.function.Supplier<net.minecraft.client.gui.screens.Screen> make) {
		context.waitTicks(5);
		sampler.counts.clear();
		sampler.counted.set(0);
		sampler.counting = true;
		double[] ms = context.computeOnClient(mc -> {
			var screen = make.get();
			long a = System.nanoTime(), b = sampler.busy.get();
			mc.setScreenAndShow(screen);
			try {
				Thread.sleep(2);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			return new double[] { (System.nanoTime() - a) / 1e6 - 2, (sampler.busy.get() - b) / 1e6 };
		});
		sampler.counting = false;
		System.out.printf("[spike] setScreen %s #%d: %.1f ms, busy %.1f ms%n", what, round, ms[0], ms[1]);
		if (ms[1] > 5) for (var line : sampler.top(40)) System.out.println("[spike]   " + line);
		context.waitTicks(5);
		context.runOnClient(mc -> mc.setScreenAndShow(null));
	}

	private static void measure(ClientGameTestContext context, Sampler sampler, String what, int round, List<String> failures, Runnable open, Runnable close) {
		double[] before = frames(context, sampler, 10);
		sampler.counts.clear();
		sampler.counted.set(0);
		sampler.counting = true;
		open.run();
		double[] after = frames(context, sampler, 3);
		sampler.counting = false;
		double[] later = frames(context, sampler, 6);
		close.run();
		frames(context, sampler, 10);
		double base = median(before), worst = Arrays.stream(after).max().orElse(0);
		// any frame around it: a stall that comes back by itself (a module's slow reading) shows here too
		double worstAround = Math.max(worst, Math.max(Arrays.stream(before).max().orElse(0), Arrays.stream(later).max().orElse(0)));
		System.out.printf("[spike] %s #%d: before %s ms, after opening %s ms, then %s ms%n", what, round, ms(before), ms(after), ms(later));
		if (worst > Math.max(5, base * 2)) for (var line : sampler.top(40)) System.out.println("[spike]   " + line);
		if (round > 1 && worstAround > Math.max(30, base * 4)) failures.add(what + " #" + round + ": " + ms(before) + " | " + ms(after) + " | " + ms(later) + " ms, median " + String.format("%.1f", base) + " ms");
	}

	/** The game's busy time in each of the next n ticks (each a frame), in milliseconds. */
	private static double[] frames(ClientGameTestContext context, Sampler sampler, int n) {
		double[] t = new double[n];
		for (int i = 0; i < n; i++) {
			long a = sampler.busy.get();
			context.waitTick();
			t[i] = (sampler.busy.get() - a) / 1e6;
		}
		return t;
	}

	private static double median(double[] t) {
		double[] s = t.clone();
		Arrays.sort(s);
		return s[s.length / 2];
	}

	private static String ms(double[] t) {
		StringBuilder b = new StringBuilder();
		for (double x : t) b.append(b.isEmpty() ? "" : " ").append(String.format("%.1f", x));
		return b.toString();
	}

	/**
	 * Looks at the game's thread all the time: the time between two looks counts as busy unless the
	 * thread was waiting (for the test to let it go on); while counting, each method on the stack is
	 * counted once per busy look.
	 */
	private static final class Sampler extends Thread {
		private final Thread target;
		final AtomicLong busy = new AtomicLong();
		final Map<String, Integer> counts = new ConcurrentHashMap<>();
		final AtomicInteger counted = new AtomicInteger();
		volatile boolean stop, counting;

		Sampler(Thread target) {
			this.target = target;
			setDaemon(true);
		}

		@Override
		public void run() {
			long last = System.nanoTime();
			while (!stop) {
				var stack = target.getStackTrace();
				long now = System.nanoTime();
				boolean idle = stack.length > 0 && idleAt(stack);
				if (!idle) busy.addAndGet(now - last);
				last = now;
				if (counting && !idle) {
					counted.incrementAndGet();
					var seen = new HashSet<String>();
					for (var f : stack) {
						String m = f.getClassName() + "." + f.getMethodName();
						if (seen.add(m)) counts.merge(m, 1, Integer::sum);
					}
				}
				Thread.onSpinWait();
				try {
					Thread.sleep(0, 200_000);
				} catch (InterruptedException e) {
					return;
				}
			}
		}

		/** Waiting for the test, for the screen's refresh (vsync) or the frame limit: not the game's work. */
		private static boolean idleAt(StackTraceElement[] stack) {
			for (int i = 0; i < Math.min(4, stack.length); i++) {
				String m = stack[i].getMethodName();
				if (m.contains("SwapWindow") || m.contains("SwapBuffers") || m.equals("limitDisplayFPS")) return true;
			}
			String m = stack[0].getMethodName();
			return m.equals("park") || m.equals("parkNanos") || m.equals("wait0") || m.equals("sleep0") || m.equals("sleepNanos0") || m.equals("yield0");
		}

		List<String> top(int n) {
			int all = Math.max(1, counted.get());
			return counts.entrySet().stream().sorted((a, b) -> b.getValue() - a.getValue()).limit(n)
				.map(e -> String.format("%3d%% %s", e.getValue() * 100 / all, e.getKey())).toList();
		}
	}
}
