// SkyUp's incubators are played on 26.3: the reading is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Incubators' levels, read from their windows for tasks like "Posiadaj na wyspie co najmniej:
 * Inkubator kaktusów: 1 poz.". SkyUp names neither the level nor the crop there: the level is the
 * speed-up ("Przyspieszenie » x5/x500" is level 5: its speed is five times the first level's), and the
 * crop is in the upgrade's cost ("Ziarna kakaowe: 240/240", next to logs and rarer things). Each
 * cost's item keeps the highest level seen with it; a task's crop ("kaktusów") is matched to an
 * item by the start of the word ("Kaktus").
 */
public final class SkyIncubator {
	private SkyIncubator() {}

	private static final Pattern SPEED_UP = Pattern.compile("(?i)Przyspieszenie\\s*»\\s*x\\s*(\\d+)");
	private static final Pattern COST = Pattern.compile("^»?\\s*(.+?)\\s*:\\s*[\\d  ]+\\s*/\\s*[\\d  ]+\\s*$");
	/** The task's requirement: "Inkubator kaktusów". */
	private static final Pattern NEEDED = Pattern.compile("(?i)^inkubator\\w*\\s+(.+)$");

	private static String name(ItemStack stack) {
		return SkyTaskParser.plain(stack.getHoverName().getString()).replaceAll("^[»\\s]+|[«\\s]+$", "").toLowerCase(Locale.ROOT);
	}

	private static List<String> lore(ItemStack stack) {
		List<String> out = new ArrayList<>();
		for (Component line : SkyDump.lore(stack)) out.add(SkyTaskParser.plain(line.getString()).replaceFirst("^[▪\\s]+", ""));
		return out;
	}

	/** An incubator's window: its level and the items of its upgrade's cost; null for any other window. */
	static Map.Entry<Integer, List<String>> read(List<ItemStack> items) {
		int level = -1;
		List<String> costs = new ArrayList<>();
		for (ItemStack it : items) {
			if (it.isEmpty()) continue;
			String n = name(it);
			if (n.equals("status")) for (String l : lore(it)) {
				Matcher m = SPEED_UP.matcher(l);
				if (m.find()) level = Integer.parseInt(m.group(1));
			}
			if (n.equals("ulepsz")) {
				boolean cost = false;
				for (String l : lore(it)) {
					if (l.toLowerCase(Locale.ROOT).startsWith("koszt ulepszenia")) {
						cost = true;
						continue;
					}
					Matcher m = COST.matcher(l);
					if (cost && m.matches() && !m.group(1).equalsIgnoreCase("koszt")) costs.add(m.group(1).toLowerCase(Locale.ROOT));
				}
			}
		}
		return level < 0 || costs.isEmpty() ? null : Map.entry(level, costs);
	}

	/** A window seen: when it is an incubator's, each of its upgrade's items keeps the highest level. */
	static void seen(List<ItemStack> items) {
		var read = read(items);
		if (read == null) return;
		SkyTasks.Data d = SkyTasks.data();
		if (d.incubators == null) d.incubators = new LinkedHashMap<>();
		for (String item : read.getValue()) {
			Integer old = d.incubators.get(item);
			if (old == null || read.getKey() > old) {
				d.incubators.put(item, read.getKey());
				SkyTasks.dirty = true;
			}
		}
	}

	/** Whether a requirement is an incubator's ("Inkubator kaktusów"). */
	static boolean about(String thing) {
		return NEEDED.matcher(SkyTaskParser.plain(thing)).matches();
	}

	/** The highest level seen of the incubator a requirement names; -1 when none of its kind was opened yet. */
	static int level(String thing) {
		Matcher m = NEEDED.matcher(SkyTaskParser.plain(thing));
		Map<String, Integer> seen = SkyTasks.data().incubators;
		if (!m.matches() || seen == null) return -1;
		int best = -1;
		for (var e : seen.entrySet()) if (sameCrop(m.group(1), e.getKey())) best = Math.max(best, e.getValue());
		return best;
	}

	/** "kaktusów" and "Kaktus", "buraków" and "Nasiona buraka": a word of each starting alike (5 letters, or the whole of a shorter one). */
	static boolean sameCrop(String wanted, String item) {
		for (String w : words(wanted)) for (String v : words(item)) {
			int need = Math.min(5, Math.min(w.length(), v.length()));
			if (need >= 4 && w.regionMatches(0, v, 0, need)) return true;
		}
		return false;
	}

	private static List<String> words(String s) {
		List<String> out = new ArrayList<>();
		for (String w : s.toLowerCase(Locale.ROOT).split("[^\\p{L}]+")) if (w.length() >= 4) out.add(w);
		return out;
	}
}
//#endif
