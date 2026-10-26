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
 * Inkubator kaktusów: 1 poz.". SkyUp names neither the level nor the kind there: the level is the
 * speed-up ("Przyspieszenie » x5/x500" is level 5: its speed is five times the first level's), and the
 * kind is told by the upgrade's cost, each kind's own (skyup.pl/wiki/inkubatory): cactus – potatoes and
 * oak logs, pumpkins – wheat seeds and dark oak, melons – beetroot seeds and pale oak, sugar cane – cocoa
 * and jungle logs, bamboo – nether wart and cherry, kelp – carrots and birch.
 */
public final class SkyIncubator {
	private SkyIncubator() {}

	/** A kind: its name kept, what its upgrade costs (the start of the items' names) and how tasks write it. */
	private record Kind(String id, List<String> costs, List<String> asked) {}

	private static final List<Kind> KINDS = List.of(
		new Kind("kaktus", List.of("ziemniak", "dębowy pień", "sproszkowany redstone"), List.of("kaktus")),
		new Kind("dynia", List.of("nasiona pszenicy", "ciemnodębowy pień", "odłamek netherytu"), List.of("dyń", "dyni", "dynia")),
		new Kind("arbuz", List.of("nasiona buraka", "bladodębowy pień", "łza ghasta"), List.of("arbuz")),
		new Kind("trzcina", List.of("ziarna kakaowe", "tropikalny pień", "szmaragd"), List.of("trzcin")),
		new Kind("bambus", List.of("netherowa brodawka", "wiśniowy pień", "dowolny odłamek ceramiki"), List.of("bambus")),
		new Kind("wodorosty", List.of("marchewka", "brzozowy pień", "sashimi"), List.of("wodoros")));

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

	/** An incubator's window: its kind and level; null for any other window (or a kind not known). */
	static Map.Entry<String, Integer> read(List<ItemStack> items) {
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
					if (cost && m.matches()) costs.add(m.group(1).toLowerCase(Locale.ROOT));
				}
			}
		}
		if (level < 0) return null;
		// the kind whose items the cost has the most of (one is enough; a "dębowy" log is no "ciemnodębowy" one)
		Kind best = null;
		int most = 0;
		for (Kind k : KINDS) {
			int n = 0;
			for (String c : costs) for (String want : k.costs()) if (c.equals(want) || c.startsWith(want + " ") || want.startsWith(c)) n++;
			if (n > most) {
				most = n;
				best = k;
			}
		}
		return best == null ? null : Map.entry(best.id(), level);
	}

	/** A window seen: when it is an incubator's, its kind keeps the highest level. */
	static void seen(List<ItemStack> items) {
		var read = read(items);
		if (read == null) return;
		SkyTasks.Data d = SkyTasks.data();
		if (d.incubators == null) d.incubators = new LinkedHashMap<>();
		// from before the kinds were known (keyed by an item of the cost): forgotten
		d.incubators.keySet().removeIf(k -> KINDS.stream().noneMatch(kind -> kind.id().equals(k)));
		Integer old = d.incubators.get(read.getKey());
		if (old == null || read.getValue() > old) {
			d.incubators.put(read.getKey(), read.getValue());
			SkyTasks.dirty = true;
		}
	}

	/** Whether a requirement is an incubator's ("Inkubator kaktusów"). */
	static boolean about(String thing) {
		return NEEDED.matcher(SkyTaskParser.plain(thing)).matches();
	}

	/** The kind a requirement names ("kaktusów" is the cactus one), or null. */
	static String kind(String thing) {
		Matcher m = NEEDED.matcher(SkyTaskParser.plain(thing));
		if (!m.matches()) return null;
		String what = m.group(1).toLowerCase(Locale.ROOT);
		for (Kind k : KINDS) for (String a : k.asked()) if (what.startsWith(a)) return k.id();
		return null;
	}

	/** The highest level seen of the incubator a requirement names; -1 when none of its kind was opened yet. */
	static int level(String thing) {
		String kind = kind(thing);
		Map<String, Integer> seen = SkyTasks.data().incubators;
		if (kind == null || seen == null) return -1;
		Integer v = seen.get(kind);
		return v == null ? -1 : v;
	}
}
//#endif
