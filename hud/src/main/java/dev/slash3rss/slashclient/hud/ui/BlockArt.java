package dev.slash3rss.slashclient.hud.ui;

import java.awt.image.BufferedImage;

/**
 * The pictures of "Okna w wyglądzie bloków", drawn here pixel by pixel in flat colours (nothing of
 * Mojang's is shipped or copied): the crafting table's wooden top with its orange plate, a saw and a
 * hammer, a chest's wood with its latch and hinges, a furnace's stone with the firebox glowing, the
 * enchanting table's obsidian under red cloth with diamond corners, an anvil and a hopper cut to their
 * shapes… The window's own slots, arrows and outlines stay where they are, coloured to match the block;
 * the player's inventory under it is dark. Plain Java without the game's classes, so it can be drawn and
 * looked at outside the game too.
 */
final class BlockArt {
	private BlockArt() {}

	/** Width of the windows in their textures (the rest of a texture is other pictures, in older versions). */
	static final int WIDE = 176;

	/** The line round the dark part where the block above it is cut to its shape. */
	private static final int EDGE = 0xFF141416;

	/**
	 * A window's block part: its picture (WIDE wide, see-through where the window takes the block's shape)
	 * over the texture's rows above `top`, and from `band` to the picture's end too (a chest's texture has
	 * its lower part, with the inventory's label, further down; -1: none).
	 */
	record Art(BufferedImage image, int top, int band, boolean pages) {
		Art(BufferedImage image, int top, int band) {
			this(image, top, band, false);
		}
	}

	/** The picture for a window's texture (its file name without ".png"), or null when it has none (villagers, beacons, creative…). */
	static Art of(String window) {
		if (window.startsWith("shulker_box_")) {
			Integer c = SHULKERS.get(window.substring("shulker_box_".length()));
			return c == null ? null : shulker(c);
		}
		return switch (window) {
			case "crafting_table" -> crafting();
			case "inventory" -> inventory();
			case "crafter" -> crafter();
			case "generic_54" -> chest();
			case "shulker_box" -> shulker(0x8D5B8E);
			case "furnace" -> furnace("furnace");
			case "blast_furnace" -> furnace("blast");
			case "smoker" -> furnace("smoker");
			case "enchanting_table" -> enchanting();
			case "anvil" -> anvil();
			case "hopper" -> hopper();
			case "dispenser" -> dispenser();
			case "brewing_stand" -> brewing();
			case "smithing" -> smithing();
			case "stonecutter", "grindstone" -> stone();
			case "loom" -> loom();
			case "cartography_table" -> cartography();
			case "recipe_book" -> recipeBook();
			default -> null;
		};
	}

	// ---- the windows ----

	/** The crafting table: planks, the orange plate round the grid, the result on a little board, a saw and a hammer. */
	private static Art crafting() {
		Pic p = new Pic(83, 0xC8A064);
		p.planks(new int[] { 23, 47, 71 }, 0xA47C45, 0xB98F57, new int[][] { { 44, 132 }, { 88, 160 }, { 20, 110 }, { 60, 140 } });
		p.diamond(56, 43, 40, 0xB8692F, 0x4F2810, 0xD2874C, 0x8E4E20);
		p.rect(27, 14, 58, 58, 0xB8692F);
		p.frame(27, 14, 58, 58, 0x4F2810);
		p.frame(28, 15, 56, 56, 0x6A3716);
		p.box(115, 26, 35, 35, 0xA0703A, 0x3E2410, 0xBC8A50, 0x7A5228);
		p.saw(118, 3);
		p.hammer(152, 33);
		for (int[] n : new int[][] { { 8, 8 }, { 8, 62 }, { 104, 6 }, { 108, 64 }, { 166, 64 } }) p.nail(n[0], n[1]);
		p.hline(0, WIDE - 1, 82, 0x4F2810);
		return new Art(p.im, 83, -1);
	}

