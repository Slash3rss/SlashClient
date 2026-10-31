// SkyUp's week is for SkyUp, played on 26.3: the module is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.modules.HudModule;
import dev.slash3rss.slashclient.hud.modules.Modules;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.chat.ChatTabs;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * SkyUp's plan of the week (skyup.pl/wiki/plan-tygodnia): when its events, fishing contests and boss arena are. The
 * module lists the next few with how long until each, and a few minutes before one starts a banner (SkyReminder)
 * says so, for the kinds the player wants. The plan is read from the wiki through the launcher once a game, as it
 * changes with SkyUp's editions, and kept for the next time; the plan below is for a launcher without the wiki.
 * The wiki gives only when things start: when they end the chat says (a fishing contest's "zakończyły się!", the
 * last of the three events' "został zakończony!"), and without it each kind is taken to last as long as it usually does.
 */
public final class SkyPlan {
	private SkyPlan() {}

	/** SkyUp's own time: its plan is in Polish hours. */
	static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");
	/** The longest anything is shown as going on when the chat said it started and never that it ended (left SkyUp). */
	private static final Duration LONGEST = Duration.ofHours(1);

	/** One thing on the plan: the day, the hour, and its name as the wiki has it ("Zawody wędkarskie"). */
	public record Slot(DayOfWeek day, LocalTime at, String name) {}

	/** A slot's next time: when it starts, from a moment. */
	record Next(Slot slot, ZonedDateTime at) {}

	/** What a name is, for its colour, its item and whether it is wanted. */
	enum Kind {
		EVENTS(SkyReminder.Look.EVENTS), FISHING(SkyReminder.Look.FISHING), BOSS(SkyReminder.Look.BOSS);

		final SkyReminder.Look look;

		Kind(SkyReminder.Look look) {
			this.look = look;
		}

		/**
		 * How long it goes on when the chat has said nothing (as SkyUp's chat had them in October 2026): a fishing
		 * contest 10 minutes, the three events one after another some 15; the boss arena's chat is not known yet.
		 */
		Duration usual() {
			return Duration.ofMinutes(this == EVENTS ? 15 : 10);
		}

		static Kind of(String name) {
			String n = name.toLowerCase(Locale.ROOT);
			if (n.contains("boss")) return BOSS;
			if (n.contains("wędk") || n.contains("ryb")) return FISHING;
			return EVENTS;
		}

		/** Whether the player wants a reminder of this kind (each its own switch in the module's settings). */
		boolean reminded(HudConfig c) {
			return switch (this) {
				case EVENTS -> c.skyPlanEvents;
				case FISHING -> c.skyPlanFishing;
				case BOSS -> c.skyPlanBoss;
			};
		}

		ItemStack icon() {
			return switch (this) {
				case EVENTS -> new ItemStack(Items.FIREWORK_ROCKET);
				// SkyUp's own rod, Karpiołap (a plain rod without its pack)
				case FISHING -> SkyAtlasScreen.KARPIOLAP.copy();
				case BOSS -> new ItemStack(Items.WITHER_SKELETON_SKULL);
			};
		}
	}

	/** The plan as the wiki had it in October 2026 (edition XXXII), until the wiki is read. */
	private static final List<Slot> BUILT_IN = List.of(
		slot(1, "19:00", "Eventy"), slot(1, "21:00", "Zawody wędkarskie"),
		slot(2, "18:00", "Zawody wędkarskie"), slot(2, "20:00", "Eventy"),
		slot(3, "19:00", "Zawody wędkarskie"), slot(3, "20:00", "Boss arena"), slot(3, "21:00", "Eventy"),
		slot(4, "18:00", "Eventy"), slot(4, "20:00", "Zawody wędkarskie"),
		slot(5, "19:00", "Eventy"), slot(5, "21:00", "Zawody wędkarskie"),
		slot(6, "12:00", "Zawody wędkarskie"), slot(6, "14:00", "Eventy"), slot(6, "17:00", "Zawody wędkarskie"), slot(6, "19:00", "Eventy"), slot(6, "21:00", "Boss arena"),
		slot(7, "12:00", "Eventy"), slot(7, "14:00", "Zawody wędkarskie"), slot(7, "17:00", "Eventy"), slot(7, "19:00", "Boss arena"), slot(7, "21:00", "Zawody wędkarskie"));

	private static Slot slot(int day, String at, String name) {
		return new Slot(DayOfWeek.of(day), LocalTime.parse(at), name);
	}

	static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("plan-tygodnia.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	/** As saved: the slots as "1 19:00 Eventy" (day of the week from Monday, hour, name). */
	private static final class Data {
		List<String> slots = new ArrayList<>();
	}

	private static List<Slot> plan;
	/** The wiki was asked this game (once is enough: the plan changes with editions). */
	private static boolean asked;
	/** Slots already brought up, by their start ("2026-10-28T19:00 Eventy"), so each is said once. */
	private static final Set<String> reminded = new HashSet<>();

	public static List<Slot> plan() {
		if (plan == null) {
			try {
				if (Files.exists(FILE)) plan = fromSaved(GSON.fromJson(Files.readString(FILE), Data.class));
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp plan of the week: {}", e.toString());
			}
			if (plan == null || plan.isEmpty()) plan = BUILT_IN;
		}
		return plan;
	}

	private static List<Slot> fromSaved(Data d) {
		List<Slot> out = new ArrayList<>();
		if (d == null || d.slots == null) return out;
		for (String s : d.slots) {
			String[] p = s.split(" ", 3);
			if (p.length == 3) out.add(slot(Integer.parseInt(p[0]), p[1], p[2]));
		}
		return out;
	}

	private static void save(List<Slot> slots) {
		Data d = new Data();
		for (Slot s : slots) d.slots.add(s.day().getValue() + " " + s.at() + " " + s.name());
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(d));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: SkyUp plan of the week: {}", e.toString());
		}
	}

	/** Joining SkyUp: the plan read from the wiki, once a game. */
	public static void joined(Minecraft mc) {
		if (asked || !SkyTasks.onSkyUp(mc) || !SkyWiki.bridgedNow()) return;
		asked = true;
		SkyWiki.read("plan-tygodnia", a -> {
			if (a.value() == null) return;
			List<Slot> read = parse(a.value().blocks());
			if (read.isEmpty()) return;
			plan = read;
			save(read);
		});
	}

	private static final Map<String, DayOfWeek> DAYS = Map.of("poniedziałek", DayOfWeek.MONDAY, "wtorek", DayOfWeek.TUESDAY, "środa", DayOfWeek.WEDNESDAY,
		"czwartek", DayOfWeek.THURSDAY, "piątek", DayOfWeek.FRIDAY, "sobota", DayOfWeek.SATURDAY, "niedziela", DayOfWeek.SUNDAY);

	/**
	 * The plan from the wiki article's blocks: its table has the days across the top ("Godzina", "Poniedziałek", …) and
	 * an hour down the side ("19:00"), each cell what is then ("Boss arena*": the star points at a note under it).
	 */
	static List<Slot> parse(JsonArray blocks) {
		List<Slot> out = new ArrayList<>();
		for (JsonElement b : blocks) {
			JsonObject o = b.getAsJsonObject();
			if (!"table".equals(str(o, "k"))) continue;
			DayOfWeek[] columns = null;
			for (JsonElement r : o.getAsJsonArray("rows")) {
				List<String> cells = new ArrayList<>();
				for (JsonElement c : r.getAsJsonArray()) {
					String text = cellText(c.getAsJsonObject());
					int span = c.getAsJsonObject().has("cols") ? c.getAsJsonObject().get("cols").getAsInt() : 1;
					for (int i = 0; i < Math.max(1, span); i++) cells.add(text);
				}
				if (columns == null) {
					// the row of the days
					DayOfWeek[] days = new DayOfWeek[cells.size()];
					boolean any = false;
					for (int i = 0; i < cells.size(); i++) any |= (days[i] = DAYS.get(cells.get(i).toLowerCase(Locale.ROOT))) != null;
					if (any) columns = days;
					continue;
				}
				if (cells.isEmpty() || !cells.get(0).matches("\\d{1,2}:\\d{2}")) continue;
				LocalTime at = LocalTime.parse(cells.get(0).length() == 4 ? "0" + cells.get(0) : cells.get(0));
				for (int i = 1; i < cells.size() && i < columns.length; i++) {
					String name = cells.get(i).replace("*", "").trim();
					if (columns[i] != null && !name.isEmpty()) out.add(new Slot(columns[i], at, name));
				}
			}
			if (!out.isEmpty()) return out;
		}
		return out;
	}

	private static String cellText(JsonObject cell) {
		StringBuilder s = new StringBuilder();
		if (cell.has("spans")) for (JsonElement span : cell.getAsJsonArray("spans")) s.append(str(span.getAsJsonObject(), "t"));
		return s.toString().replace(' ', ' ').trim();
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : "";
	}

	/** The coming slots from a moment, soonest first: one going on counts as coming. */
	static List<Next> coming(ZonedDateTime now, int count) {
		List<Next> all = new ArrayList<>();
		for (Slot s : plan()) {
			ZonedDateTime at = now.with(java.time.temporal.TemporalAdjusters.nextOrSame(s.day())).with(s.at()).withSecond(0).withNano(0);
			// this week's has passed (and is no longer going on): next week's
			if (over(Kind.of(s.name()), at, now)) at = at.plusWeeks(1);
			all.add(new Next(s, at));
		}
		all.sort(java.util.Comparator.comparing(Next::at));
		return all.subList(0, Math.min(count, all.size()));
	}

	/** Whether a slot starting then is over: as the chat said, or (heard nothing of it) after its usual length. */
	private static boolean over(Kind kind, ZonedDateTime at, ZonedDateTime now) {
		if (now.isBefore(at)) return false;
		Heard h = heard.get(kind);
		if (h != null && h.of(at)) return h.ended != null && !h.ended.isAfter(now) || !now.isBefore(at.plus(LONGEST));
		return !now.isBefore(at.plus(kind.usual()));
	}

	// ---------- what the chat says ----------

	/** When SkyUp's chat said one of a kind started and ended (null: not said). */
	private static final class Heard {
		ZonedDateTime started, ended;

		/** Whether this is about the slot starting then (the chat is a few seconds off the plan's hour, or more). */
		boolean of(ZonedDateTime at) {
			ZonedDateTime said = started != null ? started : ended;
			return !said.isBefore(at.minusMinutes(10)) && said.isBefore(at.plus(LONGEST));
		}
	}

	private static final Map<Kind, Heard> heard = new java.util.EnumMap<>(Kind.class);
	/** The events Fortuna picked for this round ("Labirynt", "Parkour miłosny", …), the one going on and how many are done. */
	private static List<String> picked = List.of();
	private static String event;
	private static int eventsDone;
	/** An event ended without the next said: when no other is announced by then, the round is over. */
	private static ZonedDateTime roundEnds;

	private static final java.util.regex.Pattern PICKED = java.util.regex.Pattern.compile("^Event » Eventy rozpoczną się za .*Fortuna wybrała (.+)!$");
	private static final java.util.regex.Pattern EVENT_STARTED = java.util.regex.Pattern.compile("^Event » (.+) rozpoczął się!$");
	private static final java.util.regex.Pattern EVENT_ENDED = java.util.regex.Pattern.compile("^Event » (.+) został zakończony!$");

	/** A line of the chat (ChatComponentMixin): SkyUp's fishing contests and events starting and ending. */
	public static void onChat(Component message) {
		if (SlashHud.config == null || !SkyTasks.onSkyUp(Minecraft.getInstance())) return;
		heard(message.getString(), ZonedDateTime.now(ZONE));
	}

	static void heard(String line, ZonedDateTime now) {
		line = line.replaceAll("§.", "").replaceAll("\\s+", " ").trim();
		if (line.startsWith("Wędkarstwo » Zawody wędkarskie")) {
			if (line.endsWith("wystartowały!")) started(Kind.FISHING, now);
			else if (line.contains("zakończyły się!")) ended(Kind.FISHING, now);
			return;
		}
		if (!line.startsWith("Event »")) return;
		var m = PICKED.matcher(line);
		if (m.matches()) {
			picked = List.of(m.group(1).split(", "));
			eventsDone = 0;
			event = null;
		} else if ((m = EVENT_STARTED.matcher(line)).matches()) {
			Heard h = heard.get(Kind.EVENTS);
			// the first of the round (the others go on in it)
			if (h == null || h.ended != null || h.started == null || !now.isBefore(h.started.plus(LONGEST))) started(Kind.EVENTS, now);
			event = m.group(1);
			roundEnds = null;
		} else if (line.contains(" rozpocznie się za ")) {
			// the next one announced: the round goes on
			roundEnds = null;
		} else if (EVENT_ENDED.matcher(line).matches()) {
			event = null;
			eventsDone++;
			// the last of those picked; not knowing which were, only when nothing else is said in a moment
			if (!picked.isEmpty() && eventsDone >= picked.size()) ended(Kind.EVENTS, now);
			else roundEnds = now.plusSeconds(15);
		}
	}

	private static void started(Kind kind, ZonedDateTime now) {
		Heard h = new Heard();
		h.started = now;
		heard.put(kind, h);
	}

	private static void ended(Kind kind, ZonedDateTime now) {
		Heard h = heard.get(kind);
		if (h == null || h.ended != null) heard.put(kind, h = new Heard());
		h.ended = now;
		if (kind == Kind.EVENTS) {
			picked = List.of();
			event = null;
			roundEnds = null;
		}
	}

	/** The round's end once nothing more was announced. */
	private static void tickChat(ZonedDateTime now) {
		if (roundEnds != null && !now.isBefore(roundEnds)) ended(Kind.EVENTS, now);
	}

	/** What a row says: its name, or the event going on now ("Labirynt") while the events are. */
	static Component label(Next n, ZonedDateTime now) {
		if (event != null && !n.at().isAfter(now) && Kind.of(n.slot().name()) == Kind.EVENTS) return Component.literal(event);
		return Component.literal(SkyLang.tr(n.slot().name()));
	}

	/** When a row is: as when(), and while the events go on which of them it is ("trwa 2/3"). */
	static Component whenOf(Next n, ZonedDateTime now) {
		if (event != null && !picked.isEmpty() && !n.at().isAfter(now) && Kind.of(n.slot().name()) == Kind.EVENTS)
			return Component.translatable("slashclient-hud.skyPlan.nowOf", eventsDone + 1, picked.size());
		return when(now, n.at());
	}

	// ---------- the reminder ----------

	public static void tick(Minecraft mc) {
		tickChat(ZonedDateTime.now(ZONE));
		HudConfig c = SlashHud.config;
		if (c == null || c.skyPlanRemind <= 0 || !c.placement("skyplan").enabled || !SkyTasks.onSkyUp(mc) || SkyTasks.testWorld) return;
		remind(mc, ZonedDateTime.now(ZONE));
	}

	/** The banner for a slot starting within the set minutes, of a kind the player wants; null when none is due. */
	static Next remind(Minecraft mc, ZonedDateTime now) {
		HudConfig c = SlashHud.config;
		for (Next n : coming(now, 3)) {
			long minutes = Duration.between(now, n.at()).toMinutes();
			if (minutes < 0 || minutes >= c.skyPlanRemind) continue;
			Kind kind = Kind.of(n.slot().name());
			if (!kind.reminded(c) || !reminded.add(n.at().toLocalDateTime() + " " + n.slot().name())) continue;
			SkyReminder.show(kind.look, SkyLang.tr(n.slot().name()),
				Component.translatable("slashclient-hud.skyPlan.starts", Math.max(1, minutes + 1), hour(n.at())).getString(), kind.icon());
			mc.execute(() -> ChatTabs.playSound(mc, sound()));
			return n;
		}
		return null;
	}

	/** The reminder's sound as ChatTabs plays them ("" the bell). */
	static String sound() {
		String s = SlashHud.config.skyPlanSound;
		return s == null || s.equals("default") ? "" : s;
	}

	private static String hour(ZonedDateTime at) {
		return String.format(Locale.ROOT, "%d:%02d", at.getHour(), at.getMinute());
	}

	/**
	 * When, said short: "trwa", "za 45 min", "za 2 h 10 min" today (or the hour, or both, as the player set it);
	 * "jutro 19:00", "pt 19:00" later.
	 */
	static Component when(ZonedDateTime now, ZonedDateTime at) {
		if (!at.isAfter(now)) return Component.translatable("slashclient-hud.skyPlan.now");
		long minutes = Duration.between(now, at).toMinutes() + 1;
		if (at.toLocalDate().equals(now.toLocalDate()) || minutes < 60) {
			String in = minutes < 60 ? minutes + " min" : (minutes / 60) + " h " + (minutes % 60) + " min";
			return switch (SlashHud.config.skyPlanTime) {
				case "clock" -> Component.literal(hour(at));
				case "relative" -> Component.translatable("slashclient-hud.skyPlan.in", in);
				default -> Component.translatable("slashclient-hud.skyPlan.inAt", in, hour(at));
			};
		}
		if (at.toLocalDate().equals(now.toLocalDate().plusDays(1))) return Component.translatable("slashclient-hud.skyPlan.tomorrow", hour(at));
		return Component.translatable("slashclient-hud.skyPlan.day." + at.getDayOfWeek().getValue()).append(" " + hour(at));
	}

	// ---------- the module ----------

	public static final class Module implements HudModule {
		public String id() {
			return "skyplan";
		}

		@Override
		public boolean textColored() {
			return false;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return SkyTasks.onSkyUp(mc);
		}

		private static int rows() {
			return Math.max(1, Math.min(8, SlashHud.config.skyPlanRows));
		}

		public int width(Minecraft mc) {
			ZonedDateTime now = ZonedDateTime.now(ZONE);
			int w = mc.font.width(Component.translatable("slashclient-hud.skyPlan.title"));
			for (Next n : coming(now, rows())) w = Math.max(w, mc.font.width(label(n, now)) + 8 + mc.font.width(whenOf(n, now)));
			return Math.max(110, w) + Modules.PAD * 2;
		}

		public int height(Minecraft mc) {
			return 10 + rows() * 10 + Modules.PAD * 2 - 1;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			ZonedDateTime now = ZonedDateTime.now(ZONE);
			int w = width(mc) - Modules.PAD * 2, left = x + Modules.PAD, top = y + Modules.PAD;
			Modules.text(g, mc, Component.translatable("slashclient-hud.skyPlan.title"), left, top, 0xFFFACC15);
			int row = top + 10;
			for (Next n : coming(now, rows())) {
				Kind kind = Kind.of(n.slot().name());
				Modules.text(g, mc, label(n, now), left, row, kind.look.light);
				Component when = whenOf(n, now);
				boolean going = !n.at().isAfter(now);
				Modules.text(g, mc, when, left + w - mc.font.width(when), row, going ? 0xFF4ADE80 : 0xFFE5E7EB);
				row += 10;
			}
		}
	}

	// ---------- for the in-game tests ----------

	/** The built-in plan back, nothing reminded, the wiki not asked yet. */
	static void resetForTest() {
		plan = BUILT_IN;
		reminded.clear();
		asked = false;
		heard.clear();
		picked = List.of();
		event = null;
		eventsDone = 0;
		roundEnds = null;
	}

	/**
	 * For the test, on Wednesday 28 October 2026 at 18:56: a wiki table read, the built-in plan's next three and how
	 * long until the first, then the reminders with the fishing contests switched off and on (and once more: said once).
	 */
	public static String checkForTest() {
		JsonArray blocks = com.google.gson.JsonParser.parseString("""
			[{"k":"h","text":"Plan tygodnia"},{"k":"table","rows":[
			 [{"spans":[{"t":"Godzina"}]},{"spans":[{"t":"Poniedziałek"}]},{"spans":[{"t":"Wtorek"}]}],
			 [{"spans":[{"t":"19:00"}]},{"spans":[{"t":"Eventy"}]},{"spans":[]}],
			 [{"spans":[{"t":"21:00"}]},{"spans":[]},{"spans":[{"t":"Boss arena*"}]}]]}]""").getAsJsonArray();
		StringBuilder out = new StringBuilder();
		for (Slot s : parse(blocks)) out.append(s.day()).append(' ').append(s.at()).append(' ').append(s.name()).append(';');
		resetForTest();
		Minecraft mc = Minecraft.getInstance();
		ZonedDateTime now = ZonedDateTime.of(2026, 10, 28, 18, 56, 0, 0, ZONE);
		List<Next> next = coming(now, 3);
		out.append('|');
		for (Next n : next) out.append(n.at().getDayOfWeek()).append(' ').append(hour(n.at())).append(' ').append(n.slot().name()).append(';');
		HudConfig c = SlashHud.config;
		String time = c.skyPlanTime;
		c.skyPlanTime = "relative";
		out.append('|').append(when(now, next.get(0).at()).getString()).append(',').append(when(now, next.get(1).at()).getString());
		out.append(',').append(when(now.plusDays(1), next.get(0).at().plusWeeks(1)).getString());
		// the hour instead, and both
		for (String t : List.of("clock", "both")) {
			c.skyPlanTime = t;
			out.append(',').append(when(now, next.get(1).at()).getString());
		}
		c.skyPlanTime = time;
		boolean fishing = c.skyPlanFishing;
		int remind = c.skyPlanRemind;
		c.skyPlanRemind = 5;
		c.skyPlanFishing = false;
		Next off = remind(mc, now);
		c.skyPlanFishing = true;
		Next on = remind(mc, now);
		Next again = remind(mc, now);
		c.skyPlanFishing = fishing;
		c.skyPlanRemind = remind;
		out.append('|').append(off == null ? "-" : off.slot().name()).append(',').append(on == null ? "-" : on.slot().name()).append(',').append(again == null ? "-" : again.slot().name());
		out.append('|').append(liveForTest());
		return out.toString();
	}

	/**
	 * The chat on the same Wednesday, as SkyUp says it: the fishing contest at 19:00 over at 19:06 (not 19:10), the
	 * three events at 21:00 going on past their usual 15 minutes with the one going on shown, over with the last;
	 * Thursday's events not knowing which were picked, over a moment after one ends with no next announced.
	 * Each moment as "<hour> <first row's name>=<when>;".
	 */
	private static String liveForTest() {
		StringBuilder out = new StringBuilder();
		String time = SlashHud.config.skyPlanTime;
		SlashHud.config.skyPlanTime = "both";
		java.util.function.Consumer<ZonedDateTime> row = at -> {
			tickChat(at);
			Next n = coming(at, 1).get(0);
			out.append(hour(at)).append(' ').append(label(n, at).getString()).append('=').append(whenOf(n, at).getString()).append(';');
		};
		ZonedDateTime day = ZonedDateTime.of(2026, 10, 28, 0, 0, 0, 0, ZONE);
		row.accept(day.withHour(19).withMinute(5));
		heard("Wędkarstwo » Zawody wędkarskie o największą rybę zakończyły się! Zwyciężył Kaseczek Mamuci Jesiotr 69932.63g", day.withHour(19).withMinute(6));
		row.accept(day.withHour(19).withMinute(7));
		heard("§6Event §8» §eEventy rozpoczną się za 10 minut! Fortuna wybrała Labirynt, Parkour miłosny, Strzelec na boisku!", day.withHour(20).withMinute(50));
		heard("Event » Labirynt rozpoczął się!", day.withHour(21));
		row.accept(day.withHour(21).withMinute(1));
		heard("Event » Labirynt został zakończony!", day.withHour(21).withMinute(2));
		heard("Event » Parkour miłosny rozpocznie się za 1 min! Wpisz /event, by dołączyć!", day.withHour(21).withMinute(2).withSecond(2));
		heard("Event » Parkour miłosny rozpoczął się!", day.withHour(21).withMinute(3));
		row.accept(day.withHour(21).withMinute(20));
		heard("Event » Parkour miłosny został zakończony!", day.withHour(21).withMinute(21));
		heard("Event » Strzelec na boisku rozpoczął się!", day.withHour(21).withMinute(22));
		heard("Event » Strzelec na boisku został zakończony!", day.withHour(21).withMinute(25));
		row.accept(day.withHour(21).withMinute(26));
		ZonedDateTime thu = day.plusDays(1);
		heard("Event » Kopacz w jaskini rozpoczął się!", thu.withHour(18));
		heard("Event » Kopacz w jaskini został zakończony!", thu.withHour(18).withMinute(3));
		row.accept(thu.withHour(18).withMinute(3).withSecond(5));
		row.accept(thu.withHour(18).withMinute(3).withSecond(20));
		SlashHud.config.skyPlanTime = time;
		resetForTest();
		return out.toString();
	}
}
//#endif
