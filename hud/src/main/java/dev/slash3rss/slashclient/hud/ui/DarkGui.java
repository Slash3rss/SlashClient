package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * "Ciemne okna gry": the game's own windows (inventory, chests, crafting, furnaces, villagers, the
 * creative inventory) and its buttons, sliders and text fields in dark grey instead of light. Nothing
 * of Mojang's is shipped: the textures the game loads (from whatever packs are on) are recoloured as
 * they are read, grey made dark and the colours (flames, arrows, bubbles) left as they are. The
 * windows' grey labels are drawn light instead (DarkLabelsMixin). Switching it reloads the resources.
 */
public final class DarkGui {
	private DarkGui() {}

	/** The shades to pick from: dark grey, or nearly black. */
	public static final String[] SHADES = { "dark", "darker" };

	public static boolean on() {
		return SlashHud.config != null && SlashHud.config.darkGui;
	}

	/** The window textures: the containers' backgrounds, their sprites, the widgets and the recipe book (1.20.1: one file each). */
	static boolean window(Identifier id) {
		if (!"minecraft".equals(id.getNamespace())) return false;
		String p = id.getPath();
		if (!p.endsWith(".png")) return false;
		return p.startsWith("textures/gui/container/") || p.startsWith("textures/gui/sprites/container/")
			|| p.startsWith("textures/gui/sprites/widget/") || p.startsWith("textures/gui/sprites/recipe_book/")
			|| p.equals("textures/gui/recipe_book.png") || p.equals("textures/gui/widgets.png");
	}

	/** The resource as read, or a dark one in its place when it is a window's texture and the look is on. */
	public static Resource wrap(Identifier id, Resource r) {
		if (r == null || !on() || !window(id)) return r;
		return new Resource(r.source(), () -> darken(r.open()), r::metadata);
	}

	/** A dark copy of a PNG: a broken one is passed on as it is (the game reports it as it would). */
	static InputStream darken(InputStream in) throws IOException {
		byte[] bytes;
		try (in) {
			bytes = in.readAllBytes();
		}
		try {
			BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
			if (image == null) return new ByteArrayInputStream(bytes);
			BufferedImage out = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_ARGB);
			for (int y = 0; y < image.getHeight(); y++) {
				for (int x = 0; x < image.getWidth(); x++) out.setRGB(x, y, pixel(image.getRGB(x, y)));
			}
			ByteArrayOutputStream png = new ByteArrayOutputStream(bytes.length);
			ImageIO.write(out, "png", png);
			return new ByteArrayInputStream(png.toByteArray());
		} catch (RuntimeException | IOException e) {
			SlashHud.LOG.debug("SlashClient: dark window texture: {}", e.toString());
			return new ByteArrayInputStream(bytes);
		}
	}

	/**
	 * One pixel: a grey one (the panels, slots, bevels, buttons) to a dark grey of the same order, so
	 * the light edges stay lighter than the panel and the slots darker; a coloured one as it is.
	 */
	static int pixel(int argb) {
		int a = argb >>> 24;
		if (a == 0) return argb;
		int r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		int max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b));
		if (max - min > 28) return argb;
		int l = (r + g + b) / 3;
		// dark: 0 → 20, 0x55 → 43, 0x8B → 58, 0xC6 → 74, 0xFF → 90 (a dark panel, darker slots, soft edges);
		// darker: 0 → 8, 0xC6 → 42, 0xFF → 52 (nearly black, the edges still a step lighter)
		boolean darker = SlashHud.config != null && "darker".equals(SlashHud.config.darkGuiShade);
		int n = darker ? 8 + l * 44 / 255 : 20 + l * 70 / 255;
		return a << 24 | n << 16 | n << 8 | Math.min(255, n + 6);
	}

	/** After the switch: the textures read again, dark or not. */
	public static void reload() {
		Minecraft mc = Minecraft.getInstance();
		mc.execute(mc::reloadResourcePacks);
	}

	/** The windows' labels (the game's dark grey 0x404040): light on the dark panel. */
	public static int label(int color) {
		return on() && (color & 0xFFFFFF) == 0x404040 ? (color & 0xFF000000) | 0xE0E0E0 : color;
	}
}