	/** The player's own crafting in the inventory: the same wood and a smaller plate round the 2×2 grid. */
	private static Art inventory() {
		Pic p = new Pic(83, 0xC8A064);
		p.planks(new int[] { 27, 54 }, 0xA47C45, 0xB98F57, new int[][] { { 90, 150 }, { 140 }, { 100, 160 } });
		p.diamond(115, 35, 27, 0xB8692F, 0x4F2810, 0xD2874C, 0x8E4E20);
		p.rect(95, 15, 40, 40, 0xB8692F);
		p.frame(95, 15, 40, 40, 0x4F2810);
		p.frame(96, 16, 38, 38, 0x6A3716);
		for (int[] n : new int[][] { { 146, 8 }, { 146, 70 }, { 168, 56 } }) p.nail(n[0], n[1]);
		p.hline(0, WIDE - 1, 82, 0x4F2810);
		return new Art(p.im, 83, -1);
	}

	/** The crafter: grey iron with its grid in a dark frame and redstone-red studs. */
	private static Art crafter() {
		Pic p = new Pic(83, 0x6C6C73);
		p.speckle(0x63636A, 9, 1);
		p.frame(23, 14, 58, 57, 0x2E2E33);
		p.frame(24, 15, 56, 55, 0x45454B);
		for (int[] n : new int[][] { { 8, 8 }, { 8, 62 }, { 96, 8 }, { 96, 62 } }) p.box(n[0], n[1], 4, 4, 0xC0282A, 0x3A0C0C, 0xF05050, 0x8A1A1A);
		p.hline(0, WIDE - 1, 82, 0x2E2E33);
		return new Art(p.im, 83, -1);
	}

	/**
	 * A chest (and a barrel, an ender chest – they share the window): wood round the slots, an iron latch at
	 * the top and two hinges on the inventory under it (the chest's lid opened up).
	 */
	private static Art chest() {
		Pic p = new Pic(139, 0xB47B32);
		p.grain(0xA66E2A, 2);
		p.box(81, 0, 14, 9, 0xCFCFCF, 0x303030, 0xF4F4F4, 0x8C8C8C);
		p.rect(87, 4, 2, 3, 0x303030);
		// the chest's body under the lid (the texture's lower part, round the inventory's label), hinged to it
		p.hline(0, WIDE - 1, 126, 0x6A4318);
		for (int x : new int[] { 26, 138 }) p.box(x, 127, 12, 4, 0xCFCFCF, 0x303030, 0xF4F4F4, 0x8C8C8C);
		p.hline(0, WIDE - 1, 138, 0x6A4318);
		return new Art(p.im, 126, 126);
	}

	/** The shulker boxes' colours by their dye (the plain one is purple). */
	private static final java.util.Map<String, Integer> SHULKERS = java.util.Map.ofEntries(
		java.util.Map.entry("white", 0xCFD5D6), java.util.Map.entry("orange", 0xE0690E), java.util.Map.entry("magenta", 0xA9399F),
		java.util.Map.entry("light_blue", 0x3AA6CF), java.util.Map.entry("yellow", 0xE9B92A), java.util.Map.entry("lime", 0x6AAE1C),
		java.util.Map.entry("pink", 0xE184A3), java.util.Map.entry("gray", 0x43494C), java.util.Map.entry("light_gray", 0x8A8A83),
		java.util.Map.entry("cyan", 0x16848C), java.util.Map.entry("purple", 0x7A2FA8), java.util.Map.entry("blue", 0x373C9B),
		java.util.Map.entry("brown", 0x704729), java.util.Map.entry("green", 0x55701E), java.util.Map.entry("red", 0x9E2A24),
		java.util.Map.entry("black", 0x1F1F24));

