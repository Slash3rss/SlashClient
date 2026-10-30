package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

/**
 * "Okna w wyglądzie bloków": the block's part of a window (above the player's inventory, which stays as
 * it is) made of what the block is made of – planks for the crafting table, the inventory's crafting and
 * the chest, smooth stone for the furnace, iron for the anvil, red cloth for the enchanting table, nether
 * bricks under the brewing stand – the slots in it darker. Nothing of
 * Mojang's is shipped: the block's texture is read from the game's own packs as the window is (DarkGui).
 */
public final class BlockWindows {
	private BlockWindows() {}

	/**
	 * How a window looks: what its block part is made of (a block texture, repeated), what is drawn on it
	 * (the crafting table's orange plate round the grid, obsidian and red cloth at the enchanting table, a
	 * firebox with the fire's glow in a furnace, a chest's rim and latch, the anvil's iron face…), and how tall the part is.
	 */
	record Look(String block, String decor, int top) {}

	/** Width of the windows in their textures (the rest of a texture is other pictures, in older versions). */
	private static final int WIDE = 176;

	private static final Map<String, Look> LOOKS = Map.ofEntries(
		Map.entry("crafting_table", new Look("oak_planks", "crafting", 74)), Map.entry("inventory", new Look("oak_planks", "inventory", 80)),
		Map.entry("crafter", new Look("oak_planks", "crafting", 74)), Map.entry("generic_54", new Look("oak_planks", "chest", 125)),
		Map.entry("shulker_box", new Look("shulker_box", "shulker", 74)), Map.entry("hopper", new Look("hopper_outside", "hopper", 37)),
		Map.entry("dispenser", new Look("cobblestone", "dispenser", 74)), Map.entry("furnace", new Look("stone_bricks", "furnace", 74)),
		Map.entry("blast_furnace", new Look("smooth_stone", "furnace", 74)), Map.entry("smoker", new Look("spruce_planks", "furnace", 74)),
		Map.entry("anvil", new Look("iron_block", "anvil", 74)), Map.entry("enchanting_table", new Look("red_wool", "enchanting", 74)),
		Map.entry("brewing_stand", new Look("red_nether_bricks", "brewing", 74)), Map.entry("smithing", new Look("dark_oak_planks", "smithing", 74)),
		Map.entry("stonecutter", new Look("stone", "", 74)), Map.entry("loom", new Look("birch_planks", "", 74)),
		Map.entry("grindstone", new Look("stone", "", 74)), Map.entry("cartography_table", new Look("spruce_planks", "", 74)));

	public static boolean on() {
		return SlashHud.config != null && SlashHud.config.blockWindows;
	}

	/** How a window's background looks with its block, or null when it has none (villagers, beacons, creative…). */
	static Look lookOf(Identifier id) {
		String p = id.getPath();
		if (!"minecraft".equals(id.getNamespace()) || !p.startsWith("textures/gui/container/") || !p.endsWith(".png")) return null;
		return LOOKS.get(p.substring("textures/gui/container/".length(), p.length() - 4));
	}

	/** The block's texture as the game's packs have it (its first square, when it is animated), or null. */
	static BufferedImage block(String name, Function<Identifier, Optional<Resource>> lookup) {
		Identifier id = Identifier.tryParse("minecraft:textures/block/" + name + ".png");
		if (id == null) return null;
		Optional<Resource> r = lookup.apply(id);
		if (r.isEmpty()) return null;
		try (InputStream in = r.get().open()) {
			return ImageIO.read(in);
		} catch (Exception e) {
			return null;
		}
	}

	/** The block's part of the window in its look (`lookup` reads the other textures a decoration needs); the player's inventory under it as it was. */
	static void paint(BufferedImage image, Look look, BufferedImage block, Function<Identifier, Optional<Resource>> lookup) {
		BufferedImage material = material(look, block, lookup);
		// a texture 256 wide holds a window 176 wide (a pack in a higher resolution: in proportion)
		float scale = image.getWidth() / 256f;
		int wide = Math.round(WIDE * scale), top = Math.round(look.top() * scale);
		for (int y = 0; y < Math.min(top, image.getHeight()); y++) {
			for (int x = 0; x < Math.min(wide, image.getWidth()); x++) {
				int mx = Math.min(WIDE - 1, (int) (x / scale)), my = Math.min(look.top() - 1, (int) (y / scale));
				image.setRGB(x, y, pixel(image.getRGB(x, y), material.getRGB(mx, my)));
			}
		}
	}

