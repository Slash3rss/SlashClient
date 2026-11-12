package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.mixin.FontAccessor;
import dev.slash3rss.slashclient.hud.mixin.MinecraftAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;

/**
 * The font the HUD's modules write in (the "Czcionka modułów" setting): the game's own, or the launcher's Outfit.
 * Outfit takes the place of the game's default font only, so badges, emotes and symbols stay as they are (and
 * letters Outfit lacks come from the game's font). While a module is measured and drawn, this font is the game's,
 * so every module follows it without each having to ask.
 */
public final class ModuleFont {
	public static final String[] FONTS = { "minecraft", "outfit", "outfitBold" };

	private ModuleFont() {}

	private static Font made, from;
	private static String madeFor;
	private static int madeScale;

	/** The modules' font now; the game's own one when it is picked. */
	public static Font font(Minecraft mc) {
		String want = SlashHud.config == null ? "minecraft" : SlashHud.config.moduleFont;
		// while a module draws, the game's font is already this one
		Font base = made != null && mc.font == made ? from : mc.font;
		if (want == null || !want.startsWith("outfit")) return base;
		int scale = Ui.scale();
		if (made == null || from != base || !want.equals(madeFor) || scale != madeScale) {
			made = outfit(base, want.equals("outfitBold"), scale);
			from = base;
			madeFor = want;
			madeScale = scale;
		}
		return made;
	}

	/** Puts the modules' font in the game's place; gives back the one to put back after. */
	public static Font begin(Minecraft mc) {
		Font before = mc.font, now = font(mc);
		if (now != before) ((MinecraftAccessor) mc).slashclient$setFont(now);
		return before;
	}

	public static void end(Minecraft mc, Font before) {
		if (mc.font != before) ((MinecraftAccessor) mc).slashclient$setFont(before);
	}

	/** The game's font with Outfit (sharp at this GUI scale) for its default font. */
	private static Font outfit(Font game, boolean bold, int scale) {
		//#if MC >= 1.21.9
		Font.Provider letters = ((FontAccessor) game).slashclient$provider();
		net.minecraft.network.chat.FontDescription outfit = (bold ? Ui.OUTFIT_BOLD : Ui.OUTFIT)[scale];
		return new Font(new Font.Provider() {
			@Override
			public net.minecraft.client.gui.GlyphSource glyphs(net.minecraft.network.chat.FontDescription font) {
				return letters.glyphs(net.minecraft.network.chat.FontDescription.DEFAULT.equals(font) ? outfit : font);
			}

			@Override
			public net.minecraft.client.gui.font.glyphs.EffectGlyph effect() {
				return letters.effect();
			}
		});
		//#else
		//$ var letters = ((FontAccessor) game).slashclient$fonts();
		//$ net.minecraft.resources.Identifier outfit = (bold ? Ui.OUTFIT_BOLD : Ui.OUTFIT)[scale];
		//$ return new Font(id -> letters.apply(net.minecraft.network.chat.Style.DEFAULT_FONT.equals(id) ? outfit : id), ((FontAccessor) game).slashclient$filterFishyGlyphs());
		//#endif
	}
}