	/** A shulker box in its colour: the shell, the lid's lighter band and the seam under it. */
	private static Art shulker(int c) {
		Pic p = new Pic(83, c);
		p.speckle(shade(c, 0.93f), 6, 3);
		p.rect(0, 0, WIDE, 14, lift(c, 0.1f));
		p.hline(0, WIDE - 1, 14, shade(c, 0.6f));
		p.hline(0, WIDE - 1, 15, lift(c, 0.22f));
		p.hline(0, WIDE - 1, 82, shade(c, 0.6f));
		return new Art(p.im, 83, -1);
	}

	/**
	 * A furnace: stone, a ledge across, a dark chamber round what is smelted and an arched firebox under
	 * it, glowing at the bottom where the fuel burns. The blast furnace: dark iron-stone with riveted
	 * corners and a grate over the fire; the smoker: the stone set in a wooden frame.
	 */
	private static Art furnace(String kind) {
		boolean blast = "blast".equals(kind), smoker = "smoker".equals(kind);
		int stone = blast ? 0x5F5F66 : 0x8B8B8B;
		Pic p = new Pic(83, smoker ? 0x6E4B2C : stone);
		if (smoker) {
			p.grain(0x62421F, 4);
			p.rect(40, 3, 106, 77, 0x3A2616);
			p.rect(41, 4, 104, 75, stone);
			p.speckle(0x7B7B7B, 10, 5, 41, 4, 104, 75);
		} else {
			p.speckle(blast ? 0x55555B : 0x7B7B7B, 10, 5);
			p.speckle(blast ? 0x6A6A72 : 0x999999, 5, 6);
		}
		int x0 = smoker ? 41 : 0, x1 = smoker ? 144 : WIDE - 1;
		p.hline(x0, x1, 31, blast ? 0x7A7A82 : 0xABABAB);
		p.hline(x0, x1, 32, blast ? 0x6C6C74 : 0x9C9C9C);
		p.hline(x0, x1, 33, blast ? 0x6C6C74 : 0x9C9C9C);
		p.hline(x0, x1, 34, blast ? 0x3E3E44 : 0x6A6A6A);
		p.arch(49, 10, 31, 22, 0x2B2724, blast ? 0x2A2A2E : 0x5E5E5E);
		p.arch(47, 37, 35, 34, 0x2A2420, blast ? 0x2A2A2E : 0x4E4E4E);
		for (int r = 0; r < 9; r++) p.hline(49, 79, 70 - r, mix(0xC2501C, 0x2A2420, r / 9f));
		for (int[] e : new int[][] { { 52, 69 }, { 60, 70 }, { 67, 69 }, { 75, 70 } }) p.dot(e[0], e[1], 0xF0A040);
		p.hline(46, 82, 71, blast ? 0x2A2A2E : 0x4E4E4E);
		if (blast) {
			for (int x = 51; x < 79; x += 5) p.vline(x, 40, 70, 0x3A3A40);
			for (int[] c : new int[][] { { 4, 4 }, { 164, 4 }, { 4, 70 }, { 164, 70 } }) {
				p.box(c[0], c[1], 8, 8, 0x8C8C94, 0x2A2A2E, 0xB0B0B8, 0x5A5A60);
				p.dot(c[0] + 3, c[1] + 3, 0x3A3A40);
			}
		}
		p.hline(0, WIDE - 1, 82, smoker ? 0x3A2616 : blast ? 0x2A2A2E : 0x5A5A5A);
		return new Art(p.im, 83, -1);
	}

