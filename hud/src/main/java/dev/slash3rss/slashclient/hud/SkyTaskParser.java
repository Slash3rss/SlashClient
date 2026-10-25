package dev.slash3rss.slashclient.hud;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads SkyUp.pl's challenges ("Wyzwania") from an item's tooltip: its name and lore, as plain text.
 * The challenges menu ("Wyzwania") holds the categories and the daily task; each category's GUI
 * ("Wyzwania » Nowicjusz") holds its tasks, one item each, a completed one gone from it:
 *
 * <pre>
 * » Kryptomaniak «
 * ▪ Wymaga ukończenia wyzwania Zmory           (or "Zalecane ukończenie wyzwania …"; sometimes)
 *   podziemi
 * ▪ Opis » Zawalcz w Dungeonach! Uważaj na
 *   siebie!
 * ▪ Dotrzyj do poziomu w dungeonach: 10        (a requirement written on its header…)
 *   poz.
 * ▪ Stwórz:                                    (…or a header and its "»" lines)
 *   » Sashimi: 0/3
 * ▪ Za ukończenie otrzymasz:
 *   » 1 x Żelazny miecz (Ostrość V)
 * ▪ Uwaga » Przedmioty zostaną zabrane!        (sometimes)
 * ▪ LPM » Ukończ
 * </pre>
 *
 * A line opens a block when it is not indented ("▪ …"); an indented "» …" line is one of the block's
 * entries; any other indented line goes on with the line above it (the server wraps long lines).
 * Headers are not listed anywhere: new kinds of requirements are read the same way. A category in
 * the menu has "Pozostałe zadania » 16" and "Za ukończenie poziomu otrzymasz"; the daily task has
 * "Kategoria » …".
 *
 * Plain Java only (no game classes), so it reads the same in every version and in tests.
 */
public final class SkyTaskParser {
	private SkyTaskParser() {}

	/** One task (or a category of the menu) as read from its item. Kept as it is in the saved file. */
	public static final class Task {
		/** The category ("Nowicjusz"), or the menu's title for the daily task. */
		public String tier = "", name = "", description = "";
		/** "Zalecane ukończenie wyzwania …" (advised first) and "Wymaga ukończenia wyzwania …" (locked until). */
		public String recommended = "", requires = "";
		public List<Section> sections = new ArrayList<>();
		public List<String> rewards = new ArrayList<>();
		/** "Key » value" lines: "Pozostałe zadania » 16", "Kategoria » Wirtuoz", … */
		public Map<String, String> info = new LinkedHashMap<>();
		/** "Uwaga » Przedmioty zostaną zabrane!": the items are taken on completing. */
		public boolean takesItems;
		/** A category of the menu (it has "Pozostałe zadania"), not a task. */
		public boolean category;
		/** The item showing it (e.g. "minecraft:iron_ingot"), for its icon. */
		public String icon = "";
		/** When it was last read from the GUI (ms). */
		public long seen;

		public String key() {
			return tier + "|" + name;
		}

		/** A category's tasks left ("Pozostałe zadania"), or -1. */
		public int remaining() {
			String v = info.get("Pozostałe zadania");
			if (v == null) return -1;
			long n = number(v);
			return n < 0 ? -1 : (int) n;
		}
	}

	/** A header ("Zbierz", "Posiadaj w ekwipunku", …) and its lines. */
	public static final class Section {
		public String header = "";
		public List<Req> items = new ArrayList<>();

		/** "Posiadaj w ekwipunku": the client counts it itself, from the player's inventory. */
		public boolean inventory() {
			return header.toLowerCase(Locale.ROOT).startsWith("posiadaj w ekwipunku");
		}
	}

	/** One requirement: "Kamień: 28/128" (28 of 128), "Sztabka żelaza: 16" (16 needed), "Wyłów: 0g/200 000g", "74x74". */
	public static final class Req {
		public String thing = "";
		public long current = -1, required = -1;
		/** What goes with the numbers ("poz.", "g"), or the whole value when there is no number. */
		public String unit = "";
		/** Counted by the client since the GUI was last read (SkyCounters): an estimate on top of `current`. */
		public long extra;

		public boolean known() {
			return current >= 0 && required >= 0;
		}
	}

