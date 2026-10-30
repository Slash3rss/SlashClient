// SkyUp's cases are played on 26.3: the case counter is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastManager;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.HudModule;
import dev.slash3rss.slashclient.hud.Modules;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * SkyUp's cases ("SkyCase") counted: what each kind of case gave, this session (since joining the
 * server) and for good (saved), next to every reward it can give, also those never won.
 *
 * A win comes from SkyUp's chat line "SkyCase » Wygrano: 5x Zaklęta butelka!" (sent as "&6&lSkyCase
 * &8&l» &e&aWygrano: &e<reward>&a!"). Which case it was is not in it, and a key gem ("Klejnot
 * klucznika") opens many keys with no window at all, so: the one case whose rewards hold that name;
 * when more do, the case looked at last (its preview, or a win only it gives) if it holds it, within
 * a minute or so; else "Nieprzypisane".
 *
 * What each case can give starts from the owner's GUI dumps (SkyCasePools) and is kept up to date by
 * the preview window ("Elementium SkyCase"): opened, it replaces the case's rewards with what it
 * shows. Rewards it no longer shows leave the pool, their wins stay. A preview with more pages
 * (Platinum) only replaces once each page was seen in one go; before that it only adds.
 */
public final class SkyCase {
	private SkyCase() {}

	/** One kind of case: how many were opened, each reward's wins, the last one, and what it can give. */
	static final class Stats {
		long opened;
		/** Each reward by its name ("5x Zaklęta butelka"): how many times it came out. */
		Map<String, Long> drops = new LinkedHashMap<>();
		String last = "";
		long lastAt;
		/** What the case can give, in its window's order: name → item id (for the icon). */
		Map<String, String> pool = new LinkedHashMap<>();
		/** When a preview window last changed the pool; 0 while it is the built-in one (updated with the mod). */
		long poolSeen;
		/** Each reward as the preview showed it (its model, coloured name, glint, head), kept also once it leaves the pool. */
		Map<String, JsonElement> looks = new LinkedHashMap<>();

		void won(String reward, long at) {
			opened++;
			drops.merge(reward, 1L, Long::sum);
			last = reward;
			lastAt = at;
		}

		Stats fixed() {
			if (drops == null) drops = new LinkedHashMap<>();
			if (pool == null) pool = new LinkedHashMap<>();
			if (looks == null) looks = new LinkedHashMap<>();
			if (last == null) last = "";
			return this;
		}
	}

	/** Every kind of case, by name ("Elementium"), and the one won from last (shown on the HUD). */
	public static final class Data {
		Map<String, Stats> cases = new LinkedHashMap<>();
		String lastType = "";
		/** Log lines already added by hand (with their time), so pasting the same part twice adds nothing. */
		List<String> imported = new ArrayList<>();

		Stats of(String type) {
			return cases.computeIfAbsent(type, k -> new Stats()).fixed();
		}

		Stats get(String type) {
			Stats s = cases.get(type);
			return s == null ? new Stats() : s.fixed();
		}

		long opened() {
			long n = 0;
			for (Stats s : cases.values()) n += s.opened;
			return n;
		}
	}

	/** A win seen this session: when, from which case, what. */
	record Drop(String type, String reward, long at) {}

	/** Wins no case could be told for (shown as "Nieprzypisane"). */
	public static final String UNASSIGNED = "?";

