package dev.slash3rss.slashclient.hud;

import net.minecraft.network.chat.Component;

/**
 * An enchantment's name in a tooltip coloured by how high its level is (EnchantNameMixin): grey below
 * half of its highest level, aqua from half up, gold at the highest (Sharpness V, Mending), pink above
 * it (levels only a server gives); curses stay red. Switched off, the game's own grey.
 */
public final class EnchantColors {
	private EnchantColors() {}

	public static final int LOW = 0xAAAAAA, HIGH = 0x55FFFF, MAX = 0xFFAA00, OVER = 0xFF55FF;

	/** The colour for a level of an enchantment whose highest level is `max`, or -1 to leave it as it is. */
	public static int color(int level, int max, boolean curse) {
		if (curse || max < 1 || level < 1) return -1;
		if (level > max) return OVER;
		if (level == max) return MAX;
		return level * 2 >= max ? HIGH : LOW;
	}

	/** The game's name (and level) in that colour, when the setting is on. */
	public static Component apply(Component name, int level, int max, boolean curse) {
		if (SlashHud.config == null || !SlashHud.config.enchantColors || name == null) return name;
		int color = color(level, max, curse);
		return color < 0 ? name : name.copy().withStyle(s -> s.withColor(color));
	}
}
