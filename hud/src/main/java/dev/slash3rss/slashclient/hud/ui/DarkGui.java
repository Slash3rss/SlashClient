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

	/** Whether any window texture is changed: the dark look or the blocks' (BlockWindows). */
	public static boolean any() {
		return on() || BlockWindows.on();
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

	/** The resource as read, or a changed one in its place: a window drawn as its block (BlockWindows), or a window's texture dark. */
	public static Resource wrap(Identifier id, Resource r) {
		if (r == null) return r;
		BlockArt.Art art = BlockWindows.on() ? BlockWindows.artOf(id) : null;
		boolean dark = on() && window(id);
		if (art == null && !dark) return r;
		return new Resource(r.source(), () -> change(r.open(), art), r::metadata);
	}

	/** A changed copy of a PNG: a broken one is passed on as it is (the game reports it as it would). */
	static InputStream change(InputStream in, BlockArt.Art art) throws IOException {
		byte[] bytes;
		try (in) {
			bytes = in.readAllBytes();
		}
		try {
			BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
			if (image == null) return new ByteArrayInputStream(bytes);
			BufferedImage out = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_ARGB);
			out.getGraphics().drawImage(image, 0, 0, null);
			// a window drawn as its block: the rest of it dark too with the dark look; any other dark all over
			if (art != null) BlockArt.paint(out, art, on(), darker());
			else {
				for (int y = 0; y < out.getHeight(); y++) {
					for (int x = 0; x < out.getWidth(); x++) out.setRGB(x, y, pixel(out.getRGB(x, y)));
				}
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
		return BlockArt.dark(argb, darker());
	}

	/** Whether the nearly black shade is picked. */
	static boolean darker() {
		return SlashHud.config != null && "darker".equals(SlashHud.config.darkGuiShade);
	}

	/** After the switch: the textures read again, dark or not. */
	public static void reload() {
		Minecraft mc = Minecraft.getInstance();
		mc.execute(mc::reloadResourcePacks);
	}

	/** The windows' labels (the game's dark grey 0x404040): light on the dark panel, white on the blocks' (with a shadow, labelShadow). */
	public static int label(int color, Object screen) {
		if ((color & 0xFFFFFF) != 0x404040) return color;
		if (BlockWindows.drawn(screen)) return (color & 0xFF000000) | 0xFFFFFF;
		return on() ? (color & 0xFF000000) | 0xE0E0E0 : color;
	}

	/** A shadow under the labels on the blocks' textures, which are busier than the plain panel. */
	public static boolean labelShadow(boolean shadow, Object screen) {
		return shadow || BlockWindows.drawn(screen);
	}
}