	static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("skrzynie.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Data lifetime;
	static Data session = new Data();
	/** This session's wins, the newest last (the HUD's "recent" list). */
	static final List<Drop> recent = new ArrayList<>();

	static Data lifetime() {
		if (lifetime == null) {
			try {
				if (Files.exists(FILE)) lifetime = GSON.fromJson(Files.readString(FILE), Data.class);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp cases: {}", e.toString());
			}
			if (lifetime == null) lifetime = new Data();
			if (lifetime.cases == null) lifetime.cases = new LinkedHashMap<>();
			if (lifetime.lastType == null) lifetime.lastType = "";
			for (Stats s : lifetime.cases.values()) {
				s.fixed();
				unstack(s);
			}
			seed(lifetime);
		}
		return lifetime;
	}

	/**
	 * Wins read from lines with the chat's "×2" before it was known (":: Cassis ::! ×2" became
	 * "2x :: Cassis ::!"): each was one win of the reward itself, so it goes back there. A real reward
	 * never ends with "!" (the lines' "!" is never part of it).
	 */
	static void unstack(Stats s) {
		for (String wrong : List.copyOf(s.drops.keySet())) {
			if (!wrong.endsWith("!")) continue;
			Matcher m = COUNT_BEFORE.matcher(wrong);
			String right = canonical((m.matches() ? m.group(2) : wrong).replaceAll("!+$", ""));
			if (right.isEmpty()) continue;
			s.drops.merge(right, s.drops.remove(wrong), Long::sum);
			if (wrong.equals(s.last)) s.last = right;
		}
	}

	/** The built-in pools for the cases no preview window has shown yet (all of them, the first time). */
	private static void seed(Data data) {
		for (var e : SkyCasePools.all().entrySet()) {
			// named as caseType names the windows (without the resource pack's characters before)
			Stats s = data.of(plain(e.getKey()));
			if (s.poolSeen > 0) continue;
			s.pool = new LinkedHashMap<>();
			for (var r : e.getValue().entrySet()) s.pool.putIfAbsent(canonical(r.getKey()), r.getValue());
		}
	}

	static void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(lifetime()));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: SkyUp cases: {}", e.toString());
		}
	}

	/** A new server: a new session. */
	public static void joined() {
		session = new Data();
		recent.clear();
		contextType = null;
		browse = null;
	}

	// ---------- names ----------

	/** Colour codes with § or & (also "&#rrggbb" and "§x§r§r…"), as the server may send them in the text itself. */
	private static final Pattern CODES = Pattern.compile("(?i)[§&]x(?:[§&][0-9a-f]){6}|[§&]#[0-9a-f]{6}|[§&][0-9a-fk-or]");
	private static final Pattern WIN = Pattern.compile("(?i)SkyCase\\s*(?:»|>>)\\s*Wygrano\\s*:\\s*(.+?)\\s*!*\\s*$");
	/** SkyUp's newer line, said for everyone's wins: "SkyCase » Guardes otworzył Elementium i wygrał: :: Perun ::!" (player, case, reward). */
	private static final Pattern OPENED = Pattern.compile("(?i)SkyCase\\s*(?:»|>>)\\s*(\\S+)\\s+otworzył\\s+(.+?)\\s+i\\s+wygrał\\s*:\\s*(.+?)\\s*!*\\s*$");
	/** ":: Karambit ::", "♦ Klejnot klucznika ♦": the name inside. */
	private static final Pattern DECORATED = Pattern.compile("^(?::{2,}|♦+)\\s*(.+?)\\s*(?::{2,}|♦+)$");
	private static final Pattern COUNT_BEFORE = Pattern.compile("(?i)^(\\d{1,5})\\s*[x×]\\s+(.+)$");
	private static final Pattern COUNT_AFTER = Pattern.compile("(?i)^(.+?)\\s+[x×]\\s*(\\d{1,5})$");
	/** The windows' own items: "» SkyCase «", "» Wyjdź «", "» Następna strona «". */
	private static final Pattern WINDOW_ITEM = Pattern.compile("^».*«$");

	/** The text without colour codes, the resource pack's private characters and doubled spaces. */
	public static String plain(String s) {
		if (s == null) return "";
		return CODES.matcher(s).replaceAll("").replaceAll("[\\uE000-\\uF8FF\\u200B-\\u200D\\uFEFF]", "").replace(' ', ' ').replaceAll("\\s+", " ").strip();
	}

	/**
	 * The chat's "×2" of a repeated line (ChatExtras.stack), after the line's "!": in the game's log too.
	 * It says the line came again, not how many: each such line is one win.
	 */
	private static final Pattern STACKED = Pattern.compile("(!+)\\s*×\\d+\\s*$");

	/** A win line as the server sent it: plain, without the chat's repeat mark. */
	static String winLine(String s) {
		return STACKED.matcher(plain(s)).replaceFirst("$1");
	}

	/** A name without its decoration: ":: Karambit ::" is "Karambit", "♦ Klejnot klucznika ♦" "Klejnot klucznika". */
	static String clean(String name) {
		String s = plain(name);
		Matcher m = DECORATED.matcher(s);
		return m.matches() ? m.group(1).strip() : s;
	}

	/**
	 * A reward as the pools keep it: clean, its count before it as the windows write it ("5x Zaklęta
	 * butelka"; one alone has none: "Diament"), whichever way the line wrote it ("Diament x5").
	 */
	static String canonical(String name) {
		String s = clean(name);
		Matcher m;
		int count;
		String item;
		if ((m = COUNT_BEFORE.matcher(s)).matches()) {
			count = Integer.parseInt(m.group(1));
			item = m.group(2).strip();
		} else if ((m = COUNT_AFTER.matcher(s)).matches()) {
			count = Integer.parseInt(m.group(2));
			item = m.group(1).strip();
		} else return s;
		item = clean(item);
		return count == 1 ? item : count + "x " + item;
	}

	/** Names compared without case, the ♦ and doubled spaces. */
	static String key(String name) {
		return canonical(name).replace("♦", "").replaceAll("\\s+", " ").strip().toLowerCase(Locale.ROOT);
	}

	/** "5x Zaklęta butelka" is 5 of "Zaklęta butelka"; "Diament" 1 of itself. */
	static String base(String reward) {
		Matcher m = COUNT_BEFORE.matcher(reward);
		return m.matches() ? m.group(2).strip() : reward;
	}

	static int amount(String reward) {
		Matcher m = COUNT_BEFORE.matcher(reward);
		return m.matches() ? Math.max(1, Integer.parseInt(m.group(1))) : 1;
	}

	/** SkyUp's win line: the reward ("5x Zaklęta butelka"), or null when the line is something else. */
	public static String parse(String line) {
		Matcher m = WIN.matcher(winLine(line));
		if (!m.find()) return null;
		String reward = canonical(m.group(1));
		return reward.isEmpty() ? null : reward;
	}

	/** "Elementium SkyCase" is "Elementium"; null for any other title (and "SkyCase" alone). */
	public static String caseType(String title) {
		String t = plain(title);
		if (!t.toLowerCase(Locale.ROOT).endsWith(" skycase")) return null;
		String type = t.substring(0, t.length() - " skycase".length()).replaceAll("[\\s»:|-]+$", "").strip();
		return type.isEmpty() ? null : type;
	}

	// ---------- a win ----------

	/** Every chat line: SkyUp's win counted. */
	public static void onChat(String line) {
		if (line == null || !(line.contains("Wygrano") || line.contains("wygrał")) || SlashHud.config == null) return;
		Minecraft mc = Minecraft.getInstance();
		if (!SkyTasks.onSkyUp(mc)) return;
		long now = System.currentTimeMillis();
		String[] opened = parseOpened(line);
		if (opened != null) {
			// everyone's wins are said: only the player's own count, and the line names the case
			if (mc.player == null || !opened[0].equalsIgnoreCase(mc.player.getGameProfile().name())) return;
			String named = caseNamed(opened[1]);
			if (!again(opened[2], true, now)) {
				lastChatType = won(named, opened[2], now);
				// "Otwórz SkyCase: Ręcznie" (SkyTasks)
				SkyCounters.caseOpened();
			} else if (lastChatType != null && !lastChatType.equals(named)) {
				// the "Wygrano" line came first and its case was guessed: this line names it, the win moves there
				move(lastChatType, named, opened[2], now);
			}
			lastChatType = null;
			return;
		}
		String reward = parse(line);
		if (reward != null && !again(reward, false, now)) {
			lastChatType = won(reward, now);
			SkyCounters.caseOpened();
		}
	}

	/**
	 * The last win counted from the chat and in which line, so one win said in both ("Wygrano" and
	 * "otworzył … i wygrał") counts once, while wins in a row said in one kind of line (a key gem
	 * opening many keys) all count.
	 */
	private static String lastChatWin;
	private static boolean lastChatWinOpened;
	private static long lastChatWinAt;
	/** The case the last "Wygrano" line's win was counted for (its pair's other line may name another). */
	private static String lastChatType;

	/** A win counted for the wrong case moved to the right one (all time, this session and the recent drops). */
	static void move(String from, String to, String reward, long now) {
		String k = key(reward);
		for (Data d : new Data[] { lifetime(), session }) {
			Stats a = d.of(from);
			String counted = null;
			for (var e : a.drops.entrySet()) if (key(e.getKey()).equals(k) && e.getValue() > 0) counted = e.getKey();
			if (counted == null) continue;
			if (a.drops.merge(counted, -1L, Long::sum) <= 0) a.drops.remove(counted);
			a.opened = Math.max(0, a.opened - 1);
			Stats b = d.of(to);
			String spelled = counted;
			for (String known : b.pool.keySet()) if (key(known).equals(k)) spelled = known;
			b.won(spelled, now);
			if (from.equals(d.lastType)) d.lastType = to;
		}
		// a case left with nothing (the unassigned one) is not listed
		if (UNASSIGNED.equals(from) && lifetime().get(from).opened == 0) lifetime().cases.remove(from);
		for (int i = recent.size() - 1; i >= 0; i--) {
			Drop d = recent.get(i);
			if (d.type().equals(from) && key(d.reward()).equals(k)) {
				recent.set(i, new Drop(to, d.reward(), d.at()));
				break;
			}
		}
		save();
	}

	private static boolean again(String reward, boolean opened, long now) {
		String k = key(reward);
		boolean same = k.equals(lastChatWin) && opened != lastChatWinOpened && now - lastChatWinAt < 3000;
		// the pair's second line: the next same win is a win of its own again
		lastChatWin = same ? null : k;
		lastChatWinOpened = opened;
		lastChatWinAt = now;
		return same;
	}

	/** The game log's start of a chat line: "[14:08:00] [Render thread/INFO]: [System] [CHAT] ". */
	private static final Pattern LOG_PREFIX = Pattern.compile("^\\s*(?:\\[[^\\]]*\\]\\s*)+?:?\\s*(?:\\[System\\]\\s*)?(?:\\[CHAT\\]\\s*)");

	/**
	 * Wins the counter missed, added by hand from a part of the game's log (logs/latest.log) pasted
	 * in: SkyUp's lines of both kinds, of the newer one only the player's own. A line added once is
	 * not added again. How many wins were added.
	 */
	public static int addFromLog(String text, String player) {
		Data life = lifetime();
		if (life.imported == null) life.imported = new ArrayList<>();
		long now = System.currentTimeMillis();
		int added = 0;
		for (String raw : text.split("\\r?\\n")) {
			String line = raw.strip();
			if (line.isEmpty() || life.imported.contains(line)) continue;
			String chat = LOG_PREFIX.matcher(line).replaceFirst("");
			String[] opened = parseOpened(chat);
			String type = null, reward = null;
			if (opened != null) {
				if (!opened[0].equalsIgnoreCase(player)) continue;
				type = caseNamed(opened[1]);
				reward = opened[2];
			} else reward = parse(chat);
			if (reward == null) continue;
			won(type, reward, now, false);
			life.imported.add(line);
			added++;
		}
		while (life.imported.size() > 5000) life.imported.remove(0);
		if (added > 0) save();
		return added;
	}

	/** The newer win line as {player, case, reward}, or null for any other line. */
	static String[] parseOpened(String line) {
		Matcher m = OPENED.matcher(winLine(line));
		if (!m.find()) return null;
		String reward = canonical(m.group(3));
		return reward.isEmpty() ? null : new String[] { m.group(1), m.group(2).strip(), reward };
	}

	/** The case the line names, written as this counter knows it ("elementium" is "Elementium"). */
	static String caseNamed(String name) {
		for (String known : lifetime().cases.keySet()) if (known.equalsIgnoreCase(name)) return known;
		return name;
	}

	/** A win counted for the case it came from. */
	static String won(String reward, long now) {
		return won(null, reward, now);
	}

	/** A win counted for `named` (the case the line names), or for the case it came from when the line does not say. */
	static String won(String named, String reward, long now) {
		return won(named, reward, now, true);
	}

	/** A win counted; one added from an old log (`live` false) goes to all time only, without the toast. */
	static String won(String named, String reward, long now, boolean live) {
		Data life = lifetime();
		String type = named != null ? named : attribute(reward, now);
		Stats stats = life.of(type);
		// the pool's own spelling, when the line writes it otherwise
		String k = key(reward);
		for (String known : stats.pool.keySet()) if (key(known).equals(k)) reward = known;
		boolean first = true;
		for (var e : stats.drops.entrySet()) if (key(e.getKey()).equals(k) && e.getValue() > 0) {
			reward = e.getKey();
			first = false;
		}
		stats.won(reward, now);
		if (!live) return type;
		session.of(type).won(reward, now);
		life.lastType = type;
		session.lastType = type;
		recent.add(new Drop(type, reward, now));
		if (recent.size() > 50) recent.remove(0);
		save();
		// its look as it lands in the inventory, when no preview has shown it (its model from the server's pack)
		received = new Drop(type, reward, now);
		if (UNASSIGNED.equals(type) && !unassignedSaid) {
			// a case the mod does not know yet (a new one on the server): its wins count to it once its preview is opened
			unassignedSaid = true;
			Minecraft mc = Minecraft.getInstance();
			if (mc.player != null) mc.player.sendSystemMessage(Component.translatable("slashclient-hud.skyCase.unassignedChat").withStyle(net.minecraft.ChatFormatting.YELLOW));
		}
		if (first && SlashHud.config.skyCaseNewDrop) {
			Minecraft mc = Minecraft.getInstance();
			// the reward as its case showed it: a head with its own skin, not the plain item (Steve's head)
			Compat.toasts(mc).addToast(new NewDropToast(type, reward, icon(life, new Drop(type, reward, System.currentTimeMillis()))));
		}
		return type;
	}

	/** Whether the chat has said this game why a win went to "Nieprzypisane" (once, not at every such win). */
	private static boolean unassignedSaid;

	/** The case looked at last (a preview or the draw, or a win only that case gives), and when. */
	private static String contextType;
	private static long contextAt;
	/** Whether that was a window (its title names the case), not a guess from a win. */
	private static boolean contextFromWindow;
	/** How long after its draw window a win surely is that case's (the line comes as the draw ends). */
	private static final long DRAW_MS = 5_000;

	/** The case a reward came from: the one holding it, else the one looked at last if it holds it, else none. */
	static String attribute(String reward, long now) {
		String k = key(reward);
		// the draw's window (its title names the case) open just now: that case's, even when it is new and
		// another case gives the same reward
		if (contextType != null && contextFromWindow && now - contextAt <= DRAW_MS) {
			Stats seen = lifetime().get(contextType);
			boolean holds = seen.pool.isEmpty();
			for (String known : seen.pool.keySet()) if (key(known).equals(k)) holds = true;
			if (holds) return contextType;
		}
		List<String> holding = new ArrayList<>();
		for (var e : lifetime().cases.entrySet()) {
			if (UNASSIGNED.equals(e.getKey())) continue;
			for (String known : e.getValue().pool.keySet()) {
				if (key(known).equals(k)) {
					holding.add(e.getKey());
					break;
				}
			}
		}
		if (holding.size() == 1) {
			// a run of keys of one case: the wins more cases give are this one's too
			contextType = holding.get(0);
			contextAt = now;
			contextFromWindow = false;
			return holding.get(0);
		}
		boolean recent = contextType != null && now - contextAt <= SlashHud.config.skyCaseWindow * 1000L;
		if (holding.size() > 1 && recent && holding.contains(contextType)) return contextType;
		return UNASSIGNED;
	}

	// ---------- the preview window ----------

	/** Pages of one case's preview seen one after another: page by page, until the window is left a while. */
	private static final class Browse {
		final String type;
		final List<Map<String, String>> pages = new ArrayList<>();
		final List<Boolean> more = new ArrayList<>();
		int last = -1;
		long at;

		Browse(String type) {
			this.type = type;
		}
	}

	private static Browse browse;
	private static int tick;
	/** How long the pages of one look at the window may lie apart (the server opens each page as a new window). */
	private static final long BROWSE_MS = 10_000;

	public static void tick(Minecraft mc) {
		if (received != null) learnLook(mc);
		if (!SkyTasks.onSkyUp(mc) || !(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return;
		String type = caseType(screen.getTitle().getString());
		if (type == null) return;
		contextType = type;
		contextAt = System.currentTimeMillis();
		contextFromWindow = true;
		// what it holds: read a few times a second (the items come after the window)
		if (++tick % 5 == 0) readPreview(type, screen, contextAt);
	}

	/** The last win whose look is not known yet, while its item may still come into the inventory. */
	private static Drop received;
	/** How long after a win its item may take to come. */
	private static final long RECEIVED_MS = 10_000;

	/**
	 * The look of a win no preview showed, taken from the item that came into the inventory (its model,
	 * coloured name, head), so the toast, the HUD and the window show it as the player got it.
	 */
	static void learnLook(Minecraft mc) {
		Drop d = received;
		if (mc.player == null || System.currentTimeMillis() - d.at() > RECEIVED_MS) {
			received = null;
			return;
		}
		Stats stats = lifetime().of(d.type());
		String k = key(base(d.reward()));
		for (String known : stats.looks.keySet()) {
			if (key(known).equals(key(d.reward()))) {
				received = null;
				return;
			}
		}
		Inventory inv = mc.player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack stack = inv.getItem(i);
			if (stack.isEmpty() || !stack.has(DataComponents.CUSTOM_NAME) || !key(base(plain(stack.getHoverName().getString()))).equals(k)) continue;
			if (keepLooks(stats, Map.of(d.reward(), stack))) save();
			received = null;
			return;
		}
	}

	/** One page of a case's preview: its rewards, and whether pages come before and after it. */
	record Page(Map<String, String> rewards, boolean previous, boolean next, Map<String, ItemStack> stacks) {
		Page(Map<String, String> rewards, boolean previous, boolean next) {
			this(rewards, previous, next, Map.of());
		}
	}

	/** The page an open window shows, or null when it is no preview (the draw itself) or its items are not there yet. */
	static Page page(List<ItemStack> items) {
		Map<String, String> rewards = new LinkedHashMap<>();
		Map<String, ItemStack> stacks = new LinkedHashMap<>();
		boolean preview = false, previous = false, next = false;
		for (ItemStack stack : items) {
			if (stack.isEmpty()) continue;
			String name = plain(stack.getHoverName().getString());
			if (WINDOW_ITEM.matcher(name).matches()) {
				String lower = name.toLowerCase(Locale.ROOT);
				if (lower.contains("skycase")) preview = true;
				if (lower.contains("poprzednia")) previous = true;
				if (lower.contains("następna")) next = true;
				continue;
			}
			String id = itemId(stack);
			// glass and the like around the rewards: the game's own name
			if (name.isEmpty() || id.endsWith("glass_pane") && name.equals(plain(stack.getItem().getName(stack).getString()))) continue;
			if (rewards.putIfAbsent(canonical(name), id) == null) stacks.put(canonical(name), stack.copy());
		}
		// the preview has its "» SkyCase «" on top: the draw (the same title) is never read
		return preview && !rewards.isEmpty() ? new Page(rewards, previous, next, stacks) : null;
	}

	static void readPreview(String type, AbstractContainerScreen<?> screen, long now) {
		List<ItemStack> items = new ArrayList<>();
		for (Slot slot : screen.getMenu().slots) if (!(slot.container instanceof Inventory)) items.add(slot.getItem());
		Page page = page(items);
		if (page != null) seen(type, page, now);
	}

	/** A preview page seen: kept with the others of this look at the window, and the case's pool updated. */
	static void seen(String type, Page page, long now) {
		if (browse == null || !browse.type.equals(type) || now - browse.at > BROWSE_MS) browse = new Browse(type);
		Browse b = browse;
		b.at = now;
		int index;
		if (!page.previous()) index = 0;
		else {
			// a page seen before (back from the next one), or the one after the page seen last
			index = -1;
			for (int i = 0; i < b.pages.size(); i++) if (page.rewards().keySet().equals(b.pages.get(i) == null ? null : b.pages.get(i).keySet())) index = i;
			if (index < 0) index = Math.max(1, b.last + 1);
		}
		while (b.pages.size() <= index) {
			b.pages.add(null);
			b.more.add(true);
		}
		b.pages.set(index, page.rewards());
		b.more.set(index, page.next());
		b.last = index;
		update(b);
		if (keepLooks(lifetime().of(type), page.stacks())) save();
	}

	/** The rewards' looks a page showed kept (true when one changed). */
	private static boolean keepLooks(Stats stats, Map<String, ItemStack> stacks) {
		Minecraft mc = Minecraft.getInstance();
		if (stacks.isEmpty() || mc.level == null) return false;
		var ops = mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE);
		boolean changed = false;
		for (var e : stacks.entrySet()) {
			ItemStack one = e.getValue().copyWithCount(1);
			JsonElement json = ItemStack.CODEC.encodeStart(ops, one).result().orElse(null);
			if (json != null && !json.equals(stats.looks.get(e.getKey()))) {
				stats.looks.put(e.getKey(), json);
				changed = true;
			}
		}
		if (changed) LOOKS.clear();
		return changed;
	}

	/** Decoded looks by their JSON, and the built-in coloured names by key (from the owner's GUI dumps). */
	private static final Map<String, Optional<ItemStack>> LOOKS = new HashMap<>();
	private static Map<String, JsonElement> names, builtInLooks;

	/** Each reward's item, model number and head as the cases' previews showed them (from the owner's GUI dumps), by key. */
	private static Map<String, JsonElement> builtInLooks() {
		if (builtInLooks == null) {
			builtInLooks = new HashMap<>();
			try (InputStream in = SkyCase.class.getResourceAsStream("/assets/" + SlashHud.ID + "/skyup/skycase-looks.json")) {
				if (in != null) for (var e : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject().entrySet()) {
					// as an item's JSON: {"id", "components": {model, head}}
					var look = e.getValue().getAsJsonObject();
					var stack = new com.google.gson.JsonObject();
					stack.addProperty("id", look.get("item").getAsString());
					var components = new com.google.gson.JsonObject();
					if (look.has("model")) {
						var floats = new com.google.gson.JsonArray();
						floats.add(look.get("model"));
						var model = new com.google.gson.JsonObject();
						model.add("floats", floats);
						components.add("minecraft:custom_model_data", model);
					}
					if (look.has("profile")) components.add("minecraft:profile", look.get("profile"));
					if (look.has("model") || look.has("profile")) stack.add("components", components);
					builtInLooks.putIfAbsent(key(e.getKey()), stack);
				}
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp case looks: {}", e.toString());
			}
		}
		return builtInLooks;
	}

	private static Map<String, JsonElement> names() {
		if (names == null) {
			names = new HashMap<>();
			try (InputStream in = SkyCase.class.getResourceAsStream("/assets/" + SlashHud.ID + "/skyup/skycase-names.json")) {
				if (in != null) for (var e : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject().entrySet()) names.putIfAbsent(key(e.getKey()), e.getValue());
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp case names: {}", e.toString());
			}
		}
		return names;
	}

	/**
	 * A reward as its case's preview showed it (any case's, when its own never did): its model and
	 * coloured name; else as the built-in dumps had it (its item, model and coloured name); else its
	 * item; null out of a world.
	 */
	static ItemStack look(String type, String reward) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return null;
		String k = key(reward);
		JsonElement json = null;
		Data life = lifetime();
		Stats own = life.get(type);
		for (var e : own.looks.entrySet()) if (key(e.getKey()).equals(k)) json = e.getValue();
		if (json == null) for (Stats s : life.cases.values()) for (var e : s.looks.entrySet()) if (json == null && key(e.getKey()).equals(k)) json = e.getValue();
		if (json != null) {
			JsonElement j = json;
			ItemStack stack = LOOKS.computeIfAbsent(j.toString(), s -> ItemStack.CODEC.parse(mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE), j).result()).orElse(null);
			if (stack != null) return stack;
		}
		JsonElement builtIn = builtInLooks().get(k);
		if (builtIn != null) {
			ItemStack stack = LOOKS.computeIfAbsent("built-in|" + k, s -> ItemStack.CODEC.parse(mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE), builtIn).result().map(found -> {
				JsonElement name = names().get(k);
				if (name != null) ComponentSerialization.CODEC.parse(JsonOps.INSTANCE, name).result().ifPresent(c -> found.set(DataComponents.CUSTOM_NAME, c));
				return found;
			})).orElse(null);
			if (stack != null) return stack;
		}
		String id = own.pool.get(reward);
		if (id == null) id = itemOf(life, reward);
		Item item = item(id);
		if (item == null) return null;
		String cacheKey = id + "|" + k;
		return LOOKS.computeIfAbsent(cacheKey, s -> {
			ItemStack stack = new ItemStack(item);
			JsonElement name = names().get(k);
			if (name != null) ComponentSerialization.CODEC.parse(JsonOps.INSTANCE, name).result().ifPresent(c -> stack.set(DataComponents.CUSTOM_NAME, c));
			return Optional.of(stack);
		}).orElse(null);
	}

	/**
	 * A row's name as the game writes it, coloured: the reward's own, or for a summed item ("Zaklęta
	 * butelka" of "5x Zaklęta butelka") its text in the style of the item's part of the name.
	 */
	static Component styledName(ItemStack look, String row, boolean summed) {
		if (look == null || !look.has(DataComponents.CUSTOM_NAME)) return Component.literal(SkyLang.tr(row));
		Component name = look.getHoverName();
		// in another language: the name translated, in the colours of the server's
		if (!summed && SkyLang.polish()) return name;
		Style[] last = { Style.EMPTY };
		name.visit((style, text) -> {
			if (!text.isBlank() && !COUNT_ONLY.matcher(text).matches()) last[0] = style;
			return Optional.empty();
		}, Style.EMPTY);
		MutableComponent out = Component.literal(SkyLang.tr(row));
		return out.withStyle(last[0]);
	}

	/** "5x " alone, the count part of a coloured name. */
	private static final Pattern COUNT_ONLY = Pattern.compile("(?i)^\\s*\\d{1,5}\\s*[x×]\\s*$");

	/** Every page seen (the first to the one with no next): the pool is what they show; else they only add to it. */
	private static void update(Browse b) {
		boolean whole = !b.pages.isEmpty() && !b.more.get(b.pages.size() - 1);
		Map<String, String> shown = new LinkedHashMap<>();
		for (Map<String, String> p : b.pages) {
			if (p == null) whole = false;
			else for (var e : p.entrySet()) shown.putIfAbsent(e.getKey(), e.getValue());
		}
		Stats stats = lifetime().of(b.type);
		Map<String, String> pool;
		if (whole) pool = shown;
		else {
			pool = new LinkedHashMap<>(stats.pool);
			for (var e : shown.entrySet()) pool.put(e.getKey(), e.getValue());
		}
		if (pool.equals(stats.pool) && new ArrayList<>(pool.keySet()).equals(new ArrayList<>(stats.pool.keySet())) && stats.poolSeen > 0) return;
		stats.pool = pool;
		stats.poolSeen = System.currentTimeMillis();
		save();
	}

	static String itemId(ItemStack stack) {
		return BuiltInRegistries.ITEM.getKey(stack.getItem()).toString();
	}

	private static Map<String, Item> items;

	/** An item by its id ("minecraft:diamond_sword"), or null. */
	static Item item(String id) {
		if (id == null || id.isEmpty()) return null;
		if (items == null) {
			items = new HashMap<>();
			for (Item item : BuiltInRegistries.ITEM) items.put(BuiltInRegistries.ITEM.getKey(item).toString(), item);
		}
		return items.get(id);
	}

	// ---------- what is shown ----------

	/**
	 * One row of a case: a reward (or an item, grouped), its item for the icon, wins this session and
	 * all time, the items they were in this session and all time ("64x" counts 64), the share of the
	 * case's openings (0..1), whether the case no longer gives it, and a reward it stands for (its look).
	 */
	record Reward(String name, String item, long session, long lifetime, long sessionAmount, long amount, double share, boolean removed, String variant) {}

	/** Every case known: the built-in ones, those previewed and those won from ("?" last, when there are any). */
	static List<String> types() {
		List<String> out = new ArrayList<>();
		for (var e : lifetime().cases.entrySet()) if (!UNASSIGNED.equals(e.getKey())) out.add(e.getKey());
		if (lifetime().get(UNASSIGNED).opened > 0 || session.get(UNASSIGNED).opened > 0) out.add(UNASSIGNED);
		return out;
	}

	/** "Elementium SkyCase", or "Nieprzypisane". */
	static String title(String type) {
		return UNASSIGNED.equals(type) ? Component.translatable("slashclient-hud.skyCase.unassigned").getString() : type + " SkyCase";
	}

	/** The kind shown on the HUD: the one won from last, else the one opened most. */
	static String shownType() {
		Data life = lifetime();
		if (!life.lastType.isEmpty() && life.cases.containsKey(life.lastType)) return life.lastType;
		return life.cases.entrySet().stream().max(Comparator.comparingLong(e -> e.getValue().opened)).map(Map.Entry::getKey).orElse("");
	}

	/** Every reward of a case: those it gives (also never won), then those won it no longer gives. */
	static List<Reward> rewards(String type, boolean grouped) {
		return rewards(session, lifetime(), type, grouped);
	}

	static List<Reward> rewards(Data session, Data life, String type, boolean grouped) {
		Stats l = life.get(type), s = session.get(type);
		Map<String, String> names = new LinkedHashMap<>(l.pool);
		for (String n : l.drops.keySet()) names.putIfAbsent(n, itemOf(life, n));
		for (String n : s.drops.keySet()) names.putIfAbsent(n, itemOf(life, n));
		Map<String, Reward> out = new LinkedHashMap<>();
		for (var e : names.entrySet()) {
			String name = e.getKey();
			long ls = s.drops.getOrDefault(name, 0L), ll = l.drops.getOrDefault(name, 0L);
			boolean removed = !UNASSIGNED.equals(type) && !l.pool.containsKey(name);
			String row = grouped ? base(name) : name;
			Reward was = out.get(row);
			long sessionAmount = ls * amount(name), amount = ll * amount(name);
			if (was == null) out.put(row, new Reward(row, e.getValue(), ls, ll, sessionAmount, amount, 0, removed, name));
			else out.put(row, new Reward(row, was.item().isEmpty() ? e.getValue() : was.item(), was.session() + ls, was.lifetime() + ll,
				was.sessionAmount() + sessionAmount, was.amount() + amount, 0, was.removed() && removed, was.variant()));
		}
		List<Reward> list = new ArrayList<>();
		for (Reward r : out.values()) list.add(new Reward(r.name(), r.item(), r.session(), r.lifetime(), r.sessionAmount(), r.amount(), l.opened > 0 ? r.lifetime() / (double) l.opened : 0, r.removed(), r.variant()));
		// those it no longer gives at the end
		list.sort(Comparator.comparing(Reward::removed));
		return list;
	}

	/** The item a reward is shown with in any case's pool (one gone from its case's, or an unassigned one), or "". */
	private static String itemOf(Data life, String reward) {
		String k = key(reward);
		for (Stats s : life.cases.values()) for (var e : s.pool.entrySet()) if (key(e.getKey()).equals(k)) return e.getValue();
		return "";
	}

	static String percent(double share) {
		double p = share * 100;
		String s = p >= 10 || p == 0 ? String.format(Locale.ROOT, "%.0f%%", p) : String.format(Locale.ROOT, "%.1f%%", p);
		return s.replace('.', ',');
	}

	/** A case's wins forgotten, this session's and the saved ones (what it gives stays). */
	static void reset(String type) {
		session.cases.remove(type);
		recent.removeIf(d -> d.type().equals(type));
		Stats s = lifetime().cases.get(type);
		if (s != null) {
			if (UNASSIGNED.equals(type)) lifetime().cases.remove(type);
			else {
				Stats kept = new Stats();
				kept.pool = s.pool;
				kept.poolSeen = s.poolSeen;
				kept.looks = s.looks;
				lifetime().cases.put(type, kept);
			}
		}
		save();
	}

	/** A line of the module: text left and right, and the icons it shows (one before the text, or a row of them alone). */
	private record Row(String left, int leftColor, String right, int rightColor, List<ItemStack> icons) {
		Row(String left, int leftColor, String right, int rightColor) {
			this(left, leftColor, right, rightColor, List.of());
		}

		/** A row of icons and nothing else. */
		boolean strip() {
			return icons.size() > 1 || (!icons.isEmpty() && left.isEmpty());
		}
	}

	/** A win's icon: as its case's preview showed it, else its item, else a chest. */
	private static ItemStack icon(Data life, Drop d) {
		ItemStack look = look(d.type(), d.reward());
		if (look != null && !look.isEmpty()) return look;
		Item item = item(itemOf(life, d.reward()));
		return new ItemStack(item != null ? item : net.minecraft.world.item.Items.CHEST);
	}

	private static List<Row> rows(Data session, Data life, List<Drop> recent, String type) {
		HudConfig cfg = SlashHud.config;
		List<Row> out = new ArrayList<>();
		Stats l = life.get(type), s = session.get(type);
		out.add(new Row(title(type), 0xFFFFAA00, "", 0));
		out.add(new Row(Component.translatable("slashclient-hud.skyCase.opened").getString(), 0xFF9CA3AF, s.opened + " / " + l.opened, 0xFFFFFFFF));
		String layout = cfg.skyCaseLayout;
		if ("summary".equals(layout)) {
			if (!l.last.isEmpty()) out.add(new Row(Component.translatable("slashclient-hud.skyCase.last").getString(), 0xFF9CA3AF, SkyLang.tr(l.last), 0xFFFFFF55));
		} else if ("top".equals(layout)) {
			// the rewards won most, this session / all time and their share; summed, the items won most in pieces
			boolean sum = cfg.skyCaseSum;
			List<Reward> won = new ArrayList<>();
			for (Reward r : rewards(session, life, type, sum)) if (r.lifetime() > 0) won.add(r);
			won.sort(Comparator.comparingLong(sum ? Reward::amount : Reward::lifetime).reversed());
			for (int i = 0; i < Math.min(cfg.skyCaseRows, won.size()); i++) {
				Reward r = won.get(i);
				String right = sum ? r.sessionAmount() + " / " + r.amount() : r.session() + " / " + r.lifetime() + "  " + percent(r.share());
				out.add(new Row("  " + SkyLang.tr(r.name()), 0xFFE5E7EB, right, 0xFFFFFFFF));
			}
		} else {
			// the latest wins, newest first, with their case when it is another one: names, icons in a row, or both
			if (!recent.isEmpty()) out.add(new Row(Component.translatable("slashclient-hud.skyCase.recent").getString(), 0xFF9CA3AF, "", 0));
			String show = cfg.skyCaseRecentShow;
			List<ItemStack> strip = new ArrayList<>();
			for (int i = recent.size() - 1, n = 0; i >= 0 && n < cfg.skyCaseRows; i--, n++) {
				Drop d = recent.get(i);
				if ("icon".equals(show)) {
					strip.add(icon(life, d));
					continue;
				}
				String from = d.type().equals(type) ? "" : UNASSIGNED.equals(d.type()) ? "?" : d.type();
				out.add("both".equals(show) ? new Row(SkyLang.tr(d.reward()), 0xFFFFFF55, from, 0xFF9CA3AF, List.of(icon(life, d))) : new Row("  " + SkyLang.tr(d.reward()), 0xFFFFFF55, from, 0xFF9CA3AF));
			}
			if (!strip.isEmpty()) out.add(new Row("", 0, "", 0, strip));
		}
		return out;
	}

	public static final class Module implements HudModule {
		public String id() {
			return "skycase";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return SkyTasks.onSkyUp(mc) && lifetime().opened() > 0;
		}

		private List<Row> rowsOrPreview(Minecraft mc) {
			if (visible(mc)) return rows(session, lifetime(), recent, shownType());
			// the editor, before the first case: some made up
			Data s = new Data(), l = new Data();
			List<Drop> drops = new ArrayList<>();
			String[] sample = { "5x Zaklęta butelka", "Kask Górnika", "3x Diament", "5x Zaklęta butelka", "Sztabka miedzi", "2x Szmaragd" };
			for (int i = 0; i < sample.length; i++) {
				l.of("Górniczy").won(sample[i], 0);
				if (i < 4) s.of("Górniczy").won(sample[i], 0);
				drops.add(new Drop("Górniczy", sample[i], 0));
			}
			return rows(s, l, drops, "Górniczy");
		}

		/** An icon before a name: half the item's size, as tall as the text. */
		private static final int SMALL = 9, ICON = 17;

		private static int rowHeight(Minecraft mc, Row r) {
			return r.strip() ? ICON : mc.font.lineHeight + 1;
		}

		public int width(Minecraft mc) {
			int w = 70;
			for (Row r : rowsOrPreview(mc)) {
				if (r.strip()) w = Math.max(w, r.icons.size() * ICON - 1);
				else w = Math.max(w, (r.icons.isEmpty() ? 0 : SMALL + 2) + mc.font.width(r.left) + (r.right.isEmpty() ? 0 : 10 + mc.font.width(r.right)));
			}
			return w + Modules.PAD * 2;
		}

		public int height(Minecraft mc) {
			int h = 0;
			for (Row r : rowsOrPreview(mc)) h += rowHeight(mc, r);
			return h - 1 + Modules.PAD * 2;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			int w = width(mc) - Modules.PAD * 2, row = y + Modules.PAD;
			for (Row r : rowsOrPreview(mc)) {
				if (r.strip()) {
					// the latest wins as their icons, newest on the left
					for (int i = 0; i < r.icons.size(); i++) g.item(r.icons.get(i), x + Modules.PAD + i * ICON, row);
				} else {
					int tx = x + Modules.PAD;
					if (!r.icons.isEmpty()) {
						var pose = g.pose();
						pose.pushMatrix();
						pose.translate(tx, row - 1);
						pose.scale(SMALL / 16f, SMALL / 16f);
						g.item(r.icons.get(0), 0, 0);
						pose.popMatrix();
						tx += SMALL + 2;
					}
					Modules.text(g, mc, r.left, tx, row, r.leftColor);
					// the numbers (white) take the module's text colour, the rest keeps its own
					if (!r.right.isEmpty()) Modules.text(g, mc, r.right, x + Modules.PAD + w - mc.font.width(r.right), row, r.rightColor == 0xFFFFFFFF ? Modules.textColor() : r.rightColor);
				}
				row += rowHeight(mc, r);
			}
		}
	}

	/** "Nowy drop!": a reward won for the first time, with its item, in SlashClient's look. */
	static final class NewDropToast implements Toast {
		private static final long SHOW_MS = 5000;
		private static final int W = 160, H = 32;
		private final String type, reward;
		private ItemStack icon;
		private long looked;
		private long first = -1, age;
		private Visibility wanted = Visibility.SHOW;

		NewDropToast(String type, String reward, ItemStack icon) {
			this.type = type;
			this.reward = reward;
			this.icon = icon;
		}

		@Override
		public int width() {
			return W;
		}

		@Override
		public int height() {
			return H;
		}

		@Override
		public Visibility getWantedVisibility() {
			return wanted;
		}

		@Override
		public void update(ToastManager manager, long time) {
			if (first < 0) first = time;
			age = time - first;
			wanted = age < SHOW_MS ? Visibility.SHOW : Visibility.HIDE;
			// the look again now and then: one learnt from the item that came into the inventory after the win
			if (age - looked >= 500) {
				looked = age;
				ItemStack later = look(type, reward);
				if (later != null && !later.isEmpty()) icon = later;
			}
		}

		@Override
		public void extractRenderState(GuiGraphicsExtractor g, net.minecraft.client.gui.Font font, long time) {
			Ui.round(g, 0, 0, W, H, 6, Ui.PANEL);
			Ui.roundOutline(g, 0, 0, W, H, 6, 0x60FFAA00);
			if (icon != null && !icon.isEmpty()) g.item(icon, 8, 8);
			else Ui.icon(g, "m-skycase", 10, 10, 12, 0xFFFFAA00);
			int textW = W - 32 - 7;
			Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.skyCase.newDrop"), textW), 32, 7, 0xFFFFAA00);
			Ui.draw(g, Ui.fit(Component.literal(SkyLang.tr(reward) + " · " + (UNASSIGNED.equals(type) ? "SkyCase" : type)), textW), 32, 18, Ui.TEXT_2);
			float left = Math.max(0f, 1f - (float) age / SHOW_MS);
			g.fill(6, H - 3, 6 + Math.round((W - 12) * left), H - 2, 0xFFFFAA00);
		}
	}

	// ---------- for the in-game tests ----------

	/** Each case won from: wins this session / all time, its wins by name, its pool's size. */
	static String debug() {
		StringBuilder out = new StringBuilder();
		for (var e : lifetime().cases.entrySet()) {
			Stats s = e.getValue();
			if (s.opened == 0) continue;
			out.append(e.getKey()).append(": ").append(session.get(e.getKey()).opened).append('/').append(s.opened).append(' ').append(s.drops).append('\n');
		}
		return out.toString();
	}

	/** A case's pool, by name, "|" between. */
	static String debugPool(String type) {
		return String.join("|", lifetime().get(type).pool.keySet());
	}

	static void resetForTest() {
		session = new Data();
		lifetime = new Data();
		seed(lifetime);
		recent.clear();
		contextType = null;
		browse = null;
		received = null;
	}

	/** What was saved read again (as after a restart). */
	static void reloadForTest() {
		lifetime = null;
	}

	/** As if the window was looked at long ago (no case looked at lately). */
	static void forgetContextForTest() {
		contextType = null;
		browse = null;
	}
}
//#endif
