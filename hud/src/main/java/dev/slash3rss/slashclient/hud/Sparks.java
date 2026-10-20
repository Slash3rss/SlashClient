package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;

/**
 * Sparks ("Iskry"), the currency SlashClient achievements pay and the cosmetics shop takes. Its
 * name lives only here and in the lang keys slashclient-hud.sparks.*, so it can be renamed in one
 * place: amounts with the right plural form (Polish: 1 Iskra, 2–4 Iskry, 5+ and 12–14 Iskier),
 * the name on its own, and the little gold spark drawn next to amounts.
 */
public final class Sparks {
	private Sparks() {}

	/** The colour of everything about Sparks: gold, as the lock on achievement items. */
	public static final int GOLD = 0xFFFACC15;

	/** "1 250 Iskier" / "1,250 Sparks". */
	public static String format(int n) {
		int abs = Math.abs(n), tens = abs % 100, ones = abs % 10;
		String form = abs == 1 ? "one" : ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? "few" : "many";
		return Component.translatable("slashclient-hud.sparks." + form, number(n)).getString();
	}

	/** Just the number, grouped the way the game's language writes it ("1 250", "1,250"). */
	public static String number(int n) {
		String s = String.format(java.util.Locale.ROOT, "%,d", n);
		return polish() ? s.replace(',', ' ') : s;
	}

	/** Short, for a price on a small tile: "600", "1k", "1,2k" ("1.2k" in English). */
	public static String compact(int n) {
		if (n < 1000) return Integer.toString(n);
		if (n % 1000 == 0 || n >= 10_000) return n / 1000 + "k";
		return n / 1000 + (polish() ? "," : ".") + n % 1000 / 100 + "k";
	}

	/** The name as in "buy with Sparks" ("Iskry"). */
	public static String name() {
		return Component.translatable("slashclient-hud.sparks.name").getString();
	}

	/** The name as in "not enough Sparks" (Polish genitive: "Iskier"). */
	public static String genitive() {
		return Component.translatable("slashclient-hud.sparks.genitive").getString();
	}

	/** The spark, `size` pixels, in gold. */
	public static void icon(GuiGraphicsExtractor g, int x, int y, int size) {
		Ui.icon(g, "spark", x, y, size, GOLD);
	}

	private static boolean polish() {
		Minecraft mc = Minecraft.getInstance();
		return mc != null && mc.options != null && mc.options.languageCode.startsWith("pl");
	}
}
