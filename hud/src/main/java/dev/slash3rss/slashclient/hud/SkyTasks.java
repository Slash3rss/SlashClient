// SkyUp's tasks are played on 26.3: the tracker is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import dev.slash3rss.slashclient.hud.ui.Ui;
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
import java.util.regex.Matcher;

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
		/**
		 * The categories tracked from the menu (the middle button or the key on one): each has its row on the
		 * HUD with all its tasks. Null until the player picks one: then the category last open shows instead.
		 */
		Set<String> trackedCategories;
		/** The most upgrade points seen spent in a stone generator (its window; SkyGenerator), or null before any. */
		Integer generatorSpent;
		/** Incubators' highest levels seen, by an item of their upgrade's cost (SkyIncubator), or null before any. */
		Map<String, Integer> incubators;
		/** From SkyUp's sidebar: the island's level (-1: not seen), each job's level. */
		long islandLevel = -1;
		Map<String, Long> jobs = new LinkedHashMap<>();
	}

	/** The progress from before each account had its own file: the first account that plays takes it over. */
	static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("zadania.json");

	/** The file of the account playing now: every Minecraft account keeps its own progress. */
	static Path file() {
		var user = Minecraft.getInstance().getUser();
		java.util.UUID id = user == null ? null : user.getProfileId();
		return id == null ? FILE : FILE.resolveSibling("zadania-" + id.toString().replace("-", "") + ".json");
	}

	/** Where the progress in memory came from (and is saved to). */
	private static Path loadedFrom;
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Data data;
	static boolean dirty;
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
		// the first reminder of the daily task one interval after joining
		remindAt = System.currentTimeMillis() + remindEvery();
		if (!on(mc) || !SlashHud.config.skyTasksJoinHint) return;
		Compat.chat(mc).addClientSystemMessage(Component.translatable("slashclient-hud.skyTasks.joinHint").withStyle(net.minecraft.ChatFormatting.GOLD));
	}

	static Data data() {
		// another account than the progress in memory belongs to: its own file
		Path file = file();
		if (data != null && loadedFrom != null && !file.equals(loadedFrom)) {
			if (dirty) save();
			data = null;
			lastTier = "";
			readNow.clear();
		}
		if (data == null) {
			loadedFrom = file;
			try {
				Path from = Files.exists(file) ? file : Files.exists(FILE) ? FILE : null;
				if (from != null) data = GSON.fromJson(Files.readString(from), Data.class);
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
			// a category ticked in the menu before categories were tracked on their own: kept as a task's key
			// (the menu's title and the category's name) that no task has
			for (String k : List.copyOf(data.tracked)) {
				String name = k.substring(k.indexOf('|') + 1);
				if (data.tasks.containsKey(k) || !data.categories.containsKey(name)) continue;
				data.tracked.remove(k);
				if (data.trackedCategories == null) data.trackedCategories = new LinkedHashSet<>();
				data.trackedCategories.add(name);
			}
			// tracking of tasks no longer known (completed before this version cleaned it up) is dropped
			data.tracked.removeIf(k -> !data.tasks.containsKey(k));
			data.untracked.removeIf(k -> !data.tasks.containsKey(k));
			for (var e : data.tierSeen.entrySet()) if (lastTier.isEmpty() || e.getValue() >= data.tierSeen.getOrDefault(lastTier, 0L)) lastTier = e.getKey();
		}
		return data;
	}

	static void save() {
		dirty = false;
		savedAt = System.currentTimeMillis();
		try {
			Data now = data();
			Path to = loadedFrom != null ? loadedFrom : file();
			Files.createDirectories(to.getParent());
			Files.writeString(to, GSON.toJson(now));
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
		} else if (screen instanceof AbstractContainerScreen<?> c && ++tick % 5 == 0) {
			// a generator's window: the upgrade points spent in it (a task asks for them)
			List<net.minecraft.world.item.ItemStack> items = new ArrayList<>();
			for (Slot slot : c.getMenu().slots) if (!(slot.container instanceof Inventory)) items.add(slot.getItem());
			SkyGenerator.seen(items);
			SkyIncubator.seen(items);
		} else if (dirty && System.currentTimeMillis() - savedAt > 30_000) {
			// what the counters add is saved now and then, not at every block
			save();
		}
		SkyCounters.tick(mc);
		remindDaily(mc);
	}

	// ---------- the daily task's reminder ----------

	/** When the daily task is to be brought up next (ms). */
	private static long remindAt;

	/** How often (ms): the setting's minutes; 0 when switched off. */
	private static long remindEvery() {
		return SlashHud.config == null ? 0 : SlashHud.config.skyDailyRemind * 60_000L;
	}

	/** Now and then, while the daily task is tracked and not handed in: a reminder with how far it is. */
	private static void remindDaily(Minecraft mc) {
		long every = remindEvery(), now = System.currentTimeMillis();
		if (every <= 0 || now < remindAt) return;
		remindAt = now + every;
		Component what = dailyReminder(mc);
		if (what == null) return;
		mc.execute(() -> net.minecraft.client.gui.components.toasts.SystemToast.add(Compat.toasts(mc), net.minecraft.client.gui.components.toasts.SystemToast.SystemToastId.PERIODIC_NOTIFICATION,
			Component.translatable("slashclient-hud.skyTasks.dailyTitle"), what));
	}

	/** SkyUp's daily task ("Zadanie codzienne"). */
	static boolean daily(SkyTaskParser.Task t) {
		return nameKey(t.name).equals("zadanie codzienne");
	}

	/** What the reminder says: the daily task's requirements still to do ("Szkielet 0/6"), or that it is ready; null when none is tracked. */
	static Component dailyReminder(Minecraft mc) {
		for (SkyTaskParser.Task t : data().tasks.values()) {
			if (!daily(t) || !tracked(t)) continue;
			if (ready(mc, t)) return Component.translatable("slashclient-hud.skyTasks.dailyReady");
			List<String> left = new ArrayList<>();
			for (SkyTaskParser.Section s : t.sections) for (SkyTaskParser.Req r : s.items) {
				if (met(mc, s, r)) continue;
				left.add(r.known() ? r.thing + " " + Math.min(r.required, r.current + r.extra) + "/" + r.required : r.thing);
			}
			return Component.translatable("slashclient-hud.skyTasks.dailyLeft", left.isEmpty() ? t.name : String.join(", ", left));
		}
		return null;
	}

	private static long savedAt;

	/** The counters added something: saved before long. */
	static void changed() {
		dirty = true;
	}

	/** Leaving a server or closing the game: what is not saved yet (up to the last 30 s of counting) is saved now. */
	static void flush() {
		if (dirty) save();
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
			// a category done: no longer tracked, nor any task of it
			if (t.remaining() == 0 && (categoryTracked(t.name) || d.tasks.values().stream().anyMatch(x -> x.tier.equalsIgnoreCase(t.name)))) {
				if (d.trackedCategories != null) d.trackedCategories.removeIf(c -> c.equalsIgnoreCase(t.name));
				d.tasks.values().removeIf(x -> x.tier.equalsIgnoreCase(t.name));
				d.tracked.removeIf(k -> k.substring(0, Math.max(0, k.indexOf('|'))).equalsIgnoreCase(t.name));
				d.untracked.removeIf(k -> k.substring(0, Math.max(0, k.indexOf('|'))).equalsIgnoreCase(t.name));
				dirty = true;
			}
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
		// tracking of a task of this tier that is gone (completed in the chat, then the GUI read again)
		d.tracked.removeIf(k -> k.startsWith(tier + "|") && !d.tasks.containsKey(k));
		d.untracked.removeIf(k -> k.startsWith(tier + "|") && !d.tasks.containsKey(k));
		d.tierSeen.put(tier, now);
		readNow.add(tier);
		// the menu is no category: the one last open stays on the HUD
		if (!menu) lastTier = tier;
	}

	/** SkyUp in the chat once a task is handed in: "Wyzwania » Ukończono zadanie Składzik!". */
	private static final java.util.regex.Pattern COMPLETED = java.util.regex.Pattern.compile("(?iu)wyzwania\\b.*?ukończono\\s+zadanie\\s*:?\\s+(.+?)[\\s!.«»]*$");

	/** A task's name compared by its letters and digits only (SkyUp's arrows, glyphs and colours aside). */
	private static String nameKey(String s) {
		return SkyTaskParser.plain(s).toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
	}

	/** A chat line: a task handed in leaves the list (and the HUD) at once, before the GUI is open again. */
	public static void onChat(Component message) {
		if (SlashHud.config == null) return;
		Matcher m = COMPLETED.matcher(SkyTaskParser.plain(message.getString()));
		if (!m.find() || !onSkyUp(Minecraft.getInstance())) return;
		completed(m.group(1));
	}

	/** The task of that name gone: from the category last open first, else any category (ready, then tracked ones first). */
	static boolean completed(String name) {
		String plain = nameKey(name);
		Data d = data();
		SkyTaskParser.Task best = null;
		int bestScore = -1;
		Minecraft mc = Minecraft.getInstance();
		for (SkyTaskParser.Task t : d.tasks.values()) {
			if (!nameKey(t.name).equals(plain)) continue;
			int score = (t.tier.equalsIgnoreCase(lastTier) ? 4 : 0) + (ready(mc, t) ? 2 : 0) + (tracked(t) ? 1 : 0);
			if (score > bestScore) {
				best = t;
				bestScore = score;
			}
		}
		if (best == null) return false;
		String key = best.key();
		d.tasks.remove(key);
		d.tracked.remove(key);
		d.untracked.remove(key);
		// the menu's count of the category: one fewer left
		for (var e : d.categories.entrySet()) if (e.getKey().equalsIgnoreCase(best.tier) && e.getValue() > 0) e.setValue(e.getValue() - 1);
		save();
		return true;
	}

	/** The same task, as far as the HUD shows it. */
	private static boolean same(SkyTaskParser.Task a, SkyTaskParser.Task b) {
		return GSON.toJson(a.sections).equals(GSON.toJson(b.sections)) && a.rewards.equals(b.rewards);
	}

	// ---------- tracking ----------

	/** A task (or a category of the menu) on the HUD: tracked on its own, or by "track all", or its whole category. */
	static boolean tracked(SkyTaskParser.Task t) {
		if (t.category) return categoryTracked(t.name);
		Data d = data();
		String key = t.key();
		boolean all = SlashHud.config.skyTasksTrackAll || categoryTracked(t.tier);
		return all ? !d.untracked.contains(key) : d.tracked.contains(key);
	}

	static boolean categoryTracked(String name) {
		Set<String> picked = data().trackedCategories;
		if (picked == null) return false;
		for (String c : picked) if (c.equalsIgnoreCase(name)) return true;
		return false;
	}

	/** A category ticked or unticked in the menu: on the HUD (or off it) at once, opened or not. */
	static void toggleCategory(String name) {
		Data d = data();
		if (d.trackedCategories == null) d.trackedCategories = new LinkedHashSet<>();
		if (!d.trackedCategories.removeIf(c -> c.equalsIgnoreCase(name))) {
			d.trackedCategories.add(name);
			// the whole category: tasks of it left out before come back
			d.untracked.removeIf(k -> k.substring(0, Math.max(0, k.indexOf('|'))).equalsIgnoreCase(name));
		}
		save();
	}

	static void toggle(SkyTaskParser.Task t) {
		if (t.category) {
			toggleCategory(t.name);
			return;
		}
		Data d = data();
		String key = t.key();
		boolean on = !tracked(t);
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
		toggle(t);
		return true;
	}

	/** The track key on a task. */
	static boolean key(AbstractContainerScreen<?> screen, net.minecraft.client.input.KeyEvent e) {
		if (trackKey == null || !trackKey.matches(e) || !on(Minecraft.getInstance())) return false;
		SkyTaskParser.Task t = hovered(screen);
		if (t == null) return false;
		toggle(t);
		return true;
	}

	/** Over the GUI: a mark on tracked tasks, and under it what the key does for the one under the mouse. */
	static void drawOver(AbstractContainerScreen<?> screen, GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (!on(mc) || !challengesGui(screen)) return;
		ContainerScreenAccessor at = (ContainerScreenAccessor) screen;
		String tier = tier(screen);
		boolean any = false;
		List<Integer> lit = new ArrayList<>(), done = new ArrayList<>();
		float glow = glow();
		for (int i = 0; i < screen.getMenu().slots.size(); i++) {
			Slot slot = screen.getMenu().slots.get(i);
			if (slot.container instanceof Inventory) continue;
			SkyTaskParser.Task t = task(tier, slot.getItem());
			int sx = at.slashclient$leftPos() + slot.x, sy = at.slashclient$topPos() + slot.y;
			// handed in already (admins still see it in the GUI): a quiet slate frame, not the green of "ready"
			if (t == null && handedIn(slot.getItem())) {
				done.add(i);
				g.fill(sx, sy, sx + 16, sy + 16, 0x50202A3A);
				frame(g, sx - 1, sy - 1, 18, 18, 0xFF64748B);
				continue;
			}
			if (t == null) continue;
			any = true;
			// ready to hand in (a task done, or a category of the menu with one done): a green glowing frame
			if (t.category ? tierCount(mc, t.name)[1] > 0 : ready(mc, known(t))) {
				lit.add(i);
				g.fill(sx, sy, sx + 16, sy + 16, 0x3822C55E);
				frame(g, sx - 1, sy - 1, 18, 18, Ui.blend(0xFF16A34A, 0xFF4ADE80, glow));
				frame(g, sx - 2, sy - 2, 20, 20, ((int) (0x40 + 0x40 * glow) << 24) | 0x22C55E);
			}
			if (!tracked(t)) continue;
			// a gold corner, top right
			int x = sx + 16, y = sy;
			for (int k = 0; k < 5; k++) g.fill(x - 5 + k, y + k, x, y + k + 1, 0xFFFACC15);
		}
		highlighted = lit;
		handedInSlots = done;
		if (!any) return;
		SkyTaskParser.Task t = hovered(screen);
		Component keyName = trackKey == null ? Component.literal("?") : trackKey.getTranslatedKeyMessage();
		Component hint = t == null ? Component.translatable("slashclient-hud.skyTasks.hint", keyName)
			: Component.translatable("slashclient-hud.skyTasks." + (tracked(t) ? "untrack" : "track") + (t.category ? "Category" : ""), keyName, t.name);
		int w = mc.font.width(hint) + 8;
		int x = at.slashclient$leftPos() + (at.slashclient$imageWidth() - w) / 2;
		int y = Math.min(screen.height - 14, at.slashclient$topPos() + at.slashclient$imageHeight() + 3);
		g.fill(x, y, x + w, y + 12, 0xE0101827);
		g.fill(x, y + 11, x + w, y + 12, t != null && tracked(t) ? 0xFFFACC15 : 0xFF60A5FA);
		g.text(mc.font, hint, x + 4, y + 2, 0xFFFFFFFF, false);
	}

	/** The slots lit as ready on the last frame (for the test). */
	static List<Integer> highlighted = List.of();
	/** The slots marked as handed in on the last frame (for the test). */
	static List<Integer> handedInSlots = List.of();

	private static final Map<ItemStack, Boolean> handedIn = new java.util.WeakHashMap<>();

	/** A task item the GUI still shows after it was handed in: its lore says "Zadanie ukończone!". */
	static boolean handedIn(ItemStack stack) {
		if (stack.isEmpty()) return false;
		return handedIn.computeIfAbsent(stack, s -> {
			for (Component line : SkyDump.lore(s)) {
				if (SkyTaskParser.plain(line.getString()).toLowerCase(Locale.ROOT).contains("zadanie ukończone")) return true;
			}
			return false;
		});
	}

	/** A slow breath (0-1, about two seconds) for what is ready: seen at a glance, never flashing. */
	private static float glow() {
		return 0.5f + 0.5f * (float) Math.sin(System.currentTimeMillis() / 350.0);
	}

	private static void frame(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		g.fill(x, y, x + w, y + 1, color);
		g.fill(x, y + h - 1, x + w, y + h, color);
		g.fill(x, y + 1, x + 1, y + h - 1, color);
		g.fill(x + w - 1, y + 1, x + w, y + h - 1, color);
	}

	/** The task as saved (with what the client counted on top), or the one on the slot when it is new. */
	private static SkyTaskParser.Task known(SkyTaskParser.Task t) {
		SkyTaskParser.Task saved = data().tasks.get(t.key());
		return saved != null ? saved : t;
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
			for (Item item : BuiltInRegistries.ITEM) {
				names.putIfAbsent(new ItemStack(item).getHoverName().getString().toLowerCase(Locale.ROOT), item);
				// and in Polish, as SkyUp writes its tasks, whatever language the game is in
				String pl = SkyCounters.plItem(item);
				if (!pl.isEmpty()) names.putIfAbsent(pl.toLowerCase(Locale.ROOT), item);
			}
		}
		return names.get(name.toLowerCase(Locale.ROOT));
	}

	/** How many of `thing` the player carries (by the name shown, or the game's item of that name); -1 when nothing tells. */
	/** "Piec przynajmniej Szczęście I": an item with an enchantment of at least that level. */
	private static final java.util.regex.Pattern AT_LEAST = java.util.regex.Pattern.compile("^(.+?)\\s+(?:przynajmniej|co najmniej|conajmniej)\\s+(.+?)\\s+([IVXL]+|\\d+)$");

	static int roman(String s) {
		if (s.matches("\\d+")) return Integer.parseInt(s);
		int n = 0, last = 0;
		for (int i = s.length() - 1; i >= 0; i--) {
			int v = switch (s.charAt(i)) { case 'I' -> 1; case 'V' -> 5; case 'X' -> 10; case 'L' -> 50; default -> 0; };
			n += v < last ? -v : v;
			last = Math.max(last, v);
		}
		return n;
	}

	/** The level of an enchantment named `name` (in the game's language or Polish) on a stack: a real one, or one written in its lore ("Szczęście II"); 0 when none. */
	static int enchantLevel(ItemStack stack, String name) {
		String want = name.toLowerCase(Locale.ROOT);
		int best = 0;
		for (var e : stack.getEnchantments().entrySet()) {
			var key = e.getKey().unwrapKey();
			String pl = key.isPresent() ? SkyCounters.pl("enchantment." + key.get().identifier().toLanguageKey()) : "";
			String own = net.minecraft.world.item.enchantment.Enchantment.getFullname(e.getKey(), 1).getString().replaceAll("\\s+[IVXL]+$", "");
			if (pl.equalsIgnoreCase(want) || own.equalsIgnoreCase(want)) best = Math.max(best, e.getIntValue());
		}
		java.util.regex.Pattern written = java.util.regex.Pattern.compile("(?i)" + java.util.regex.Pattern.quote(name) + "\\s+([IVXL]+|\\d+)\\b");
		for (Component line : SkyDump.lore(stack)) {
			java.util.regex.Matcher m = written.matcher(SkyTaskParser.plain(line.getString()));
			while (m.find()) best = Math.max(best, roman(m.group(1).toUpperCase(Locale.ROOT)));
		}
		return best;
	}

	static long carried(Minecraft mc, String thing) {
		if (mc.player == null || thing.isEmpty()) return -1;
		java.util.regex.Matcher least = AT_LEAST.matcher(thing.strip());
		if (least.matches()) {
			// "Piec przynajmniej Szczęście I": furnaces with Fortune I or better
			Item item = itemNamed(mc, least.group(1));
			if (item == null) return -1;
			int level = roman(least.group(3));
			Inventory inv = mc.player.getInventory();
			long n = 0;
			for (int i = 0; i < inv.getContainerSize(); i++) {
				if (i >= Inventory.INVENTORY_SIZE && i != Inventory.SLOT_OFFHAND) continue;
				ItemStack s = inv.getItem(i);
				if (s.is(item) && enchantLevel(s, least.group(2)) >= level) n += s.getCount();
			}
			return n;
		}
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
		// "Generator kamienia z 10 zużytymi punktami ulepszeń": the points read from the generator's window
		int points = SkyGenerator.needed(r.thing);
		if (points > 0 && r.current < 0) {
			int spent = SkyGenerator.spent();
			return spent < 0 ? -1 : spent >= points ? Math.max(1, r.required) : 0;
		}
		// "Inkubator kaktusów: 1 poz.": the level read from the incubator's window
		if (r.current < 0 && SkyIncubator.about(r.thing)) return SkyIncubator.level(r.thing);
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
		return !s.inventory() && (r.extra > 0 || (r.current < 0 && SkyCounters.kind(s) == SkyCounters.Kind.NEAR) || (r.current < 0 && SkyIncubator.about(r.thing))
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

	/** The tasks on the HUD: the ones ready to hand in first, then in the order they were seen. */
	static List<SkyTaskParser.Task> shown(Minecraft mc) {
		List<SkyTaskParser.Task> ready = new ArrayList<>(), rest = new ArrayList<>();
		HudConfig cfg = SlashHud.config;
		for (SkyTaskParser.Task t : data().tasks.values()) {
			if (!tracked(t)) continue;
			boolean done = ready(mc, t);
			if (cfg.skyTasksHideDone && done) continue;
			(done ? ready : rest).add(t);
		}
		ready.addAll(rest);
		// the daily task first: it is always on top of the list
		ready.sort(java.util.Comparator.comparing(t -> !daily(t)));
		return ready.size() > cfg.skyTasksMax ? new ArrayList<>(ready.subList(0, cfg.skyTasksMax)) : ready;
	}

	/** A value of a map keyed by category, whatever the letters' case (the menu's item and the GUI's title). */
	private static <V> V byTier(Map<String, V> map, String tier) {
		V v = map.get(tier);
		if (v != null) return v;
		for (var e : map.entrySet()) if (e.getKey().equalsIgnoreCase(tier)) return e.getValue();
		return null;
	}

	/** A category: how many of its tasks are left, and how many are ready to complete. */
	static int[] tierCount(Minecraft mc, String tier) {
		Data d = data();
		int left = 0, ready = 0;
		for (SkyTaskParser.Task t : d.tasks.values()) {
			if (!t.tier.equalsIgnoreCase(tier)) continue;
			left++;
			if (ready(mc, t)) ready++;
		}
		// the menu read after the category: its count is the newer one
		Integer menu = byTier(d.categories, tier);
		Long seen = byTier(d.tierSeen, tier);
		if (menu != null && menu >= 0 && d.categoriesSeen > (seen == null ? 0L : seen)) left = menu;
		return new int[] { left, ready };
	}

	/** The count shown is from this session (the category's GUI, or the menu, open since joining). */
	private static boolean fresh(String tier) {
		for (String t : readNow) if (t.equalsIgnoreCase(tier)) return true;
		return menuReadNow && byTier(data().categories, tier) != null;
	}

	/** A category whose GUI was never open: its tasks are not known yet (only how many, from the menu). */
	private static boolean unopened(String tier) {
		return byTier(data().tierSeen, tier) == null;
	}

	/**
	 * The categories with a row of their own: the ones tracked, in the menu's order; until the player
	 * tracks one, the one last open (when that setting is on).
	 */
	static List<String> headerTiers() {
		Data d = data();
		List<String> out = new ArrayList<>();
		if (d.trackedCategories != null) {
			for (String c : d.categories.keySet()) if (categoryTracked(c)) out.add(c);
			for (String c : d.trackedCategories) if (out.stream().noneMatch(c::equalsIgnoreCase)) out.add(c);
		} else if (SlashHud.config.skyTasksTierCount && !lastTier.isEmpty()) {
			out.add(lastTier);
		}
		return out;
	}

	// ---------- on the HUD ----------

	/** One row of the module: text on the left, text on the right, a bar under it (fill 0–1, or -1 for none). */
	private record Row(String left, int leftColor, String right, int rightColor, float bar, int indent, boolean ready, boolean badge) {
		Row(String left, int leftColor, String right, int rightColor, float bar, int indent) {
			this(left, leftColor, right, rightColor, bar, indent, false, false);
		}

		/** The same row on a ready task's green band. */
		Row lit() {
			return new Row(left, leftColor, right, rightColor, bar, indent, true, badge);
		}
	}

	/** The room the right text takes: a badge has its padding around it. */
	private static int rightWidth(Minecraft mc, Row r) {
		return r.right.isEmpty() ? 0 : mc.font.width(r.right) + (r.badge ? 6 : 0);
	}

	private static final int GOLD = 0xFFFACC15, GREY = 0xFF9CA3AF, GREEN = 0xFF4ADE80, WHITE = 0xFFE5E7EB;

	private static List<Row> rows(Minecraft mc, List<SkyTaskParser.Task> tasks) {
		HudConfig cfg = SlashHud.config;
		List<Row> out = new ArrayList<>();
		// the daily task on top, then each category's row with its tasks under it, then the tasks tracked on their own
		List<SkyTaskParser.Task> left = new ArrayList<>(tasks);
		List<SkyTaskParser.Task> dailies = new ArrayList<>();
		for (SkyTaskParser.Task t : left) if (daily(t)) dailies.add(t);
		left.removeAll(dailies);
		taskRows(mc, dailies, out);
		for (String tier : headerTiers()) {
			int[] c = tierCount(mc, tier);
			boolean fresh = fresh(tier), unopened = unopened(tier);
			// not looked at since joining: the last known counts from disk, marked "~" (or "not loaded" when none)
			boolean known = c[0] > 0 || byTier(data().categories, tier) != null || byTier(data().tierSeen, tier) != null;
			String counts = unopened ? Component.translatable("slashclient-hud.skyTasks.leftOnly", c[0]).getString()
				: Component.translatable("slashclient-hud.skyTasks.left", c[0], c[1]).getString();
			String right = fresh ? counts : known ? "~" + counts : Component.translatable("slashclient-hud.skyTasks.notLoaded").getString();
			out.add(new Row(tier, 0xFFA855F7, right, fresh ? GREY : 0xFFF59E0B, -1, 0));
			// tracked before it was ever open: the row at once, its tasks once the player looks inside
			if (unopened && categoryTracked(tier)) out.add(new Row(Component.translatable("slashclient-hud.skyTasks.openCategory").getString(), 0xFFF59E0B, "", 0, -1, 4));
			List<SkyTaskParser.Task> under = new ArrayList<>();
			for (SkyTaskParser.Task t : left) if (t.tier.equalsIgnoreCase(tier)) under.add(t);
			left.removeAll(under);
			taskRows(mc, under, out);
		}
		taskRows(mc, left, out);
		return out;
	}

	private static void taskRows(Minecraft mc, List<SkyTaskParser.Task> tasks, List<Row> out) {
		HudConfig cfg = SlashHud.config;
		long now = System.currentTimeMillis();
		for (SkyTaskParser.Task t : tasks) {
			boolean ready = ready(mc, t);
			int first = out.size();
			// its GUI not open since joining: the server's numbers are the last known ones, from disk
			boolean stale = !fresh(t.tier);
			boolean serverOnly = false;
			for (SkyTaskParser.Section s : t.sections) serverOnly |= !s.inventory() && !s.items.isEmpty();
			String age = "";
			if (!cfg.skyTasksCompact && serverOnly) {
				long min = (now - t.seen) / 60_000;
				age = min < 1 ? Component.translatable("slashclient-hud.skyTasks.now").getString() : Component.translatable("slashclient-hud.skyTasks.ago", min).getString();
			}
			// ready to hand in: "Oddaj!" on a green badge where the age would be
			if (ready) out.add(new Row("✔ " + t.name, GREEN, Component.translatable("slashclient-hud.skyTasks.handIn").getString(), 0xFFFFFFFF, -1, 0, false, true));
			else out.add(new Row(t.name, GOLD, age, 0xFF6B7280, -1, 0));
			// locked until another challenge is done
			if (!cfg.skyTasksCompact && !t.requires.isEmpty()) out.add(new Row(Component.translatable("slashclient-hud.skyTasks.requires", t.requires).getString(), 0xFFF87171, "", 0, -1, 4));
			for (SkyTaskParser.Section s : t.sections) {
				if (!cfg.skyTasksCompact && t.sections.size() > 1) out.add(new Row(s.header, GREY, "", 0, -1, 4));
				for (SkyTaskParser.Req r : s.items) {
					long c = current(mc, s, r);
					boolean met = met(mc, s, r);
					String progress = r.required < 0 ? r.unit
						: (c >= 0 ? (estimated(s, r) || (stale && !s.inventory()) ? "~" : "") + c + "/" : "") + r.required + (r.unit.isEmpty() ? "" : " " + r.unit);
					String thing = r.thing.equals(s.header) || r.thing.isEmpty() ? s.header : r.thing;
					float bar = cfg.skyTasksCompact || c < 0 || r.required <= 0 ? -1 : Math.min(1f, (float) c / r.required);
					// the generator's spent points: "~7/10 pkt" from its window (or a hint to open it)
					int points = SkyGenerator.needed(r.thing), spent = SkyGenerator.spent();
					// an incubator never opened: where to look
					if (r.current < 0 && c < 0 && SkyIncubator.about(r.thing)) progress = Component.translatable("slashclient-hud.skyTasks.openIncubator").getString();
					if (points > 0 && r.current < 0) {
						progress = spent < 0 ? Component.translatable("slashclient-hud.skyTasks.openGenerator").getString() : "~" + Math.min(spent, points) + "/" + points + " pkt";
						bar = cfg.skyTasksCompact || spent < 0 ? -1 : Math.min(1f, (float) spent / points);
					}
					out.add(new Row((met ? "✔ " : "• ") + thing, met ? 0xFF6B7280 : WHITE, progress, met ? GREEN : WHITE, bar, 6));
				}
			}
			if (cfg.skyTasksRewards && !t.rewards.isEmpty()) out.add(new Row(Component.translatable("slashclient-hud.skyTasks.reward", String.join(", ", t.rewards)).getString(), 0xFF60A5FA, "", 0, -1, 6));
			// the whole task on a green band (not in the compact mode: the badge says it there)
			if (ready && !cfg.skyTasksCompact) for (int i = first; i < out.size(); i++) out.set(i, out.get(i).lit());
		}
	}

	/** The module's widest (setting, 220 by default): longer task names and lines end with "…". */
	private static int maxWidth() {
		return Math.max(100, Math.min(320, SlashHud.config.skyTasksWidth));
	}

	private static int rowHeight(Minecraft mc, Row r) {
		return mc.font.lineHeight + 1 + (r.bar >= 0 ? 3 : 0);
	}

	private static int width(Minecraft mc, List<Row> rows) {
		int w = 80;
		for (Row r : rows) w = Math.max(w, r.indent + mc.font.width(r.left) + (r.right.isEmpty() ? 0 : 8 + rightWidth(mc, r)));
		return Math.min(maxWidth(), w) + Modules.PAD * 2;
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
		float glow = glow();
		for (int i = 0; i < rows.size(); i++) {
			Row r = rows.get(i);
			int h = rowHeight(mc, r);
			// a task ready to hand in: a green band across its rows, a slowly breathing bar on its left edge
			if (r.ready) {
				g.fill(x + 1, row - 1, x + Modules.PAD * 2 + w - 1, row + h - 1, 0x2E22C55E);
				g.fill(x + 1, row - 1, x + 2, row + h - 1, Ui.blend(0xFF16A34A, 0xFF86EFAC, glow));
			}
			int room = w - r.indent - (r.right.isEmpty() ? 0 : rightWidth(mc, r) + 8);
			int over = mc.font.width(r.left) - room;
			if (over > 0 && SlashHud.config.skyTasksScroll) {
				// too long: it slides along and back (as in the Spotify module), each row on its own clock
				SpotifyModule.slide(g, mc, r.left, left + r.indent, row, room, Modules.color(r.leftColor), Modules.shadow(), Ui.marqueeShift("skytasks:" + r.left, over));
			} else {
				String text = over > 0 ? mc.font.plainSubstrByWidth(r.left, room - mc.font.width("…")) + "…" : r.left;
				Modules.text(g, mc, text, left + r.indent, row, r.leftColor);
			}
			if (r.badge) {
				int bw = rightWidth(mc, r), bx = left + w - bw;
				Ui.round(g, bx, row - 1, bw, mc.font.lineHeight + 1, 2, 0xFF16A34A);
				g.text(mc.font, r.right, bx + 3, row, r.rightColor, false);
			} else if (!r.right.isEmpty()) Modules.text(g, mc, r.right, left + w - mc.font.width(r.right), row, r.rightColor);
			if (r.bar >= 0) {
				int by = row + mc.font.lineHeight + 1, bx = left + r.indent + 8;
				g.fill(bx, by, left + w, by + 2, 0x80374151);
				g.fill(bx, by, bx + Math.round((left + w - bx) * r.bar), by + 2, r.bar >= 1 ? GREEN : 0xFF60A5FA);
			}
			row += h;
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
			if (!shown(mc).isEmpty()) return true;
			// a tracked category shows even with nothing loaded or left; the one last open only with tasks left
			if (data().trackedCategories != null) return !headerTiers().isEmpty();
			return SlashHud.config.skyTasksTierCount && !lastTier.isEmpty() && tierCount(mc, lastTier)[0] > 0;
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

	/** For the test: saved, forgotten and read back from the account's own file ("tasks before, after, file"). */
	/** For the test: the HUD's rows as right after joining (nothing read yet this session). */
	static String staleRowsForTest(Minecraft mc) {
		readNow.clear();
		menuReadNow = false;
		return debugRows(mc);
	}

	static String reloadForTest() {
		save();
		int before = data().tasks.size();
		data = null;
		return before + " " + data().tasks.size() + " " + file().getFileName();
	}

	static void resetForTest() {
		data = new Data();
		loadedFrom = file();
		readNow.clear();
		menuReadNow = false;
		lastTier = "";
	}

	/** The module's rows as text ("left | right"), one per line. */
	static String debugRows(Minecraft mc) {
		StringBuilder out = new StringBuilder();
		for (Row r : rows(mc, shown(mc))) out.append(r.left).append(" | ").append(r.right).append(r.ready ? " [lit]" : "").append('\n');
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
		for (SkyTaskParser.Task t : data().tasks.values()) if (tracked(t)) out.add(t.key());
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