	/**
	 * The enchanting table: obsidian under a red cloth hanging down at the sides with a gold hem,
	 * diamonds in its corners and a gold frame round the enchantments.
	 */
	private static Art enchanting() {
		Pic p = new Pic(83, 0x1E1528);
		p.speckle(0x2C2140, 8, 7);
		p.speckle(0x3A2B55, 2, 8);
		for (int y = 0; y < 37; y++) {
			int reach = y < 12 ? WIDE : 24 - (y - 12);
			if (reach <= 0) break;
			if (reach >= WIDE) p.hline(0, WIDE - 1, y, 0xA51E2A);
			else {
				p.hline(0, reach - 1, y, 0xA51E2A);
				p.hline(WIDE - reach, WIDE - 1, y, 0xA51E2A);
				// the hem along the cloth's slanted edges
				p.dot(reach, y, 0xE0AE38);
				p.dot(WIDE - 1 - reach, y, 0xE0AE38);
				p.dot(reach + 1, y, 0x120C18);
				p.dot(WIDE - 2 - reach, y, 0x120C18);
			}
		}
		p.hline(24, WIDE - 25, 12, 0xE0AE38);
		p.hline(25, WIDE - 26, 13, 0x120C18);
		for (int x : new int[] { 44, 88, 132 }) p.vline(x, 0, 11, 0xBC2C36);
		for (int x : new int[] { 4, 166 }) p.box(x, 3, 6, 6, 0x45D8C8, 0x0E4640, 0xB4FFF2, 0x1E9488);
		p.frame(57, 11, 114, 60, 0x8A6418);
		p.frame(58, 12, 112, 58, 0xD9A532);
		return new Art(p.im, 83, -1);
	}

	/** The anvil: dark iron, wide at the top and narrowing to its waist, standing on the inventory. */
	private static Art anvil() {
		Pic p = new Pic(83, 0x4B4B52);
		p.speckle(0x55555D, 5, 9);
		p.rect(14, 40, 148, 42, 0x434349);
		for (int y = 35; y < 83; y++) {
			int in = Math.min(14, (y - 34) * 2);
			for (int x = 0; x < in; x++) {
				p.clear(x, y);
				p.clear(WIDE - 1 - x, y);
			}
		}
		p.outline(0x18181B);
		return new Art(p.im, 83, -1);
	}

	/** The hopper: iron narrowing like a funnel, the slots in its dark bowl. */
	private static Art hopper() {
		Pic p = new Pic(50, 0x4C4C52);
		p.speckle(0x56565D, 6, 10);
		p.well(39, 15, 98, 23, 0x2F2F34, 0x1A1A1D, 0x5C5C63, 0x222226);
		for (int y = 18; y < 50; y++) {
			for (int x = 0; x < y - 17; x++) {
				p.clear(x, y);
				p.clear(WIDE - 1 - x, y);
			}
		}
		p.outline(0x18181B);
		return new Art(p.im, 50, -1);
	}

	/** A dispenser (and a dropper): cobblestone with a raised stone rim round its dark mouth. */
	private static Art dispenser() {
		Pic p = new Pic(83, 0x7D7D7D);
		p.speckle(0x6E6E6E, 12, 11);
		p.speckle(0x8E8E8E, 8, 12);
		p.box(56, 11, 64, 61, 0x9A9A9A, 0x3C3C3C, 0xB8B8B8, 0x6E6E6E);
		p.rect(59, 14, 58, 57, 0x252525);
		p.hline(0, WIDE - 1, 82, 0x4A4A4A);
		return new Art(p.im, 83, -1);
	}

	/** The brewing stand: on dark blackstone, the bottles standing on a stone slab. */
	private static Art brewing() {
		Pic p = new Pic(83, 0x3B3742);
		p.speckle(0x46414E, 8, 13);
		p.box(48, 69, 80, 8, 0x8E8E8E, 0x2C2C2C, 0xACACAC, 0x6A6A6A);
		return new Art(p.im, 83, -1);
	}

	/** The smithing table: dark reddish planks under an iron band with rivets. */
	private static Art smithing() {
		Pic p = new Pic(83, 0x5C2C22);
		p.planks(new int[] { 34, 52, 70 }, 0x45201A, 0x66342A, new int[][] { {}, { 60, 140 }, { 30, 110 }, { 90 } });
		p.rect(0, 0, WIDE, 13, 0x36363C);
		p.hline(0, WIDE - 1, 13, 0x1E1E22);
		for (int x = 8; x < WIDE; x += 32) p.dot(x, 6, 0x7A7A82);
		p.hline(0, WIDE - 1, 82, 0x2C140F);
		return new Art(p.im, 83, -1);
	}

