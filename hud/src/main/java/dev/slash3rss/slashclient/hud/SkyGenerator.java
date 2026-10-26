// SkyUp's generators are played on 26.3: the reading is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;

import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The upgrade points spent in a stone generator, read from its window (SkyUp says it nowhere): each
 * upgrade's level costs a point ("Koszty ulepszenia » 1 pkt"). The window lays every upgrade out as
 * its icon, two "Postęp" items ("Poziom » 1 / 10") and "Ulepsz". The time and the fortune start at
 * level 0, the ores (their icon says "Szansa na drop") at level 1, which costs nothing. For the task
 * "Generator kamienia z 10 zużytymi punktami ulepszeń": the most seen in a generator counts.
 */
public final class SkyGenerator {
	private SkyGenerator() {}

	private static final Pattern LEVEL = Pattern.compile("(?i)Poziom\\s*»\\s*(\\d+)\\s*/\\s*\\d+");
	/** The task's requirement: "Generator kamienia z 10 zużytymi punktami ulepszeń". */
	private static final Pattern NEEDED = Pattern.compile("(?i)generator\\w*\\s+kamienia\\s+z\\s+(\\d+)\\s+zużyt\\w*\\s+punkt\\w*\\s+ulepsze\\w*");

	/** The points a requirement asks to have spent in a generator; 0 when it is about something else. */
	static int needed(String thing) {
		Matcher m = NEEDED.matcher(SkyTaskParser.plain(thing));
		return m.find() ? Integer.parseInt(m.group(1)) : 0;
	}

	/** The most points seen spent in a generator; -1 before any generator's window was opened. */
	static int spent() {
		Integer v = SkyTasks.data().generatorSpent;
		return v == null ? -1 : v;
	}

	private static String plain(ItemStack stack) {
		// with or without SkyUp's "» … «" around the name
		return SkyTaskParser.plain(stack.getHoverName().getString()).replaceAll("^[»\\s]+|[«\\s]+$", "").toLowerCase(Locale.ROOT);
	}

	private static String lore(ItemStack stack) {
		StringBuilder s = new StringBuilder();
		for (Component line : SkyDump.lore(stack)) s.append(SkyTaskParser.plain(line.getString())).append('\n');
		return s.toString();
	}

	/** A window's items: when it is a generator's, the points spent in it; -1 when it is not one. */
	static int read(List<ItemStack> items) {
		boolean generator = false;
		for (ItemStack it : items) if (plain(it).equals("punkty ulepszeń") && lore(it).toLowerCase(Locale.ROOT).contains("dostępne punkty ulepszeń")) generator = true;
		if (!generator) return -1;
		int spent = 0;
		for (int i = 0; i + 1 < items.size(); i++) {
			ItemStack icon = items.get(i), progress = items.get(i + 1);
			// an upgrade's icon: the item right before its first "Postęp" (not a "Postęp" itself)
			if (icon.isEmpty() || plain(icon).equals("postęp") || !plain(progress).equals("postęp")) continue;
			Matcher m = LEVEL.matcher(lore(progress));
			if (!m.find()) continue;
			int base = lore(icon).toLowerCase(Locale.ROOT).contains("szansa na drop") ? 1 : 0;
			spent += Math.max(0, Integer.parseInt(m.group(1)) - base);
		}
		return spent;
	}

	/** A generator's window seen: the most spent kept (for the task, on any generator of the island). */
	static void seen(List<ItemStack> items) {
		int now = read(items);
		if (now < 0) return;
		SkyTasks.Data d = SkyTasks.data();
		if (d.generatorSpent == null || now > d.generatorSpent) {
			d.generatorSpent = now;
			SkyTasks.dirty = true;
		}
	}
}
//#endif
