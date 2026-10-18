// SkyUp's tasks are played on 26.3: the tracker is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * SkyUp.pl's island tasks: read from the tasks GUI whenever it is open (every item that looks like a
 * task, see SkyTaskParser), remembered per tier (the GUI's title) and task, and the ones the player
 * tracks shown on the HUD with their progress.
 *
 * Nothing is listed by hand: new tasks and tiers are picked up as the GUI shows them, and a task no
 * longer in its GUI (completed or removed) leaves the list at the next look.
 *
 * "Posiadaj w ekwipunku" is counted live from the player's inventory; everything else is as the GUI
 * showed it the last time it was open ("zaktualizowane X min temu").
 */
public final class SkyTasks {
	private SkyTasks() {}

	/** What is saved: the tasks seen, which are tracked, which "track all" leaves out, and each tier's last look. */
	static final class Data {
		Map<String, SkyTaskParser.Task> tasks = new LinkedHashMap<>();
		Set<String> tracked = new LinkedHashSet<>();
		Set<String> untracked = new LinkedHashSet<>();
		Map<String, Long> tierSeen = new LinkedHashMap<>();
		/** The menu's categories: tasks left in each ("Pozostałe zadania"), and when the menu was read. */
		Map<String, Integer> categories = new LinkedHashMap<>();
		long categoriesSeen;
		/** From SkyUp's sidebar: the island's level (-1: not seen), each job's level. */
		long islandLevel = -1;
		Map<String, Long> jobs = new LinkedHashMap<>();
	}

	static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("zadania.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Data data;
	private static boolean dirty;
	private static int tick;
	static KeyMapping trackKey;
	/** The tier whose GUI was open last: its count is shown on the HUD. */
	private static String lastTier = "";
	/** Tiers whose GUI was open since joining: the others show what was saved before. */
	private static final Set<String> readNow = new java.util.HashSet<>();
	private static boolean menuReadNow;

	/** The in-game tests play in a world of their own: SkyUp there too. */
	static boolean testWorld;

	/** The tracker and the fish counter work on SkyUp.pl only (its address, or a subdomain of it). */
	static boolean onSkyUp(Minecraft mc) {
		if (testWorld) return true;
		var server = mc.getCurrentServer();
		return server != null && server.ip.toLowerCase(Locale.ROOT).contains("skyup.pl");
	}

	/** On SkyUp with the tracker switched on. */
	private static boolean on(Minecraft mc) {
		return SlashHud.config != null && SlashHud.config.placement("skytasks").enabled && onSkyUp(mc);
	}

	/** Joining a server: nothing read yet; on SkyUp, a line saying how to load the progress. */
	static void joined(Minecraft mc) {
		readNow.clear();
		menuReadNow = false;
		if (!on(mc) || !SlashHud.config.skyTasksJoinHint) return;
		Compat.chat(mc).addClientSystemMessage(Component.translatable("slashclient-hud.skyTasks.joinHint").withStyle(net.minecraft.ChatFormatting.GOLD));
	}

	static Data data() {
		if (data == null) {
			try {
				if (Files.exists(FILE)) data = GSON.fromJson(Files.readString(FILE), Data.class);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp tasks: {}", e.toString());
			}
			if (data == null) data = new Data();
			if (data.tasks == null) data.tasks = new LinkedHashMap<>();
			if (data.tracked == null) data.tracked = new LinkedHashSet<>();
			if (data.untracked == null) data.untracked = new LinkedHashSet<>();
			if (data.tierSeen == null) data.tierSeen = new LinkedHashMap<>();
			if (data.categories == null) data.categories = new LinkedHashMap<>();
			if (data.jobs == null) data.jobs = new LinkedHashMap<>();
			// saved before the titles' private characters were taken off: under the plain name
			Map<String, SkyTaskParser.Task> tasks = new LinkedHashMap<>();
			for (SkyTaskParser.Task t : data.tasks.values()) {
				t.tier = SkyTaskParser.plain(t.tier);
				tasks.put(t.key(), t);
			}
			data.tasks = tasks;
			for (var e : data.tierSeen.entrySet()) if (lastTier.isEmpty() || e.getValue() >= data.tierSeen.getOrDefault(lastTier, 0L)) lastTier = e.getKey();
		}
		return data;
	}

	static void save() {
		dirty = false;
		savedAt = System.currentTimeMillis();
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(data()));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: SkyUp tasks: {}", e.toString());
		}
	}

	// ---------- reading the GUI ----------

	/** Every few ticks while a chest-like screen is open: its tasks; saved once it closes. */
	static void tick(Minecraft mc) {
		var screen = Compat.screen(mc);
		if (!onSkyUp(mc)) {
			if (dirty) save();
			return;
		}
		if (screen instanceof AbstractContainerScreen<?> c && challengesGui(c)) {
			if (++tick % 5 == 0) read(c);
		} else if (dirty && System.currentTimeMillis() - savedAt > 30_000) {
			// what the counters add is saved now and then, not at every block
			save();
		}
		SkyCounters.tick(mc);
	}

	private static long savedAt;

	/** The counters added something: saved before long. */
	static void changed() {
		dirty = true;
	}

	/** Each stack read once (the GUI draws them every frame; the server sends new stacks when they change). */
	private static final Map<ItemStack, java.util.Optional<SkyTaskParser.Task>> parsed = new java.util.WeakHashMap<>();

	/** The task on a slot, or null. */
	static SkyTaskParser.Task task(String tier, ItemStack stack) {
		if (stack.isEmpty()) return null;
		return parsed.computeIfAbsent(stack, s -> {
			List<String> lore = new ArrayList<>();
			for (Component line : SkyDump.lore(s)) lore.add(line.getString());
			SkyTaskParser.Task t = SkyTaskParser.parse(tier, s.getHoverName().getString(), lore);
			if (t != null) t.icon = BuiltInRegistries.ITEM.getKey(s.getItem()).toString();
			return java.util.Optional.ofNullable(t);
		}).orElse(null);
	}

	/** The category of a challenges GUI: "Wyzwania » Nowicjusz" is Nowicjusz; the menu ("Wyzwania") is itself. */
	static String tier(AbstractContainerScreen<?> screen) {
		String title = SkyTaskParser.plain(screen.getTitle().getString());
		int arrow = title.lastIndexOf('»');
		return arrow >= 0 && arrow < title.length() - 1 ? title.substring(arrow + 1).strip() : title;
	}

	/** The screen last looked at, and whether it was one of them (its items come a moment after it opens). */
	private static AbstractContainerScreen<?> checked;
	private static boolean checkedChallenges;

	/**
	 * SkyUp's challenges: the menu "Wyzwania" or a category "Wyzwania » Nowicjusz", a chest (6 rows), with
	 * at least one item only they have. Other GUIs are never read, whatever their items look like.
	 */
	static boolean challengesGui(AbstractContainerScreen<?> screen) {
		if (screen == checked && checkedChallenges) return true;
		checked = screen;
		checkedChallenges = false;
		if (!(screen instanceof net.minecraft.client.gui.screens.inventory.ContainerScreen)) return false;
		if (!SkyTaskParser.challengesTitle(screen.getTitle().getString())) return false;
		for (Slot slot : screen.getMenu().slots) {
			if (slot.container instanceof Inventory || !slot.hasItem()) continue;
			for (Component line : SkyDump.lore(slot.getItem())) if (SkyTaskParser.challengesLine(line.getString())) return checkedChallenges = true;
		}
		return false;
	}

	/** One look at the open GUI: its tasks stored, and those of its tier it no longer shows gone. */
	static void read(AbstractContainerScreen<?> screen) {
		String tier = tier(screen);
		Map<String, SkyTaskParser.Task> found = new LinkedHashMap<>();
		for (Slot slot : screen.getMenu().slots) {
			if (slot.container instanceof Inventory) continue;
			SkyTaskParser.Task t = task(tier, slot.getItem());
			if (t != null) found.put(t.key(), t);
		}
		if (found.isEmpty()) return;
		Data d = data();
		long now = System.currentTimeMillis();
		// the menu: each category's count (the daily task in it is a task like the others)
		boolean menu = false;
		for (SkyTaskParser.Task t : List.copyOf(found.values())) {
			if (!t.category) continue;
			menu = true;
			found.remove(t.key());
			Integer old = d.categories.put(t.name, t.remaining());
			if (old == null || old != t.remaining()) dirty = true;
		}
		if (menu) {
			d.categoriesSeen = now;
			menuReadNow = true;
		}
		for (SkyTaskParser.Task t : found.values()) {
			SkyTaskParser.Task old = d.tasks.get(t.key());
			if (old == null || !same(old, t)) dirty = true;
			t.seen = now;
			d.tasks.put(t.key(), t);
		}
		// completed (or removed by the server): no longer in this tier's GUI
		d.tasks.values().removeIf(t -> {
			boolean gone = t.tier.equals(tier) && !found.containsKey(t.key());
			if (gone) {
				dirty = true;
				d.tracked.remove(t.key());
				d.untracked.remove(t.key());
			}
			return gone;
		});
		d.tierSeen.put(tier, now);
		readNow.add(tier);
		// the menu is no category: the one last open stays on the HUD
		if (!menu) lastTier = tier;
	}

	/** The same task, as far as the HUD shows it. */
	private static boolean same(SkyTaskParser.Task a, SkyTaskParser.Task b) {
		return GSON.toJson(a.sections).equals(GSON.toJson(b.sections)) && a.rewards.equals(b.rewards);
	}

	// ---------- tracking ----------

	static boolean tracked(String key) {
		Data d = data();
		return SlashHud.config.skyTasksTrackAll ? !d.untracked.contains(key) : d.tracked.contains(key);
	}

	static void toggle(String key) {
		Data d = data();
		boolean on = !tracked(key);
		if (on) {
			d.tracked.add(key);
			d.untracked.remove(key);
		} else {
			d.tracked.remove(key);
			d.untracked.add(key);
		}
		save();
	}

	/** The task under the mouse in an open GUI, or null. */
	static SkyTaskParser.Task hovered(AbstractContainerScreen<?> screen) {
		if (!challengesGui(screen)) return null;
		Slot slot = ((ContainerScreenAccessor) screen).slashclient$hoveredSlot();
		if (slot == null || slot.container instanceof Inventory) return null;
		return task(tier(screen), slot.getItem());
	}

	/** The middle button on a task: tracks it (and the server never sees the click). */
	static boolean click(AbstractContainerScreen<?> screen, net.minecraft.client.input.MouseButtonEvent e) {
		if (e.button() != InputConstants.MOUSE_BUTTON_MIDDLE || !on(Minecraft.getInstance())) return false;
		SkyTaskParser.Task t = hovered(screen);
		if (t == null) return false;
		toggle(t.key());
		return true;
	}

	/** The track key on a task. */
	static boolean key(AbstractContainerScreen<?> screen, net.minecraft.client.input.KeyEvent e) {
		if (trackKey == null || !trackKey.matches(e) || !on(Minecraft.getInstance())) return false;
		SkyTaskParser.Task t = hovered(screen);
		if (t == null) return false;
		toggle(t.key());
		return true;
	}

	/** Over the GUI: a mark on tracked tasks, and under it what the key does for the one under the mouse. */
	static void drawOver(AbstractContainerScreen<?> screen, GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (!on(mc) || !challengesGui(screen)) return;
		ContainerScreenAccessor at = (ContainerScreenAccessor) screen;
		String tier = tier(screen);
		boolean any = false;
		for (Slot slot : screen.getMenu().slots) {
			if (slot.container instanceof Inventory) continue;
			SkyTaskParser.Task t = task(tier, slot.getItem());
			if (t == null) continue;
			any = true;
			if (!tracked(t.key())) continue;
			// a gold corner, top right
			int x = at.slashclient$leftPos() + slot.x + 16, y = at.slashclient$topPos() + slot.y;
			for (int i = 0; i < 5; i++) g.fill(x - 5 + i, y + i, x, y + i + 1, 0xFFFACC15);
		}
		if (!any) return;
		SkyTaskParser.Task t = hovered(screen);
		Component keyName = trackKey == null ? Component.literal("?") : trackKey.getTranslatedKeyMessage();
		Component hint = t == null ? Component.translatable("slashclient-hud.skyTasks.hint", keyName)
			: Component.translatable(tracked(t.key()) ? "slashclient-hud.skyTasks.untrack" : "slashclient-hud.skyTasks.track", keyName, t.name);
		int w = mc.font.width(hint) + 8;
		int x = at.slashclient$leftPos() + (at.slashclient$imageWidth() - w) / 2;
		int y = Math.min(screen.height - 14, at.slashclient$topPos() + at.slashclient$imageHeight() + 3);
		g.fill(x, y, x + w, y + 12, 0xE0101827);
		g.fill(x, y + 11, x + w, y + 12, t != null && tracked(t.key()) ? 0xFFFACC15 : 0xFF60A5FA);
		g.text(mc.font, hint, x + 4, y + 2, 0xFFFFFFFF, false);
	}

	// ---------- counting what the player has ----------

	/** Item names in the game's language (lower case) → the item; built once per language. */
	private static Map<String, Item> names;
	private static String namesLang;

	private static Item itemNamed(Minecraft mc, String name) {
		String lang = mc.options.languageCode;
		if (names == null || !lang.equals(namesLang)) {
			names = new HashMap<>();
			namesLang = lang;
			for (Item item : BuiltInRegistries.ITEM) names.putIfAbsent(new ItemStack(item).getHoverName().getString().toLowerCase(Locale.ROOT), item);
		}
		return names.get(name.toLowerCase(Locale.ROOT));
	}

	/** How many of `thing` the player carries (by the name shown, or the game's item of that name); -1 when nothing tells. */
	static long carried(Minecraft mc, String thing) {
		if (mc.player == null || thing.isEmpty()) return -1;
		Item item = itemNamed(mc, thing);
		Inventory inv = mc.player.getInventory();
		long n = 0;
		boolean named = false;
		for (int i = 0; i < inv.getContainerSize(); i++) {
			// armour is worn, not carried
			if (i >= Inventory.INVENTORY_SIZE && i != Inventory.SLOT_OFFHAND) continue;
			ItemStack s = inv.getItem(i);
			if (s.isEmpty()) continue;
			boolean byName = s.getHoverName().getString().equalsIgnoreCase(thing);
			if (byName || (item != null && s.is(item))) {
				n += s.getCount();
				named |= byName;
			}
		}
		return item != null || named ? n : -1;
	}

	/** A requirement's progress now: counted from the inventory where it can be. */
	static long current(Minecraft mc, SkyTaskParser.Section s, SkyTaskParser.Req r) {
		if (s.inventory()) {
			long have = carried(mc, r.thing);
			if (have >= 0) return have;
		}
		// "Stój obok": what is around now
		if (r.current < 0 && SkyCounters.kind(s) == SkyCounters.Kind.NEAR) return SkyCounters.around(mc, r.thing);
		// the island's and the jobs' levels: from the sidebar
		if (r.current < 0) {
			long level = SkyCounters.fromSidebar(s);
			if (level >= 0) return level;
		}
		return r.current < 0 ? r.current : r.current + r.extra;
	}

	/** The number shown is the client's own count, not the server's (shown with "~"). */
	static boolean estimated(SkyTaskParser.Section s, SkyTaskParser.Req r) {
		return !s.inventory() && (r.extra > 0 || (r.current < 0 && SkyCounters.kind(s) == SkyCounters.Kind.NEAR)
			|| (r.current < 0 && SkyCounters.sidebarEstimate(s) && SkyCounters.fromSidebar(s) >= 0));
	}

	static boolean met(Minecraft mc, SkyTaskParser.Section s, SkyTaskParser.Req r) {
		long c = current(mc, s, r);
		return c >= 0 && r.required >= 0 && c >= r.required;
	}

	static boolean ready(Minecraft mc, SkyTaskParser.Task t) {
		for (SkyTaskParser.Section s : t.sections) for (SkyTaskParser.Req r : s.items) if (!met(mc, s, r)) return false;
		return !t.sections.isEmpty();
	}

	/** The tasks on the HUD, in the order they were seen. */
	static List<SkyTaskParser.Task> shown(Minecraft mc) {
		List<SkyTaskParser.Task> out = new ArrayList<>();
		HudConfig cfg = SlashHud.config;
		for (SkyTaskParser.Task t : data().tasks.values()) {
			if (!tracked(t.key())) continue;
			if (cfg.skyTasksHideDone && ready(mc, t)) continue;
			out.add(t);
			if (out.size() >= cfg.skyTasksMax) break;
		}
		return out;
	}

	/** The tier last open: how many of its tasks are left, and how many are ready to complete. */
	static int[] tierCount(Minecraft mc) {
		Data d = data();
		int left = 0, ready = 0;
		for (SkyTaskParser.Task t : d.tasks.values()) {
			if (!t.tier.equals(lastTier)) continue;
			left++;
			if (ready(mc, t)) ready++;
		}
		// the menu read after the category: its count is the newer one
		Integer menu = d.categories.get(lastTier);
		if (menu != null && menu >= 0 && d.categoriesSeen > d.tierSeen.getOrDefault(lastTier, 0L)) left = menu;
		return new int[] { left, ready };
	}

	/** The count shown is from this session (the category's GUI, or the menu, open since joining). */
	private static boolean fresh() {
		return readNow.contains(lastTier) || (menuReadNow && data().categories.containsKey(lastTier));
	}

	// ---------- on the HUD ----------

	/** One row of the module: text on the left, text on the right, a bar under it (fill 0–1, or -1 for none). */
	private record Row(String left, int leftColor, String right, int rightColor, float bar, int indent) {}

	private static final int GOLD = 0xFFFACC15, GREY = 0xFF9CA3AF, GREEN = 0xFF4ADE80, WHITE = 0xFFE5E7EB;

	private static List<Row> rows(Minecraft mc, List<SkyTaskParser.Task> tasks) {
		HudConfig cfg = SlashHud.config;
		List<Row> out = new ArrayList<>();
		if (cfg.skyTasksTierCount && !lastTier.isEmpty()) {
			int[] c = tierCount(mc);
			boolean fresh = fresh();
			out.add(new Row(lastTier, 0xFFA855F7, fresh ? Component.translatable("slashclient-hud.skyTasks.left", c[0], c[1]).getString()
				: Component.translatable("slashclient-hud.skyTasks.notLoaded").getString(), fresh ? GREY : 0xFFF59E0B, -1, 0));
		}
		long now = System.currentTimeMillis();
		for (SkyTaskParser.Task t : tasks) {
			boolean ready = ready(mc, t);
			boolean serverOnly = false;
			for (SkyTaskParser.Section s : t.sections) serverOnly |= !s.inventory() && !s.items.isEmpty();
			String age = "";
			if (!cfg.skyTasksCompact && serverOnly) {
				long min = (now - t.seen) / 60_000;
				age = min < 1 ? Component.translatable("slashclient-hud.skyTasks.now").getString() : Component.translatable("slashclient-hud.skyTasks.ago", min).getString();
			}
			out.add(new Row((ready ? "✔ " : "") + t.name, ready ? GREEN : GOLD, age, 0xFF6B7280, -1, 0));
			// locked until another challenge is done
			if (!cfg.skyTasksCompact && !t.requires.isEmpty()) out.add(new Row(Component.translatable("slashclient-hud.skyTasks.requires", t.requires).getString(), 0xFFF87171, "", 0, -1, 4));
			for (SkyTaskParser.Section s : t.sections) {
				if (!cfg.skyTasksCompact && t.sections.size() > 1) out.add(new Row(s.header, GREY, "", 0, -1, 4));
				for (SkyTaskParser.Req r : s.items) {
					long c = current(mc, s, r);
					boolean met = met(mc, s, r);
					String progress = r.required < 0 ? r.unit
						: (c >= 0 ? (estimated(s, r) ? "~" : "") + c + "/" : "") + r.required + (r.unit.isEmpty() ? "" : " " + r.unit);
					String thing = r.thing.equals(s.header) || r.thing.isEmpty() ? s.header : r.thing;
					float bar = cfg.skyTasksCompact || c < 0 || r.required <= 0 ? -1 : Math.min(1f, (float) c / r.required);
					out.add(new Row((met ? "✔ " : "• ") + thing, met ? 0xFF6B7280 : WHITE, progress, met ? GREEN : WHITE, bar, 6));
				}
			}
			if (cfg.skyTasksRewards && !t.rewards.isEmpty()) out.add(new Row(Component.translatable("slashclient-hud.skyTasks.reward", String.join(", ", t.rewards)).getString(), 0xFF60A5FA, "", 0, -1, 6));
		}
		return out;
	}

	private static final int MAX_W = 220;

	private static int rowHeight(Minecraft mc, Row r) {
		return mc.font.lineHeight + 1 + (r.bar >= 0 ? 3 : 0);
	}

	private static int width(Minecraft mc, List<Row> rows) {
		int w = 80;
		for (Row r : rows) w = Math.max(w, r.indent + mc.font.width(r.left) + (r.right.isEmpty() ? 0 : 8 + mc.font.width(r.right)));
		return Math.min(MAX_W, w) + Modules.PAD * 2;
	}

	private static int height(Minecraft mc, List<Row> rows) {
		int h = 0;
		for (Row r : rows) h += rowHeight(mc, r);
		return Math.max(mc.font.lineHeight, h - 1) + Modules.PAD * 2;
	}

	private static void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<Row> rows) {
		int w = width(mc, rows) - Modules.PAD * 2;
		int row = y + Modules.PAD;
		int left = x + Modules.PAD;
		for (int i = 0; i < rows.size(); i++) {
			Row r = rows.get(i);
			// a little room above each task's title (not the first row)
			int room = w - r.indent - (r.right.isEmpty() ? 0 : mc.font.width(r.right) + 8);
			String text = mc.font.width(r.left) > room ? mc.font.plainSubstrByWidth(r.left, room - mc.font.width("…")) + "…" : r.left;
			Modules.text(g, mc, text, left + r.indent, row, r.leftColor);
			if (!r.right.isEmpty()) Modules.text(g, mc, r.right, left + w - mc.font.width(r.right), row, r.rightColor);
			if (r.bar >= 0) {
				int by = row + mc.font.lineHeight + 1, bx = left + r.indent + 8;
				g.fill(bx, by, left + w, by + 2, 0x80374151);
				g.fill(bx, by, bx + Math.round((left + w - bx) * r.bar), by + 2, r.bar >= 1 ? GREEN : 0xFF60A5FA);
			}
			row += rowHeight(mc, r);
		}
	}

	/** The HUD module: the tracked tasks with their progress. */
	public static final class Module implements HudModule {
		public String id() {
			return "skytasks";
		}

		@Override
		public boolean visible(Minecraft mc) {
			if (!onSkyUp(mc)) return false;
			return !shown(mc).isEmpty() || (SlashHud.config.skyTasksTierCount && !lastTier.isEmpty() && tierCount(mc)[0] > 0);
		}

		private List<Row> rowsOrPreview(Minecraft mc) {
			// nothing real to show (the editor): two sample tasks
			return rows(mc, visible(mc) ? shown(mc) : preview());
		}

		public int width(Minecraft mc) {
			return SkyTasks.width(mc, rowsOrPreview(mc));
		}

		public int height(Minecraft mc) {
			return SkyTasks.height(mc, rowsOrPreview(mc));
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			SkyTasks.draw(g, mc, x, y, rowsOrPreview(mc));
		}
	}

	// ---------- for the in-game tests ----------

	static void resetForTest() {
		data = new Data();
		readNow.clear();
		menuReadNow = false;
		lastTier = "";
	}

	/** The module's rows as text ("left | right"), one per line. */
	static String debugRows(Minecraft mc) {
		StringBuilder out = new StringBuilder();
		for (Row r : rows(mc, shown(mc))) out.append(r.left).append(" | ").append(r.right).append('\n');
		return out.toString();
	}

	/** Every task known: "tier|name: header[thing current/required] …", one per line. */
	static String debugTasks() {
		StringBuilder out = new StringBuilder();
		for (SkyTaskParser.Task t : data().tasks.values()) {
			out.append(t.key()).append(":");
			for (SkyTaskParser.Section s : t.sections) {
				out.append(" ").append(s.header).append(s.inventory() ? "(inv)" : "");
				for (SkyTaskParser.Req r : s.items) out.append("[").append(r.thing).append(" ").append(r.current).append("/").append(r.required).append(r.unit.isEmpty() ? "" : " " + r.unit).append("]");
			}
			out.append(" rewards=").append(t.rewards.size()).append(t.takesItems ? " takes" : "").append('\n');
		}
		return out.toString();
	}

	/** Every requirement's progress as the HUD would show it: "task: thing ~c/r", one per line. */
	static String debugProgress(Minecraft mc) {
		StringBuilder out = new StringBuilder();
		for (SkyTaskParser.Task t : data().tasks.values()) {
			for (SkyTaskParser.Section s : t.sections) for (SkyTaskParser.Req r : s.items) {
				out.append(t.name).append(": ").append(r.thing).append(' ').append(estimated(s, r) ? "~" : "").append(current(mc, s, r)).append('/').append(r.required).append('\n');
			}
		}
		return out.toString();
	}

	static String debugCategories() {
		return data().categories.toString();
	}

	static String debugTracked() {
		List<String> out = new ArrayList<>();
		for (String k : data().tasks.keySet()) if (tracked(k)) out.add(k);
		return String.join(",", out);
	}

	/** What the editor shows before any task is tracked: two of SkyUp's first tasks. */
	static List<SkyTaskParser.Task> preview() {
		List<SkyTaskParser.Task> out = new ArrayList<>();
		out.add(SkyTaskParser.parse("NOWICJUSZ", "» Podstawowy kamieniołom «", List.of("Zbierz:", "» Kamień: 28/128", "Za ukończenie otrzymasz:", "» 100.0 SC")));
		out.add(SkyTaskParser.parse("NOWICJUSZ", "» A co tutaj tak ciemno? «", List.of("Stwórz:", "» Pochodnia: 64/64", "Postaw", "» Pochodnia: 12/64", "Za ukończenie otrzymasz:", "» 2 x Latarnia", "» 100.0 SC")));
		long now = System.currentTimeMillis();
		for (SkyTaskParser.Task t : out) t.seen = now - 4 * 60_000;
		return out;
	}
}
//#endif
