package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The cosmetics menu's figure, from the main menu and in a world: its back for the cape, the
 * wings and the elytra, turned by dragging it with the mouse, the aura, the trail (running) and
 * the pet around it, the item tiles of every slot, at several window sizes; the clothing against
 * a skin with a big outer head layer, the head following the mouse and the figure turned all
 * the way round; and the headphones on the real player from the front, side and back.
 */
public class GameCosmeticsScreen implements FabricClientGameTest {
	private static final String[] SLOTS = {"cape", "wings", "elytra", "trail", "aura", "pet", "hat", "top", "kill"};
	private static final String[] HATS = {"tophat", "crown", "cap", "beanie", "wizard", "halo"};
	private static final String[] TOPS = {"scarf", "bowtie", "tie", "medal", "jacket", "autumnscarf"};
	/** Window width, height and GUI scale. */
	private static final int[][] SIZES = {{854, 480, 2}, {640, 480, 2}, {1280, 720, 2}, {1376, 986, 2}, {1920, 1080, 3}, {1920, 1080, 4}, {2560, 1440, 2}};

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.getInput().setCursorPos(10, 10);
		// from the main menu: no world, the figure is all there is
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(5);
		drag(context);
		clothing(context);
		for (int[] s : SIZES) {
			context.getInput().resizeWindow(s[0], s[1]);
			context.runOnClient(mc -> TestHooks.guiScale(s[2]));
			shots(context, "menu-" + s[0] + "x" + s[1] + "-" + s[2], false);
			layout(context, s);
		}
		context.getInput().resizeWindow(854, 480);
		context.runOnClient(mc -> TestHooks.guiScale(2));
		shots(context, "menu", true);
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.firstPerson());
			shots(context, "world", true);
			context.getInput().resizeWindow(1920, 1080);
			context.runOnClient(mc -> TestHooks.guiScale(4));
			shots(context, "world-1920x1080-4", false);
			context.getInput().resizeWindow(854, 480);
			context.runOnClient(mc -> TestHooks.guiScale(2));
			context.setScreen(() -> null);

			// the headphones on the real player: the band over the head, the cups on the ears
			context.runOnClient(mc -> { TestHooks.wear("hat", "headphones"); TestHooks.wear("top", null); });
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			context.waitTicks(5);
			context.takeScreenshot("cosscreen-headphones-front");
			context.runOnClient(mc -> TestHooks.turn(90));
			context.waitTicks(5);
			context.takeScreenshot("cosscreen-headphones-side");
			context.runOnClient(mc -> TestHooks.turn(-90));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.waitTicks(5);
			context.takeScreenshot("cosscreen-headphones-back");
			context.runOnClient(mc -> TestHooks.wear("hat", null));
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		}
	}

	/**
	 * The panel as big as the screen leaves beside the figure: never over it (with room for open
	 * wings, half a box to each side), all the slot tabs without scrolling and more tiles in a row
	 * where there is room; on small screens at least the six tiles a row it always had.
	 */
	private static void layout(ClientGameTestContext context, int[] size) {
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("hat"));
		context.waitTicks(3);
		int[] p = context.computeOnClient(mc -> TestHooks.cosmeticsLayout());
		float[] f = context.computeOnClient(mc -> TestHooks.cosmeticsFigure());
		// the GUI's size (the game may use a lower scale than asked for on a small window)
		int w = (int) Math.ceil(size[0] / f[5]), h = (int) Math.ceil(size[1] / f[5]);
		String at = size[0] + "x" + size[1] + " at " + f[5] + ": panel " + java.util.Arrays.toString(p) + ", figure " + java.util.Arrays.toString(f);
		if (p[0] < 12 || p[0] + p[2] > w - 12 || p[1] < 12 || p[1] + p[3] > h - 12) throw new AssertionError("The cosmetics panel leaves the screen's margins, " + at);
		if (p[6] < 6) throw new AssertionError("Fewer than six tiles in a row, " + at);
		if (f[2] > 0 && f[0] + f[2] * 1.5f > p[0] - 6) throw new AssertionError("The cosmetics panel covers the figure, " + at);
		if (h >= 400) {
			if (p[3] < h - 24) throw new AssertionError("The cosmetics panel is not as tall as the screen, " + at);
			if (p[5] < p[4]) throw new AssertionError("The slot tabs scroll on a big screen, " + at);
			if (w >= 600 && p[6] < 9) throw new AssertionError("Too few tiles in a row on a big screen, " + at);
			if (f[3] < 240) throw new AssertionError("The figure shrank on a big screen, " + at);
		}
	}

	/** The figure turned by a real drag: the left button held on it, the mouse moved, let go. */
	private static void drag(ClientGameTestContext context) {
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("hat"));
		context.waitTicks(10);
		float[] f = context.computeOnClient(mc -> TestHooks.cosmeticsFigure());
		float scale = f[5];
		// the window's pixels: the GUI's times its scale
		double x = (f[0] + f[2] / 2) * scale, y = (f[1] + f[3] / 2) * scale;
		context.getInput().setCursorPos(x, y);
		context.waitTick();
		context.getInput().holdMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTick();
		for (int i = 0; i < 10; i++) {
			context.getInput().moveCursor(6 * scale, 0);
			context.waitTick();
		}
		context.getInput().releaseMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTicks(15);
		float turned = context.computeOnClient(mc -> TestHooks.cosmeticsFigure())[4];
		context.takeScreenshot("cosscreen-menu-dragged-real");
		if (Math.abs(turned) < 30) throw new AssertionError("Dragging the figure with the mouse turned it by " + turned + "°");
		// started beside the figure (not on it) it turns too: the figure has that side of the screen to itself
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("cape"));
		context.getInput().setCursorPos(4 * scale, 4 * scale);
		context.waitTick();
		context.getInput().holdMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTick();
		context.getInput().moveCursor(20 * scale, 0);
		context.waitTick();
		context.getInput().releaseMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		float beside = context.computeOnClient(mc -> TestHooks.cosmeticsFigure())[4];
		if (Math.abs(beside) < 10) throw new AssertionError("A drag beside the figure turned it by " + beside + "°");
		// one that starts right of the panel, off everything, does not
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("hat"));
		int width = context.computeOnClient(mc -> mc.getWindow().getScreenWidth());
		context.getInput().setCursorPos(width - 2, 4 * scale);
		context.waitTick();
		context.getInput().holdMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTick();
		context.getInput().moveCursor(-60, 0);
		context.waitTick();
		context.getInput().releaseMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		float still = context.computeOnClient(mc -> TestHooks.cosmeticsFigure())[4];
		if (still != 0) throw new AssertionError("A drag off the figure turned it by " + still + "°");
		context.getInput().setCursorPos(10, 10);
	}

	/**
	 * The clothing against a skin whose outer head layer is a big box all round (a "TV head"):
	 * whatever is nearer the viewer covers the rest, at the edges of the head too.
	 */
	private static void clothing(ClientGameTestContext context) {
		context.runOnClient(mc -> TestHooks.testSkin("figure/tvhead"));
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("hat"));
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("hat", "headphones"); TestHooks.cosmeticsWorn("top", "scarf"); TestHooks.cosmeticsWorn("pet", null); TestHooks.cosmeticsWorn("aura", null); });
		context.waitTicks(10);
		float[] f = context.computeOnClient(mc -> TestHooks.cosmeticsFigure());
		float scale = f[5];
		float eyesX = f[0] + f[2] / 2, eyesY = f[1] + f[3] * 0.12f;
		// the head following the mouse, turned this many degrees (the figure reads the angle as atan(dx / 100))
		for (int a : new int[] {-45, -30, 0, 30, 45}) {
			double dx = 100 * Math.tan(Math.toRadians(a));
			context.getInput().setCursorPos((eyesX + dx) * scale, eyesY * scale);
			context.waitTicks(25);
			context.takeScreenshot("cosscreen-head-" + a);
		}
		// the whole figure turned round, the mouse level with its eyes
		// (a turn by hand shows on the next frame; only the head following the mouse eases in)
		context.getInput().setCursorPos(eyesX * scale, eyesY * scale);
		context.waitTicks(25);
		for (int a : new int[] {0, 30, 45, 60, 90, 135, 180, 225, 270, 315}) {
			context.runOnClient(mc -> TestHooks.cosmeticsDrag(a));
			context.waitTicks(3);
			context.takeScreenshot("cosscreen-headphones-" + a);
		}
		// the other hats and tops, from a few sides
		for (String[] list : new String[][] {HATS, TOPS}) for (String item : list) {
			String slot = list == HATS ? "hat" : "top";
			context.runOnClient(mc -> { TestHooks.cosmeticsWorn("hat", slot.equals("hat") ? item : null); TestHooks.cosmeticsWorn("top", slot.equals("top") ? item : null); TestHooks.cosmeticsSlot(slot); });
			// a new tab turns the figure smoothly to its side: once, then each turn by hand is at once
			context.waitTicks(20);
			for (int a : new int[] {30, 90, 150, 225, 300}) {
				context.runOnClient(mc -> TestHooks.cosmeticsDrag(a));
				context.waitTicks(3);
				context.takeScreenshot("cosscreen-" + item + "-" + a);
			}
		}
		context.runOnClient(mc -> TestHooks.noTestSkin());
		context.getInput().setCursorPos(10, 10);
	}

	private static void shots(ClientGameTestContext context, String where, boolean extra) {
		context.runOnClient(mc -> TestHooks.cosmeticsMenu("cape"));
		// the mouse off the tiles: the figure shows what is worn, not what is under the mouse
		context.getInput().setCursorPos(10, 10);
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("elytra", "neon"); TestHooks.cosmeticsWorn("aura", "souls"); TestHooks.cosmeticsWorn("trail", "hearts"); TestHooks.cosmeticsWorn("hat", "headphones"); });
		context.waitTicks(20);
		// every slot: the figure as the slot shows it, the tiles with their pictures
		for (String slot : SLOTS) {
			context.runOnClient(mc -> TestHooks.cosmeticsSlot(slot));
			context.waitTicks(slot.equals("aura") || slot.equals("trail") ? 30 : 15);
			context.takeScreenshot("cosscreen-" + where + "-" + slot);
		}
		// running from the front, wings on: the swinging arms and legs and the wings stay whole
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("trail"));
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(90));
		context.waitTicks(20);
		context.takeScreenshot("cosscreen-" + where + "-trail-front");
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("wings"));
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(-60));
		context.waitTicks(20);
		context.takeScreenshot("cosscreen-" + where + "-wings-turned");
		if (!extra) return;
		// turned by hand: the cape from the side, the headphones from the side and the back
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("cape"));
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(-90));
		context.waitTicks(15);
		context.takeScreenshot("cosscreen-" + where + "-cape-dragged");
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("hat"));
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(90));
		context.waitTicks(15);
		context.takeScreenshot("cosscreen-" + where + "-headphones-side");
		context.runOnClient(mc -> TestHooks.cosmeticsDrag(180));
		context.waitTicks(15);
		context.takeScreenshot("cosscreen-" + where + "-headphones-back");
		// the pet and the trail of others in the list, tried on
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("pet", "duszek_haze"); TestHooks.cosmeticsSlot("pet"); });
		context.waitTicks(10);
		context.takeScreenshot("cosscreen-" + where + "-pet-ours");
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("trail", "notes"); TestHooks.cosmeticsSlot("trail"); });
		context.waitTicks(30);
		context.takeScreenshot("cosscreen-" + where + "-trail-notes");
		context.runOnClient(mc -> { TestHooks.cosmeticsWorn("aura", "enchant"); TestHooks.cosmeticsSlot("aura"); });
		context.waitTicks(30);
		context.takeScreenshot("cosscreen-" + where + "-aura-enchant");
	}
}
