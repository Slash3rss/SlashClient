package dev.slash3rss.slashclient.hud.benchmark;

import com.mojang.blaze3d.platform.Window;
import net.minecraft.client.Minecraft;
import dev.slash3rss.slashclient.hud.SlashHud;
//#if MC < 26.3
//$ import org.lwjgl.glfw.GLFW;
//$ import org.lwjgl.glfw.GLFWVidMode;
//#endif

/**
 * The window the launcher's Benchmark asked for: full screen, or a borderless window over the whole
 * screen. Only for that run: the game's own options (options.txt) are not changed.
 */
public final class BenchDisplay {
	private BenchDisplay() {}

	private static boolean done;

	/** Once, early in a game started by the launcher's Benchmark button. */
	public static void tick(Minecraft mc) {
		if (done || !Benchmark.fromLauncher()) return;
		done = true;
		apply(mc, System.getProperty("slashclient.benchmark.display", ""));
	}

	/** "fullscreen", "borderless" or anything else (the window as the game opened it). */
	public static void apply(Minecraft mc, String mode) {
		Window w = mc.getWindow();
		try {
			if (mode.equals("fullscreen")) {
				//#if MC >= 26.3
				w.setExclusiveFullscreen(true);
				w.setFullscreen(true);
				w.updateFullscreenIfChanged();
				//#else
				//$ if (!w.isFullscreen()) w.toggleFullScreen();
				//#endif
			} else if (mode.equals("borderless")) {
				//#if MC >= 26.3
				// the game's own full screen that is not exclusive: a borderless window over the screen
				w.setExclusiveFullscreen(false);
				w.setFullscreen(true);
				w.updateFullscreenIfChanged();
				//#else
				//$ borderless(w);
				//#endif
			}
		} catch (RuntimeException e) {
			SlashHud.LOG.warn("SlashClient: benchmark window {}: {}", mode, e.toString());
		}
	}

	/** For the test: the window's size and its monitor's ("w h mw mh"). */
	public static String sizeForTest(Minecraft mc) {
		Window w = mc.getWindow();
		//#if MC >= 26.3
		// the test framework keeps the window's reported size its own: the game's full screen (not exclusive) instead
		boolean full;
		try {
			var f = Window.class.getDeclaredField("fullscreen");
			f.setAccessible(true);
			full = f.getBoolean(w);
		} catch (ReflectiveOperationException e) {
			full = false;
		}
		return full && !w.isExclusiveFullscreen() ? "1 1 1 1" : "0 0 1 1";
		//#else
		//$ long h = handle(w);
		//$ int[] ww = new int[1], hh = new int[1];
		//$ GLFW.glfwGetWindowSize(h, ww, hh);
		//$ GLFWVidMode mode = GLFW.glfwGetVideoMode(monitorOf(h));
		//$ return ww[0] + " " + hh[0] + " " + (mode == null ? 0 : mode.width()) + " " + (mode == null ? 0 : mode.height());
		//#endif
	}

	/** For the test: back to an ordinary window with its frame. */
	public static void windowedForTest(Minecraft mc) {
		Window w = mc.getWindow();
		//#if MC >= 26.3
		w.setFullscreen(false);
		w.updateFullscreenIfChanged();
		//#else
		//$ if (w.isFullscreen()) w.toggleFullScreen();
		//$ long h = handle(w);
		//$ GLFW.glfwSetWindowAttrib(h, GLFW.GLFW_DECORATED, GLFW.GLFW_TRUE);
		//$ GLFW.glfwSetWindowMonitor(h, 0, 100, 100, 854, 480, GLFW.GLFW_DONT_CARE);
		//#endif
	}

	/** The window's GLFW handle. */
	//#if MC >= 1.21.9
	static long handle(Window w) {
		return w.handle();
	}
	//#else
	//$ static long handle(Window w) {
	//$ 	return w.getWindow();
	//$ }
	//#endif

	//#if MC < 26.3
	//$ /** No frame, the size and place of the monitor the window is on (older versions have no such mode of their own). */
	//$ private static void borderless(Window w) {
	//$ 	long h = handle(w);
	//$ 	long monitor = monitorOf(h);
	//$ 	if (monitor == 0) return;
	//$ 	GLFWVidMode mode = GLFW.glfwGetVideoMode(monitor);
	//$ 	if (mode == null) return;
	//$ 	int[] x = new int[1], y = new int[1];
	//$ 	GLFW.glfwGetMonitorPos(monitor, x, y);
	//$ 	GLFW.glfwSetWindowAttrib(h, GLFW.GLFW_DECORATED, GLFW.GLFW_FALSE);
	//$ 	GLFW.glfwSetWindowMonitor(h, 0, x[0], y[0], mode.width(), mode.height(), GLFW.GLFW_DONT_CARE);
	//$ }
	//$
	//$ /** The monitor under the window's middle (the primary one when none is). */
	//$ private static long monitorOf(long h) {
	//$ 	int[] wx = new int[1], wy = new int[1], ww = new int[1], wh = new int[1];
	//$ 	GLFW.glfwGetWindowPos(h, wx, wy);
	//$ 	GLFW.glfwGetWindowSize(h, ww, wh);
	//$ 	int cx = wx[0] + ww[0] / 2, cy = wy[0] + wh[0] / 2;
	//$ 	var monitors = GLFW.glfwGetMonitors();
	//$ 	if (monitors != null) for (int i = 0; i < monitors.limit(); i++) {
	//$ 		long m = monitors.get(i);
	//$ 		GLFWVidMode mode = GLFW.glfwGetVideoMode(m);
	//$ 		int[] mx = new int[1], my = new int[1];
	//$ 		GLFW.glfwGetMonitorPos(m, mx, my);
	//$ 		if (mode != null && cx >= mx[0] && cy >= my[0] && cx < mx[0] + mode.width() && cy < my[0] + mode.height()) return m;
	//$ 	}
	//$ 	return GLFW.glfwGetPrimaryMonitor();
	//$ }
	//#endif
}