	/** The block part's picture in GUI pixels: the block's texture repeated, and its decoration drawn on it. */
	static BufferedImage material(Look look, BufferedImage block, Function<Identifier, Optional<Resource>> lookup) {
		BufferedImage m = new BufferedImage(WIDE, look.top(), BufferedImage.TYPE_INT_ARGB);
		java.awt.Graphics2D g = m.createGraphics();
		g.setPaint(tiles(block));
		g.fillRect(0, 0, WIDE, look.top());
		switch (look.decor()) {
			case "crafting" -> plate(g, new int[] { 8, 24, 98, 114, 98, 24 }, new int[] { 44, 15, 15, 44, 73, 73 });
			case "inventory" -> plate(g, new int[] { 88, 100, 142, 154, 142, 100 }, new int[] { 36, 15, 15, 36, 58, 58 });
			case "enchanting" -> {
				BufferedImage obsidian = block("obsidian", lookup);
				int[] xs = { 0, 62, 72, 0 }, ys = { 20, 20, look.top(), look.top() };
				if (obsidian != null) {
					g.setPaint(tiles(obsidian));
					g.fillPolygon(xs, ys, 4);
				}
				g.setColor(new java.awt.Color(0xE3A93A));
				g.setStroke(new java.awt.BasicStroke(2));
				g.drawPolyline(new int[] { 0, 62, 72 }, new int[] { 20, 20, look.top() }, 3);
			}
			case "furnace" -> {
				g.setColor(new java.awt.Color(0x2B2522));
				g.fillRect(46, 14, 34, look.top() - 14);
				g.setPaint(new java.awt.GradientPaint(0, look.top(), new java.awt.Color(232, 100, 30, 170), 0, look.top() - 28, new java.awt.Color(232, 100, 30, 0)));
				g.fillRect(46, 14, 34, look.top() - 14);
				g.setColor(new java.awt.Color(0x17130F));
				g.setStroke(new java.awt.BasicStroke(2));
				g.drawRect(46, 14, 34, look.top() - 14);
			}
			// a chest's and a shulker box's darker rim, the chest's latch at the top
			case "chest", "shulker" -> {
				g.setColor(new java.awt.Color("chest".equals(look.decor()) ? 0x5A3A1E : 0x5B3F66));
				g.setStroke(new java.awt.BasicStroke(4));
				g.drawRect(2, 2, WIDE - 5, look.top() - 3);
				if ("chest".equals(look.decor())) {
					g.setColor(new java.awt.Color(0x9A9A9A));
					g.fillRect(83, 0, 10, 6);
					g.setColor(new java.awt.Color(0x3A3A3A));
					g.drawRect(83, 0, 10, 6);
				}
			}
			// a hopper's funnel: lighter iron narrowing to the bottom
			case "hopper" -> {
				g.setColor(new java.awt.Color(0x8A8A90));
				g.fillPolygon(new int[] { 30, 146, 120, 56 }, new int[] { 14, 14, look.top(), look.top() }, 4);
			}
			// a dispenser's dark mouth round its grid
			case "dispenser" -> {
				g.setColor(new java.awt.Color(0x262626));
				g.fillRect(56, 14, 64, look.top() - 14);
				g.setColor(new java.awt.Color(0x141414));
				g.setStroke(new java.awt.BasicStroke(2));
				g.drawRect(56, 14, 64, look.top() - 14);
			}
			// the anvil's dark iron face under the row of slots, the smithing table's iron top
			case "anvil", "smithing" -> {
				g.setColor(new java.awt.Color("anvil".equals(look.decor()) ? 0x3C3C40 : 0x4A4E55));
				int y = "anvil".equals(look.decor()) ? 38 : 36;
				g.fillRect(6, y, WIDE - 12, 30);
				g.setColor(new java.awt.Color(0x1E1E22));
				g.setStroke(new java.awt.BasicStroke(2));
				g.drawRect(6, y, WIDE - 12, 30);
			}
			// the brewing stand's stone base under the bottles
			case "brewing" -> {
				g.setColor(new java.awt.Color(0x7E7E7E));
				g.fillRect(40, look.top() - 16, 120, 16);
				g.setColor(new java.awt.Color(0x3E3E3E));
				g.setStroke(new java.awt.BasicStroke(2));
				g.drawRect(40, look.top() - 16, 120, 16);
			}
			default -> {}
		}
		g.dispose();
		return m;
	}

	/** The crafting table's orange plate round the grid, outlined dark brown. */
	private static void plate(java.awt.Graphics2D g, int[] xs, int[] ys) {
		g.setColor(new java.awt.Color(0xC46F32));
		g.fillPolygon(xs, ys, xs.length);
		g.setColor(new java.awt.Color(0x4E2E14));
		g.setStroke(new java.awt.BasicStroke(3));
		g.drawPolygon(xs, ys, xs.length);
	}

	/** A block texture repeated every 16 GUI pixels, whatever its pack's size (its first square when it is animated). */
	private static java.awt.TexturePaint tiles(BufferedImage texture) {
		BufferedImage square = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
		java.awt.Graphics2D g = square.createGraphics();
		int side = texture.getWidth();
		g.drawImage(texture, 0, 0, 16, 16, 0, 0, side, Math.min(side, texture.getHeight()), null);
		g.dispose();
		return new java.awt.TexturePaint(square, new java.awt.Rectangle(0, 0, 16, 16));
	}

	/**
	 * One pixel: the panel's grey as the texel, its light edge brighter and its shadows darker, a slot's
	 * grey a dark texel (the items read well on it); black outlines and colours (arrows, flames) as they are.
	 */
	static int pixel(int argb, int texel) {
		int a = argb >>> 24;
		if (a == 0) return argb;
		int r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		int max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b));
		if (max - min > 28) return argb;
		int l = (r + g + b) / 3;
		if (l < 40) return argb;
		float k = l > 225 ? 1.25f : l > 160 ? 1f : l > 110 ? 0.55f : 0.35f;
		int cr = Math.min(255, Math.round((texel >> 16 & 0xFF) * k));
		int cg = Math.min(255, Math.round((texel >> 8 & 0xFF) * k));
		int cb = Math.min(255, Math.round((texel & 0xFF) * k));
		return a << 24 | cr << 16 | cg << 8 | cb;
	}
}
