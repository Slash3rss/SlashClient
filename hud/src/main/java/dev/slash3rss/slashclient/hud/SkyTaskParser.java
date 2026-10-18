package dev.slash3rss.slashclient.hud;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads one of SkyUp.pl's island tasks from an item's tooltip (its name and lore, as plain text).
 * The tasks GUI (a chest titled after the tier, e.g. "NOWICJUSZ") shows each task as an item:
 *
 * <pre>
 * » Huta «
 * ▪ Zalecane ukończenie wyzwania Mała farma        (sometimes)
 * ▪ Opis » Przepal surowe żelazo. Od czegoś          (wraps over lines)
 *   trzeba zacząć, co nie?
 *
 * ▪ Posiadaj w ekwipunku:                            (one or more sections: a header…)
 *   » Sztabka żelaza: 16                             (…and "» thing: progress" lines)
 * ▪ Zbierz:
 *   » Kamień: 28/128
 *
 * ▪ Za ukończenie otrzymasz:
 *   » 10 x Węgiel
 * ▪ Uwaga » Przedmioty zostaną zabrane!              (sometimes)
 * ▪ LPM » Ukończ
 * </pre>
 *
 * Plain Java only (no game classes), so it reads the same in every version and in tests.
 */
public final class SkyTaskParser {
	private SkyTaskParser() {}

	/** One task as read from its item. Kept as it is in the saved file. */
	public static final class Task {
		public String tier = "", name = "", recommended = "", description = "";
		public List<Section> sections = new ArrayList<>();
		public List<String> rewards = new ArrayList<>();
		/** "Uwaga » Przedmioty zostaną zabrane!": the items are taken on completing. */
		public boolean takesItems;
		/** The item showing it (e.g. "minecraft:iron_ingot"), for its icon. */
		public String icon = "";
		/** When it was last read from the GUI (ms). */
		public long seen;
		/** Gone from its GUI at the last look: completed. */
		public boolean done;

		public String key() {
			return tier + "|" + name;
		}
	}

	/** A header ("Zbierz:", "Posiadaj w ekwipunku:", …) and its lines. */
	public static final class Section {
		public String header = "";
		public List<Req> items = new ArrayList<>();

		/** "Posiadaj w ekwipunku": the client counts it itself, from the player's inventory. */
		public boolean inventory() {
			return header.toLowerCase(Locale.ROOT).startsWith("posiadaj w ekwipunku");
		}
	}

	/** One requirement: "Kamień: 28/128" (current 28 of 128) or "Sztabka żelaza: 16" (16 needed, current unknown). */
	public static final class Req {
		public String thing = "";
		public long current = -1, required = -1;
		/** What follows the number ("poz."), or the whole text when there is no number. */
		public String unit = "";

		public boolean known() {
			return current >= 0 && required >= 0;
		}
	}

	private static final Pattern TITLE = Pattern.compile("^(?:»|>>)\\s*(.+?)\\s*(?:«|<<)$");
	private static final Pattern ARROW = Pattern.compile("^(?:»|>>)\\s*");
	/** "28/128", "1 024 / 2 048" at the end of a line. */
	private static final Pattern FRACTION = Pattern.compile("(\\d[\\d  ]*)\\s*/\\s*(\\d[\\d  ]*)\\s*$");
	/** "16", "1 poz.", "5 poz." at the end of a line. */
	private static final Pattern AMOUNT = Pattern.compile("(\\d[\\d  ]*)\\s*([^\\d\\s][^\\d]*)?$");
	/** Bullets and other marks before a line's text. */
	private static final Pattern BULLET = Pattern.compile("^[\\s▪■•●◆◇▸►\\-*·]+");

	/** The headers seen so far ("Stwórz:", "Postaw", "Posiadaj w ekwipunku:", …); others are read as headers too, after an empty line. */
	private static final Pattern HEADER = Pattern.compile("^(stwórz|postaw|zbierz|zjedz|wyłów|posiadaj|stój|zabij|wydobądź|zdobądź|ulepsz|odwiedź)\\b.*(:|[^.!?…]$)");

	private enum Mode { NONE, RECOMMENDED, DESCRIPTION, REQUIREMENTS, REWARDS }

	/** Colour codes (§x) and outer spaces off. */
	public static String plain(String s) {
		return s == null ? "" : s.replaceAll("§.", "").replace(' ', ' ').strip();
	}