	/** The stonecutter and the grindstone: stone. */
	private static Art stone() {
		Pic p = new Pic(83, 0x8B8B8B);
		p.speckle(0x7B7B7B, 10, 14);
		p.speckle(0x999999, 5, 15);
		p.hline(0, WIDE - 1, 82, 0x5A5A5A);
		return new Art(p.im, 83, -1);
	}

	/** The loom: pale birch planks. */
	private static Art loom() {
		Pic p = new Pic(83, 0xD6C08A);
		p.planks(new int[] { 23, 47, 71 }, 0xBFA772, 0xCDB680, new int[][] { { 40, 140 }, { 90 }, { 20, 130 }, { 70 } });
		p.hline(0, WIDE - 1, 82, 0x8A7444);
		return new Art(p.im, 83, -1);
	}

	/** The cartography table: a sheet of paper in a dark wooden frame. */
	private static Art cartography() {
		Pic p = new Pic(83, 0x6B4A2B);
		p.rect(5, 5, WIDE - 10, 75, 0x3A2616);
		p.rect(6, 6, WIDE - 12, 73, 0xE6D7AC);
		p.speckle(0xDCCB9C, 6, 16, 6, 6, WIDE - 12, 73);
		p.hline(0, WIDE - 1, 82, 0x3A2616);
		return new Art(p.im, 83, -1);
	}

	/**
	 * The recipe book: a leather cover with gold corners and stitching along its edge, the recipes on
	 * its dark pages (the page numbers are white, so the pages stay dark).
	 */
	private static Art recipeBook() {
		Pic p = new Pic(149, 168, 0x8B4A26);
		p.grain(0x7E4220, 17);
		p.rect(8, 8, 133, 152, 0x3E2A1C);
		p.speckle(0x47311F, 8, 18, 8, 8, 133, 152);
		for (int x = 5; x < 144; x += 4) {
			p.hline(x, x + 1, 4, 0xC9935A);
			p.hline(x, x + 1, 163, 0xC9935A);
		}
		for (int y = 5; y < 163; y += 4) {
			p.vline(4, y, y + 1, 0xC9935A);
			p.vline(144, y, y + 1, 0xC9935A);
		}
		for (int[] c : new int[][] { { 1, 1 }, { 139, 1 }, { 1, 158 }, { 139, 158 } }) p.box(c[0], c[1], 9, 9, 0xE0AE38, 0x5A3C0E, 0xF8D878, 0xA87A20);
		return new Art(p.im, 168, -1, true);
	}

	// ---- putting a picture on a window ----