	private static final Pattern TITLE = Pattern.compile("^(?:»|>>)\\s*(.+?)\\s*(?:«|<<)$");
	private static final Pattern ARROW = Pattern.compile("^(?:»|>>)\\s*");
	/** "Key » value" on a block's line. */
	private static final Pattern INFO = Pattern.compile("^(.+?)\\s*(?:»|>>)\\s*(.+)$");
	/** "28/128", "1 024 / 2 048", "0g/200 000g". */
	private static final String NUMBER = "(\\d+(?:[  ]\\d{3})*)";
	private static final Pattern FRACTION = Pattern.compile("^" + NUMBER + "\\s*([^\\d/\\s]*)\\s*/\\s*" + NUMBER + "\\s*(\\S.*)?$");
	/** "16", "20 poz.", but not "74x74". */
	private static final Pattern AMOUNT = Pattern.compile("^" + NUMBER + "\\s*([^\\d\\s].*)?$");
	/** Where one requirement ends and the next starts on a shared entry: after a number, at a comma. */
	private static final Pattern LIST = Pattern.compile("(?<=\\d)\\s*,\\s+(?=\\D)");
	/** "1 x Generator kamienia z 10 zużytymi punktami ulepszeń": how many of what. */
	private static final Pattern TIMES = Pattern.compile("^" + "(\\d+)" + "\\s*x\\s+(.+)$");
	private static final Pattern SIZE = Pattern.compile("^\\d+\\s*x\\s*\\d+$");
	/** Bullets and other marks before a line's text. */
	private static final Pattern BULLET = Pattern.compile("^[\\s▪■•●◆◇▸►*·]+");

	/**
	 * Colour codes (§x), the resource pack's private characters and outer spaces off. SkyUp starts its
	 * GUI titles with such characters (they draw the GUI's picture: "\ue001\ue151\ue002Wyzwania » Nowicjusz")
	 * and puts a mouse icon in "LPM \ue510 » Ukończ".
	 */
	public static String plain(String s) {
		return s == null ? "" : s.replaceAll("§.", "").replaceAll("[\\uE000-\\uF8FF]", "").replace(' ', ' ').strip();
	}

	private static final Pattern CHALLENGES_TITLE = Pattern.compile("(?i)^wyzwania(\\s*(»|>>)\\s*\\S.*)?$");
	/** What only the challenges GUIs hold: a task's "LPM » Ukończ", a category's "Sprawdź wyzwania", the info item. */
	private static final Pattern CHALLENGES_LINE = Pattern.compile("(?i)(»|>>)\\s*ukończ( wyzwanie)?$|(»|>>)\\s*sprawdź wyzwania$|^wyzwania to kluczowy element");

	/** A title of SkyUp's challenges: the menu "Wyzwania" or a category "Wyzwania » Nowicjusz" (the picture's characters aside). */
	public static boolean challengesTitle(String title) {
		return CHALLENGES_TITLE.matcher(plain(title)).matches();
	}

	/** A lore line only the challenges GUIs have. */
	public static boolean challengesLine(String line) {
		return CHALLENGES_LINE.matcher(BULLET.matcher(plain(line)).replaceFirst("")).find();
	}

	/** A line of the tooltip: a block's own text and its "»" entries, each joined with the lines that go on from it. */
	private static final class Block {
		String text;
		final List<String> entries = new ArrayList<>();

		Block(String text) {
			this.text = text;
		}
	}

	/** The lore cut into blocks, by indentation (see the class comment). */
	static List<Block> blocks(List<String> lore) {
		List<Block> out = new ArrayList<>();
		for (String raw : lore) {
			String s = raw == null ? "" : raw.replaceAll("§.", "").replace(' ', ' ');
			String line = BULLET.matcher(s).replaceFirst("").strip();
			if (line.isEmpty()) continue;
			boolean indented = Character.isWhitespace(s.charAt(0)) && !s.strip().startsWith("▪");
			Matcher arrow = ARROW.matcher(line);
			Block last = out.isEmpty() ? null : out.get(out.size() - 1);
			if (arrow.find() && last != null && indented) {
				last.entries.add(line.substring(arrow.end()).strip());
			} else if (indented && last != null) {
				// a wrapped line: it goes on with the entry (or block) above
				if (last.entries.isEmpty()) last.text += " " + line;
				else last.entries.set(last.entries.size() - 1, last.entries.get(last.entries.size() - 1) + " " + line);
			} else {
				out.add(new Block(line));
			}
		}
		return out;
	}