	/**
	 * The task in an item's name and lore, or null when it is not one: a title "» … «" and at least
	 * one requirement or the rewards line.
	 */
	public static Task parse(String tier, String name, List<String> lore) {
		Matcher title = TITLE.matcher(plain(name));
		if (!title.matches()) return null;
		Task task = new Task();
		task.tier = plain(tier);
		task.name = title.group(1).strip();
		boolean rewards = false;
		Mode mode = Mode.NONE;
		Section section = null;
		for (String raw : lore) {
			String line = BULLET.matcher(plain(raw)).replaceFirst("").strip();
			if (line.isEmpty()) {
				if (mode == Mode.RECOMMENDED || mode == Mode.DESCRIPTION) mode = Mode.NONE;
				continue;
			}
			String lower = line.toLowerCase(Locale.ROOT);
			// a section's header right after the description, with no empty line between
			if ((mode == Mode.RECOMMENDED || mode == Mode.DESCRIPTION) && HEADER.matcher(lower).find()) mode = Mode.NONE;
			if (lower.startsWith("zalecane ukończenie")) {
				task.recommended = line.replaceFirst("(?i)^zalecane ukończenie( wyzwania)?\\s*", "");
				mode = Mode.RECOMMENDED;
			} else if (lower.matches("^opis\\s*(»|>>|:).*")) {
				task.description = line.replaceFirst("^(?i)opis\\s*(»|>>|:)\\s*", "");
				mode = Mode.DESCRIPTION;
			} else if (lower.startsWith("za ukończenie")) {
				rewards = true;
				mode = Mode.REWARDS;
			} else if (lower.startsWith("uwaga")) {
				if (lower.contains("zabrane")) task.takesItems = true;
				mode = Mode.NONE;
			} else if (lower.startsWith("lpm") || lower.startsWith("ppm")) {
				mode = Mode.NONE;
			} else if (mode == Mode.RECOMMENDED) {
				task.recommended += " " + line;
			} else if (mode == Mode.DESCRIPTION) {
				task.description += " " + line;
			} else if (mode == Mode.REWARDS) {
				Matcher arrow = ARROW.matcher(line);
				if (arrow.find()) task.rewards.add(line.substring(arrow.end()).strip());
				// a wrapped reward line goes on with the one before
				else if (!task.rewards.isEmpty()) task.rewards.set(task.rewards.size() - 1, task.rewards.get(task.rewards.size() - 1) + " " + line);
			} else {
				Matcher arrow = ARROW.matcher(line);
				if (arrow.find() && section != null) {
					section.items.add(req(line.substring(arrow.end()).strip()));
					mode = Mode.REQUIREMENTS;
					continue;
				}
				// a line wrapped from the requirement before (that had no number yet)
				if (mode == Mode.REQUIREMENTS && section != null && !section.items.isEmpty() && !line.endsWith(":")
					&& section.items.get(section.items.size() - 1).required < 0) {
					Req last = section.items.get(section.items.size() - 1);
					section.items.set(section.items.size() - 1, req(last.thing + (last.unit.isEmpty() ? "" : ": " + last.unit) + " " + line));
					continue;
				}
				// a header: "Zbierz:", "Postaw", or one with its value ("Posiadaj poziom dowolnej pracy: 5 poz.")
				section = new Section();
				task.sections.add(section);
				mode = Mode.REQUIREMENTS;
				int colon = line.lastIndexOf(':');
				if (colon >= 0 && colon < line.length() - 1) {
					section.header = line.substring(0, colon).strip();
					section.items.add(req(line));
				} else {
					section.header = colon >= 0 ? line.substring(0, colon).strip() : line;
				}
			}
		}
		if (task.sections.isEmpty() && !rewards) return null;
		task.description = task.description.strip();
		task.recommended = task.recommended.strip();
		return task;
	}

	/** "Kamień: 28/128", "Sztabka żelaza: 16", "kaktus: 1 poz.", or text with no number. */
	static Req req(String text) {
		Req r = new Req();
		int colon = text.lastIndexOf(':');
		String value = colon >= 0 ? text.substring(colon + 1).strip() : text;
		r.thing = colon >= 0 ? text.substring(0, colon).strip() : "";
		Matcher f = FRACTION.matcher(value);
		Matcher a = AMOUNT.matcher(value);
		if (f.find() && f.start() == 0) {
			r.current = number(f.group(1));
			r.required = number(f.group(2));
		} else if (a.find() && a.start() == 0) {
			r.required = number(a.group(1));
			r.unit = a.group(2) == null ? "" : a.group(2).strip();
		} else if (colon >= 0) {
			r.unit = value;
		} else {
			r.thing = text.strip();
		}
		return r;
	}

	private static long number(String digits) {
		try {
			return Long.parseLong(digits.replaceAll("[^\\d]", ""));
		} catch (NumberFormatException e) {
			return -1;
		}
	}
}