	/**
	 * A window's texture with its picture: the block part over the top of it (the window's slots, arrows
	 * and outlines kept, in the block's colours), see-through where the picture is cut out, and the rest
	 * as it is, or dark with "Ciemne okna gry" (`dark`; `darker`: its nearly black shade).
	 */
	static void paint(BufferedImage image, Art art, boolean dark, boolean darker) {
		int w = image.getWidth(), h = image.getHeight();
		// a texture 256 wide holds a window 176 wide (a pack in a higher resolution: in proportion)
		float scale = w / 256f;
		int wide = Math.min(w, Math.round(art.image().getWidth() * scale)), top = Math.min(h, Math.round(art.top() * scale));
		int band = art.band() < 0 ? h : Math.round(art.band() * scale), end = Math.min(h, Math.round(art.image().getHeight() * scale));
		int[] before = image.getRGB(0, 0, w, h, null, 0, w), after = new int[before.length];
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				int v = before[y * w + x], ax = Math.min(art.image().getWidth() - 1, (int) (x / scale)), ay = (int) (y / scale);
				boolean drawn = x < wide && (y < top || y >= band && y < end);
				after[y * w + x] = drawn ? map(v, art.image().getRGB(ax, Math.min(art.image().getHeight() - 1, ay)), art.pages()) : dark ? dark(v, darker) : v;
			}
		}
		// where the picture cut the window to the block's shape, the dark part under it gets an edge
		int edges = Math.min(h, top + Math.max(1, Math.round(scale)) + 1);
		for (int y = 0; y < edges; y++) {
			for (int x = 0; x < wide; x++) {
				int i = y * w + x;
				if (after[i] >>> 24 == 0) continue;
				if (cut(before, after, w, h, x - 1, y) || cut(before, after, w, h, x + 1, y) || cut(before, after, w, h, x, y - 1) || cut(before, after, w, h, x, y + 1)) after[i] = EDGE;
			}
		}
		image.setRGB(0, 0, w, h, after, 0, w);
	}

	/** Whether the picture made this pixel of the window see-through. */
	private static boolean cut(int[] before, int[] after, int w, int h, int x, int y) {
		if (x < 0 || y < 0 || x >= w || y >= h) return false;
		return before[y * w + x] >>> 24 != 0 && after[y * w + x] >>> 24 == 0;
	}

	/**
	 * One pixel of the block part: the window's grey panel as the picture, its light edge lighter and its
	 * shadows darker, a slot a darker hollow in the block's colour (the items read well in it); colours
	 * (arrows, flames, bubbles) as they are; nothing where the picture is see-through. With `pages` (the
	 * recipe book) its dark inside is the picture as it is too.
	 */
	static int map(int argb, int m, boolean pages) {
		int a = argb >>> 24;
		if (a == 0 || m >>> 24 == 0) return 0;
		int r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		int max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b));
		if (max - min > 28) return argb;
		int l = (r + g + b) / 3;
		int c = pages && l >= 40 && l <= 70 ? m : l < 40 ? shade(m, 0.3f) : l > 225 ? lift(m, 0.3f) : l > 160 ? m : l > 110 ? shade(m, 0.55f) : l > 70 ? shade(m, 0.72f) : shade(m, 0.35f);
		return a << 24 | c & 0xFFFFFF;
	}

	/**
	 * One pixel dark: a grey one (the panels, slots, bevels, buttons) to a dark grey of the same order, so
	 * the light edges stay lighter than the panel and the slots darker; a coloured one as it is.
	 */
	static int dark(int argb, boolean darker) {
		int a = argb >>> 24;
		if (a == 0) return argb;
		int r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		int max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b));
		if (max - min > 28) return argb;
		int l = (r + g + b) / 3;
		// dark: 0 → 20, 0x55 → 43, 0x8B → 58, 0xC6 → 74, 0xFF → 90 (a dark panel, darker slots, soft edges);
		// darker: 0 → 8, 0xC6 → 42, 0xFF → 52 (nearly black, the edges still a step lighter)
		int n = darker ? 8 + l * 44 / 255 : 20 + l * 70 / 255;
		return a << 24 | n << 16 | n << 8 | Math.min(255, n + 6);
	}

	static int shade(int c, float k) {
		return 0xFF000000 | Math.round((c >> 16 & 0xFF) * k) << 16 | Math.round((c >> 8 & 0xFF) * k) << 8 | Math.round((c & 0xFF) * k);
	}

	static int lift(int c, float k) {
		int r = c >> 16 & 0xFF, g = c >> 8 & 0xFF, b = c & 0xFF;
		return 0xFF000000 | Math.round(r + (255 - r) * k) << 16 | Math.round(g + (255 - g) * k) << 8 | Math.round(b + (255 - b) * k);
	}

	/** `a` turning into `b` as `t` goes from 0 to 1. */
	static int mix(int a, int b, float t) {
		int r = Math.round((a >> 16 & 0xFF) * (1 - t) + (b >> 16 & 0xFF) * t);
		int g = Math.round((a >> 8 & 0xFF) * (1 - t) + (b >> 8 & 0xFF) * t);
		int bl = Math.round((a & 0xFF) * (1 - t) + (b & 0xFF) * t);
		return r << 16 | g << 8 | bl;
	}

	/** A number that looks random but is always the same for a pixel (the specks and the grain stay put). */
	private static int hash(int x, int y, int seed) {
		int h = x * 374761393 + y * 668265263 + seed * 1442695041;
		h = (h ^ h >>> 13) * 1274126177;
		return (h ^ h >>> 16) & 0x7FFFFFFF;
	}

	/** A picture being drawn, in GUI pixels; colours are 0xRRGGBB, drawn opaque. */
	private static final class Pic {
		final BufferedImage im;
		final int wide, h;

		Pic(int h, int fill) {
			this(WIDE, h, fill);
		}

		Pic(int wide, int h, int fill) {
			this.wide = wide;
			this.h = h;
			im = new BufferedImage(wide, h, BufferedImage.TYPE_INT_ARGB);
			rect(0, 0, wide, h, fill);
		}

		void dot(int x, int y, int c) {
			if (x >= 0 && y >= 0 && x < wide && y < h) im.setRGB(x, y, 0xFF000000 | c);
		}

		void clear(int x, int y) {
			if (x >= 0 && y >= 0 && x < wide && y < h) im.setRGB(x, y, 0);
		}

		void rect(int x, int y, int w, int hh, int c) {
			for (int j = y; j < y + hh; j++) for (int i = x; i < x + w; i++) dot(i, j, c);
		}

		void hline(int x0, int x1, int y, int c) {
			for (int x = x0; x <= x1; x++) dot(x, y, c);
		}

		void vline(int x, int y0, int y1, int c) {
			for (int y = y0; y <= y1; y++) dot(x, y, c);
		}

		void frame(int x, int y, int w, int hh, int c) {
			hline(x, x + w - 1, y, c);
			hline(x, x + w - 1, y + hh - 1, c);
			vline(x, y, y + hh - 1, c);
			vline(x + w - 1, y, y + hh - 1, c);
		}

		/** A raised piece: outlined, lit at the top and left, shaded at the bottom and right. */
		void box(int x, int y, int w, int hh, int fill, int outline, int light, int dark) {
			rect(x, y, w, hh, outline);
			rect(x + 1, y + 1, w - 2, hh - 2, dark);
			rect(x + 1, y + 1, w - 3, hh - 3, light);
			rect(x + 2, y + 2, w - 4, hh - 4, fill);
		}

		/** A sunken piece: outlined, shaded at the top and left, lit at the bottom and right. */
		void well(int x, int y, int w, int hh, int fill, int outline, int light, int dark) {
			box(x, y, w, hh, fill, outline, dark, light);
		}

		/** A square stood on its corner (the crafting table's plate): a thick outline, lit on its upper edges. */
		void diamond(int cx, int cy, int r, int fill, int outline, int light, int dark) {
			for (int y = cy - r; y <= cy + r; y++) {
				for (int x = cx - r; x <= cx + r; x++) {
					int dx = x - cx, dy = y - cy, d = Math.abs(dx) + Math.abs(dy);
					if (d > r) continue;
					dot(x, y, d >= r - 1 ? outline : d == r - 2 ? (dy < 0 || dy == 0 && dx < 0 ? light : dark) : fill);
				}
			}
		}

		/** An opening with a rounded top (a furnace's chamber and firebox), its rim round it. */
		void arch(int x, int y, int w, int hh, int fill, int rim) {
			for (int pass = 0; pass < 2; pass++) {
				int ox = pass == 0 ? x - 1 : x, oy = pass == 0 ? y - 1 : y, ow = pass == 0 ? w + 2 : w, oh = pass == 0 ? hh + 1 : hh;
				for (int r = 0; r < oh; r++) {
					int in = r == 0 ? 4 : r == 1 ? 2 : r == 2 ? 1 : 0;
					hline(ox + in, ox + ow - 1 - in, oy + r, pass == 0 ? rim : fill);
				}
			}
		}

		/** Specks of another colour over the picture (stone, obsidian), `percent` of the pixels, or of a part of it. */
		void speckle(int c, int percent, int seed) {
			speckle(c, percent, seed, 0, 0, wide, h);
		}

		void speckle(int c, int percent, int seed, int x0, int y0, int w, int hh) {
			for (int y = y0; y < y0 + hh; y++) for (int x = x0; x < x0 + w; x++) if (hash(x, y, seed) % 100 < percent) dot(x, y, c);
		}

		/** The wood's grain: short streaks along the planks. */
		void grain(int c, int seed) {
			for (int y = 0; y < h; y++) for (int x = 0; x < wide; x++) if (hash(x / 7, y, seed) % 11 == 0) dot(x, y, c);
		}

		/** Planks: the grain, seams across at `seams`, and in each row of planks the joints where one plank ends at `joints`. */
		void planks(int[] seams, int seam, int grain, int[][] joints) {
			grain(grain, 1);
			for (int y : seams) hline(0, wide - 1, y, seam);
			for (int row = 0; row < joints.length && row <= seams.length; row++) {
				int y0 = row == 0 ? 0 : seams[row - 1] + 1, y1 = row < seams.length ? seams[row] - 1 : h - 1;
				for (int x : joints[row]) vline(x, y0, y1, seam);
			}
		}

		/** A nail's head: a tiny lit dot. */
		void nail(int x, int y) {
			dot(x, y, 0xE6E6E6);
			dot(x + 1, y, 0xA8A8A8);
			dot(x, y + 1, 0xA8A8A8);
			dot(x + 1, y + 1, 0x5E5E5E);
		}

		/** A hammer: a grey head on a wooden handle. */
		void hammer(int x, int y) {
			box(x + 6, y + 7, 6, 24, 0x8A5A2B, 0x2E1C0C, 0xA8743E, 0x6A4320);
			box(x, y, 18, 9, 0xC6C6C6, 0x2B2B2B, 0xEDEDED, 0x8E8E8E);
		}

		/** A saw: a wooden handle with a hole and a toothed blade tapering to its tip. */
		void saw(int x, int y) {
			int bx = x + 12, len = 36;
			for (int i = 0; i < len; i++) {
				int hgt = 9 - i * 5 / len, cx = bx + i;
				vline(cx, y + 1, y + 2 + hgt, 0x3A3A3A);
				for (int j = 0; j < hgt; j++) {
					int cy = y + 2 + j;
					dot(cx, cy, j == 0 ? 0xF2F2F2 : j == hgt - 1 ? (i % 2 == 0 ? 0x7A7A7A : 0xBDBDBD) : 0xD2D2D2);
				}
			}
			vline(bx + len, y + 1, y + 7, 0x3A3A3A);
			box(x, y, 14, 13, 0x7A4A22, 0x2E1C0C, 0x9A6232, 0x5A3518);
			rect(x + 4, y + 4, 5, 4, 0x2E1C0C);
		}

		/** The outline round the picture's shape where it is cut out (an anvil, a hopper). */
		void outline(int c) {
			boolean[] edge = new boolean[wide * h];
			for (int y = 0; y < h; y++) {
				for (int x = 0; x < wide; x++) {
					if (im.getRGB(x, y) >>> 24 == 0) continue;
					edge[y * wide + x] = clearAt(x - 1, y) || clearAt(x + 1, y) || clearAt(x, y - 1);
				}
			}
			for (int i = 0; i < edge.length; i++) if (edge[i]) dot(i % wide, i / wide, c);
		}

		private boolean clearAt(int x, int y) {
			return x >= 0 && y >= 0 && x < wide && y < h && im.getRGB(x, y) >>> 24 == 0;
		}
	}
}