	/**
	 * The task in an item's name and lore, or null when it is not one: a title "» … «" and at least
	 * one requirement, the rewards line, or (a category of the menu) "Pozostałe zadania".
	 */
	public static Task parse(String tier, String name, List<String> lore) {
		Matcher title = TITLE.matcher(plain(name));
		if (!title.matches()) return null;
		// handed in already: some players (admins' preview) still see it in the GUI, marked so – not a task to do
		for (String line : lore) if (plain(line).replaceFirst("^[»>•▪\\s-]+", "").toLowerCase(Locale.ROOT).startsWith("zadanie ukończone")) return null;
		Task task = new Task();
		task.tier = plain(tier);
		task.name = title.group(1).strip();
		boolean rewards = false;
		for (Block b : blocks(lore)) {
			String text = b.text, lower = text.toLowerCase(Locale.ROOT);
			if (lower.matches("^opis\\s*(»|>>|:).*")) {
				task.description = text.replaceFirst("^(?i)opis\\s*(»|>>|:)\\s*", "");
			} else if (lower.startsWith("zalecane ukończenie")) {
				task.recommended = text.replaceFirst("(?i)^zalecane ukończenie( wyzwania| wyzwań)?\\s*", "");
			} else if (lower.startsWith("wymaga ukończenia")) {
				task.requires = text.replaceFirst("(?i)^wymaga ukończenia( wyzwania| wyzwań)?\\s*", "");
			} else if (lower.startsWith("za ukończenie poziomu")) {
				task.category = true;
				task.rewards.addAll(b.entries);
			} else if (lower.startsWith("za ukończenie")) {
				rewards = true;
				task.rewards.addAll(b.entries);
			} else if (lower.startsWith("nagrody")) {
				// rewards under a note of their own ("Nagrody » Pieniądze na pierwszy spawner!")
				rewards = true;
				task.rewards.addAll(b.entries);
			} else if (lower.startsWith("na tym poziomie otrzymasz")) {
				task.category = true;
			} else if (lower.startsWith("uwaga")) {
				if (lower.contains("zabrane")) task.takesItems = true;
			} else if (lower.startsWith("lpm") || lower.startsWith("ppm") || lower.startsWith("śpm")) {
				// what a click does
			} else if (b.entries.isEmpty() && INFO.matcher(text).matches()) {
				Matcher m = INFO.matcher(text);
				m.matches();
				task.info.put(m.group(1).strip(), m.group(2).strip());
			} else {
				Section section = new Section();
				int colon = text.indexOf(':');
				String value = colon >= 0 ? text.substring(colon + 1).strip() : "";
				section.header = colon >= 0 ? text.substring(0, colon).strip() : text;
				if (!value.isEmpty()) {
					// the requirement on the header itself: "Posiadaj poziom wyspy: 20 poz."
					Req r = value(value);
					r.thing = section.header;
					section.items.add(r);
				}
				// several on one entry, wrapped over lines: "Kostka magmy: 0/1, Muł (dorosły): 0/1, …"
				for (String e : b.entries) for (String one : LIST.split(e)) section.items.add(req(one.strip()));
				// a sentence of its own (no requirement in it) is no section
				if (!section.items.isEmpty()) task.sections.add(section);
			}
		}
		if (task.info.containsKey("Pozostałe zadania")) task.category = true;
		if (!task.category && task.sections.isEmpty() && !rewards) return null;
		return task;
	}

	/** "Kamień: 28/128", "Sztabka żelaza: 16", "kaktus: 1 poz.", or text with no number. */
	static Req req(String text) {
		Matcher times = TIMES.matcher(text);
		if (text.indexOf(':') < 0 && times.matches()) {
			Req r = new Req();
			r.required = number(times.group(1));
			r.thing = times.group(2).strip();
			return r;
		}
		int colon = text.lastIndexOf(':');
		Req r = value(colon >= 0 ? text.substring(colon + 1).strip() : "");
		r.thing = colon >= 0 ? text.substring(0, colon).strip() : text.strip();
		return r;
	}

	/** The value of a requirement: "28/128", "0g/200 000g", "16", "20 poz.", "74x74". */
	static Req value(String value) {
		Req r = new Req();
		Matcher f = FRACTION.matcher(value);
		Matcher a = AMOUNT.matcher(value);
		if (SIZE.matcher(value).matches()) {
			r.unit = value;
		} else if (f.matches()) {
			r.current = number(f.group(1));
			r.required = number(f.group(3));
			r.unit = f.group(4) != null ? f.group(4).strip() : f.group(2);
		} else if (a.matches()) {
			r.required = number(a.group(1));
			r.unit = a.group(2) == null ? "" : a.group(2).strip();
		} else {
			r.unit = value;
		}
		return r;
	}

	static long number(String digits) {
		try {
			String d = digits.replaceAll("[^\\d]", "");
			return d.isEmpty() ? -1 : Long.parseLong(d);
		} catch (NumberFormatException e) {
			return -1;
		}
	}
}
