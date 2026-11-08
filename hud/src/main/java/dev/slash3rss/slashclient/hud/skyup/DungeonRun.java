package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * One trip through a SkyUp dungeon, from its boss bar showing to the player leaving: how long it took, the
 * highest level, the rooms walked through, the spawners beaten (each time again), the loot opened and the ores
 * mined, the mobs killed (and how many of them elites and mini bosses), the dungeon XP got and what the player got. When it is over, a card with all that slides down under the
 * boss bars, and the trip is kept in a list (the dungeon map's settings, "Historia dungeonów").
 *
 * SkyUp does not say on the chat what drops, so what the player got is read from the game itself: items picked
 * up (the server's own "picked up" message, so a backpack that takes them at once counts too) and what is taken
 * out of the dungeon's chests, barrels and pots while they are open. What the player threw away and picked up
 * again does not count, nor what went from the inventory into a chest and back.
 */
public final class DungeonRun {
	private DungeonRun() {}

	/**
	 * An item got: its id, its look (a server's own model, Ui.look), the name it had and how many, and the item
	 * itself as the game saves it (`stack`, with the server's model on it; null in trips kept before it was).
	 */
	public record Gain(String id, String look, String name, int count, String stack) {}

	/**
	 * One trip, as shown and kept (`spawners`: each spawner beaten, its room emptied of mobs, every time again;
	 * `elites` and `bosses`: of the kills, the elites and the mini bosses; `xp`: the dungeon XP got, from its boss
	 * bar; 0 in trips kept before they were counted).
	 */
	public record Summary(long at, String level, long ms, int rooms, int cleared, int spawners, int loot, int ores, int kills, List<Gain> gains, int elites, int bosses, int xp) {}

	/** Shorter than this (a hint that came, a peek in): no card, nothing kept. */
	static long minMs = 20_000;
	private static final int KEPT = 100;
	private static final long IN = 350, SHOW = 15_000, OUT = 300;
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-dungeons.json");
	private static final Gson GSON = new GsonBuilder().create();

	private static boolean running;
	private static long startedAt;
	private static String level = "";
	private static int rooms, spawners, loot, ores, kills, elites, bosses;
	/** The dungeon XP from level 1 when the trip began and now (-1: not read yet). */
	private static double xpFirst = -1, xpNow = -1;
	private static final Set<Long> cleared = new HashSet<>();
	private static final Map<String, Integer> gained = new LinkedHashMap<>();
	private static final Map<String, ItemStack> looks = new HashMap<>();
	/** What the player threw away in the dungeon, by kind: picked up again, it is not loot. */
	private static final Map<String, Integer> thrown = new HashMap<>();

	// a dungeon container's screen open: the inventory before, what left it for the container, what came in from the ground
	private static Screen lootScreen;
	private static Map<String, Integer> lootBefore;
	private static final Map<String, Integer> lootOut = new HashMap<>();
	private static final Map<String, Integer> pickedMeanwhile = new HashMap<>();

	private static List<Summary> history;
	private static Summary shown;
	private static long shownAt = -1;

	// ---------- the trip ----------

	/** The boss bar is there: a trip begins (or goes on). */
	static void begin() {
		if (running) return;
		running = true;
		startedAt = System.currentTimeMillis();
		level = "";
		rooms = spawners = loot = ores = kills = elites = bosses = 0;
		xpFirst = xpNow = -1;
		cleared.clear();
		gained.clear();
		looks.clear();
		thrown.clear();
		lootScreen = null;
	}

	public static boolean running() {
		return running;
	}

	/** The level on the boss bar: the highest one counts. */
	static void level(String l) {
		if (!running || l == null || l.isEmpty()) return;
		try {
			if (level.isEmpty() || Integer.parseInt(l) > Integer.parseInt(level)) level = l;
		} catch (NumberFormatException e) {
			level = l;
		}
	}

	/** The player left (or the boss bar went): the card, and the trip kept. Out of a world, nothing is shown. */
	static void end(boolean inWorld) {
		if (!running) return;
		running = false;
		lootScreen = null;
		long ms = System.currentTimeMillis() - startedAt;
		if (!inWorld || ms < minMs) return;
		List<Gain> gains = new ArrayList<>();
		for (var e : gained.entrySet()) {
			ItemStack s = looks.get(e.getKey());
			if (s == null || e.getValue() <= 0) continue;
			gains.add(new Gain(BuiltInRegistries.ITEM.getKey(s.getItem()).toString(), Ui.look(s), s.getHoverName().getString(), e.getValue(), encode(s)));
		}
		gains.sort((a, b) -> Integer.compare(b.count(), a.count()));
		Summary s = new Summary(System.currentTimeMillis(), level, ms, rooms, cleared.size(), spawners, loot, ores, kills, List.copyOf(gains), elites, bosses, xpFirst < 0 ? 0 : (int) Math.max(0, Math.round(xpNow - xpFirst)));
		List<Summary> list = new ArrayList<>(history());
		list.add(0, s);
		while (list.size() > KEPT) list.remove(list.size() - 1);
		history = list;
		save();
		if (SlashHud.config.dungeonSummary) {
			shown = s;
			shownAt = System.currentTimeMillis();
		}
	}

	/**
	 * The dungeon's boss bar: its level and how full it is. The XP counts from level 1 (every level before taken
	 * whole, DungeonMap.xpNeeded), so a level gone up on the way counts what it took.
	 */
	static void xp(int level, float progress) {
		if (!running || level < 1) return;
		double all = 0;
		for (int l = 1; l < level; l++) all += DungeonMap.xpNeeded(l);
		all += Math.max(0f, Math.min(1f, progress)) * DungeonMap.xpNeeded(level);
		if (xpFirst < 0) xpFirst = all;
		xpNow = all;
	}

	/** Rooms walked through so far (the start room not counted): the most seen in the trip. */
	static void rooms(int visited) {
		if (running) rooms = Math.max(rooms, visited);
	}

	/**
	 * A room emptied of its mobs, by its middle: the room counts once however often it fills again, but each of
	 * its spawners counts as beaten every time.
	 */
	static void cleared(int x, int z, int spawnersInRoom) {
		if (!running) return;
		cleared.add(((long) (x >> 2) << 32) ^ (z >> 2 & 0xFFFFFFFFL));
		spawners += Math.max(1, spawnersInRoom);
	}

	/** A chest, barrel or pot opened or broken, or an ore mined, for the first time. */
	static void took(boolean ore) {
		if (!running) return;
		if (ore) ores++;
		else loot++;
	}

	/** Mobs the player killed (SkyCounters), of their class as the dungeon map tells it (DungeonMap.kind: 2 elite, 3 mini boss). */
	public static void killed(int amount, int kind) {
		if (!running) return;
		kills += amount;
		if (kind == 2) elites += amount;
		if (kind == 3) bosses += amount;
	}

	// ---------- what the player got ----------

	private static String kind(ItemStack s) {
		return BuiltInRegistries.ITEM.getKey(s.getItem()) + Ui.look(s);
	}

	private static void gain(ItemStack like, int n) {
		if (n <= 0) return;
		String k = kind(like);
		gained.merge(k, n, Integer::sum);
		looks.putIfAbsent(k, one(like));
	}

	private static ItemStack one(ItemStack s) {
		ItemStack c = s.copy();
		c.setCount(1);
		return c;
	}

	/** The server says the player picked up an item (the ground, a broken pot, a mob's drop). */
	public static void pickedUp(ItemStack stack, int amount) {
		if (!running || stack.isEmpty() || amount <= 0) return;
		String k = kind(stack);
		// thrown away before and picked up again: not loot
		int back = Math.min(amount, thrown.getOrDefault(k, 0));
		if (back > 0) thrown.merge(k, -back, Integer::sum);
		gain(stack, amount - back);
		// a dungeon chest open meanwhile: its inventory change is this pickup, not loot of the chest
		if (lootScreen != null) pickedMeanwhile.merge(k, amount, Integer::sum);
	}

	/** The player throws away items (Q, or out of the inventory's window). */
	public static void threw(ItemStack stack, int count) {
		if (!running || stack.isEmpty() || count <= 0) return;
		thrown.merge(kind(stack), Math.min(count, stack.getCount()), Integer::sum);
	}

	/** A click in an open window that throws: Q on a slot, or the item held by the mouse let go outside it. */
	public static void clicked(Player player, int slotId, int button, String input) {
		if (!running || player == null) return;
		var menu = player.containerMenu;
		if ("THROW".equals(input) && slotId >= 0 && slotId < menu.slots.size()) {
			ItemStack s = menu.slots.get(slotId).getItem();
			threw(s, button == 1 ? s.getCount() : 1);
		} else if ("PICKUP".equals(input) && slotId == -999) {
			ItemStack s = menu.getCarried();
			threw(s, button == 0 ? s.getCount() : 1);
		}
	}

	/** Each tick a dungeon container's screen is open (DungeonRooms.watchOpening): what the player takes out of it. */
	static void lootOpen(Minecraft mc, Screen screen) {
		if (!running || mc.player == null) return;
		if (screen != lootScreen) {
			lootScreen = screen;
			lootBefore = carried(mc.player);
			lootOut.clear();
			pickedMeanwhile.clear();
		}
	}

	private static Map<String, Integer> carried(Player p) {
		Map<String, Integer> out = new HashMap<>();
		var inv = p.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) count(out, inv.getItem(i));
		// the item held by the mouse: taken out of the chest already, not yet put down
		count(out, p.containerMenu.getCarried());
		return out;
	}

	private static void count(Map<String, Integer> out, ItemStack s) {
		if (s.isEmpty()) return;
		String k = kind(s);
		out.merge(k, s.getCount(), Integer::sum);
		looks.putIfAbsent(k, one(s));
	}

	/** Each tick: the dungeon container's screen still open, what came in since the last tick. */
	public static void tick(Minecraft mc) {
		if (lootScreen == null) return;
		if (!running || mc.player == null || Compat.screen(mc) != lootScreen) {
			lootScreen = null;
			return;
		}
		Map<String, Integer> now = carried(mc.player);
		Set<String> kinds = new HashSet<>(now.keySet());
		kinds.addAll(lootBefore.keySet());
		for (String k : kinds) {
			int d = now.getOrDefault(k, 0) - lootBefore.getOrDefault(k, 0);
			if (d < 0) lootOut.merge(k, -d, Integer::sum);
			else if (d > 0) {
				// the player's own items put in and taken back, or a pickup the server already told: not the chest's loot
				int back = Math.min(d, lootOut.getOrDefault(k, 0));
				lootOut.merge(k, -back, Integer::sum);
				int picked = Math.min(d - back, pickedMeanwhile.getOrDefault(k, 0));
				pickedMeanwhile.merge(k, -picked, Integer::sum);
				ItemStack like = looks.get(k);
				if (like != null) gain(like, d - back - picked);
			}
		}
		lootBefore = now;
	}

	// ---------- the list ----------

	public static List<Summary> history() {
		if (history == null) {
			history = List.of();
			try {
				if (Files.exists(FILE)) {
					List<Summary> read = GSON.fromJson(Files.readString(FILE), new TypeToken<List<Summary>>() {}.getType());
					if (read != null) history = read.stream().filter(s -> s != null && s.gains() != null).toList();
				}
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: dungeon history: {}", e.toString());
			}
		}
		return history;
	}

	private static void save() {
		try {
			Path tmp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
			Files.writeString(tmp, GSON.toJson(history));
			Files.move(tmp, FILE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: dungeon history: {}", e.toString());
		}
	}

	/** "12:40", or "1:02:05" for over an hour. */
	public static String time(long ms) {
		long s = ms / 1000;
		return s >= 3600 ? String.format("%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String.format("%d:%02d", s / 60, s % 60);
	}

	/** "Dungeon poz. 3 · podsumowanie" on the card; on the list only the level. */
	public static Component title(Summary s, boolean card) {
		boolean known = s.level() != null && !s.level().isEmpty();
		if (!card) return known ? Ui.trBold("slashclient-hud.dungeon.level", s.level()) : Ui.trBold("slashclient-hud.dungeon");
		return known ? Ui.trBold("slashclient-hud.dungeon.sum.title", s.level()) : Ui.trBold("slashclient-hud.dungeon.sum.titleNoLevel");
	}

	/** The lines under the title, each with its item: the time, then only the numbers that are not 0. */
	public static List<Map.Entry<Item, Component>> lines(Summary s) {
		List<Map.Entry<Item, Component>> out = new ArrayList<>();
		out.add(Map.entry(Items.CLOCK, Ui.tr("slashclient-hud.dungeon.sum.time", time(s.ms()))));
		line(out, Items.MOSSY_STONE_BRICKS, "rooms", s.rooms());
		line(out, Items.SPAWNER, "spawners", s.spawners());
		line(out, Items.CHEST, "loot", s.loot());
		line(out, Items.DEEPSLATE_IRON_ORE, "ores", s.ores());
		line(out, Items.IRON_SWORD, "kills", s.kills());
		line(out, Items.GOLDEN_SWORD, "elites", s.elites());
		line(out, Items.WITHER_SKELETON_SKULL, "bosses", s.bosses());
		line(out, Items.EXPERIENCE_BOTTLE, "xp", s.xp());
		return out;
	}

	private static void line(List<Map.Entry<Item, Component>> out, Item item, String key, int n) {
		if (n != 0) out.add(Map.entry(item, Ui.tr("slashclient-hud.dungeon.sum." + key, n)));
	}

	private static final Map<String, ItemStack> decoded = new HashMap<>();

	/** A kept item as a stack to draw: as it was got (a server's model on it), or the plain item when that cannot be read. */
	public static ItemStack stackOf(Gain g) {
		if (g.stack() != null) {
			ItemStack s = decoded.get(g.stack());
			if (s == null) {
				s = decode(g.stack());
				if (!s.isEmpty()) decoded.put(g.stack(), s);
			}
			if (!s.isEmpty()) return s;
		}
		var id = net.minecraft.resources.Identifier.tryParse(g.id());
		Item item = id == null ? Items.AIR : BuiltInRegistries.ITEM.getOptional(id).orElse(Items.AIR);
		return item == Items.AIR ? ItemStack.EMPTY : new ItemStack(item);
	}

	/** One of the item as the game saves it (with its components: the server's model, its name), without its lore. */
	static String encode(ItemStack stack) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null || stack.isEmpty()) return null;
		try {
			ItemStack plain = one(stack);
			//#if MC >= 1.20.5
			plain.remove(net.minecraft.core.component.DataComponents.LORE);
			var ops = mc.level.registryAccess().createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE);
			return ItemStack.CODEC.encodeStart(ops, plain).result().map(Object::toString).orElse(null);
			//#else
			//$ return plain.save(new net.minecraft.nbt.CompoundTag()).toString();
			//#endif
		} catch (Exception e) {
			return null;
		}
	}

	/** The item back from `encode`; empty out of a world (the game's registries are needed) or when it cannot be read. */
	static ItemStack decode(String saved) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return ItemStack.EMPTY;
		try {
			//#if MC >= 1.20.5
			var ops = mc.level.registryAccess().createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE);
			return ItemStack.CODEC.parse(ops, com.google.gson.JsonParser.parseString(saved)).result().orElse(ItemStack.EMPTY);
			//#else
			//$ return ItemStack.of(net.minecraft.nbt.TagParser.parseTag(saved));
			//#endif
		} catch (Exception e) {
			return ItemStack.EMPTY;
		}
	}

	/** The item the trip got, as it looked (in the card) or as kept (in the list). */
	private static ItemStack picture(Gain g) {
		ItemStack s = looks.get(g.id() + g.look());
		return s != null ? s : stackOf(g);
	}

	/** Items in a row, each with its count, as many as fit in `w`; how wide it came out. */
	public static int items(GuiGraphicsExtractor g, List<Gain> gains, int x, int y, int w, boolean live) {
		int n = Math.max(1, w / 20), cx = x;
		for (int i = 0; i < Math.min(n, gains.size()); i++) {
			Gain gain = gains.get(i);
			ItemStack s = live ? picture(gain) : stackOf(gain);
			if (!s.isEmpty()) g.item(s, cx, y);
			Component c = Ui.text(gain.count() >= 1000 ? gain.count() / 1000 + "k" : String.valueOf(gain.count()));
			Ui.draw(g, c, cx + 17 - Ui.width(c), y + 9, Ui.TEXT);
			cx += 20;
		}
		if (gains.size() > n) Ui.draw(g, Ui.text("+" + (gains.size() - n)), cx - 2, y + 4, Ui.MUTED);
		return cx - x;
	}

	// ---------- the card ----------

	public static boolean showing() {
		return shown != null && shownAt >= 0 && System.currentTimeMillis() - shownAt < IN + SHOW + OUT;
	}

	public static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		if (shown == null || shownAt < 0) return;
		long age = System.currentTimeMillis() - shownAt;
		if (age >= IN + SHOW + OUT) {
			shown = null;
			return;
		}
		float in = ease(Math.min(1f, (float) age / IN));
		float out = age > IN + SHOW ? ease((float) (age - IN - SHOW) / OUT) : 0f;
		int light = 0xFFFFA94D, dark = 0xFFB45309;
		List<Map.Entry<Item, Component>> lines = lines(shown);
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		int w = Math.min(300, sw - 16), rows = (lines.size() + 1) / 2;
		int h = 34 + rows * 18 + 6 + 14 + 22;
		int at = Math.max(30, sh / 9);
		int x = (sw - w) / 2, y = Math.round(-h - 4 + (at + h + 4) * (in - out));

		Ui.round(g, x, y, w, h, 7, Ui.PANEL);
		Ui.roundOutline(g, x, y, w, h, 7, light & 0x80FFFFFF);
		Ui.roundGradient(g, x + 7, y + 7, 22, 22, 6, light, dark);
		g.item(new ItemStack(Items.SPAWNER), x + 10, y + 10);
		Ui.draw(g, Ui.fit(title(shown, true), w - 45), x + 37, y + 8, light);
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.dungeon.sum.left"), w - 45), x + 37, y + 20, Ui.TEXT_2);
		int ty = y + 36, colW = (w - 16) / 2;
		for (int i = 0; i < lines.size(); i++) {
			int cx = x + 8 + (i % 2) * colW, cy = ty + (i / 2) * 18;
			g.item(new ItemStack(lines.get(i).getKey()), cx, cy);
			Ui.draw(g, Ui.fit(lines.get(i).getValue(), colW - 22), cx + 19, cy + 4, Ui.TEXT);
		}
		int gy = ty + rows * 18 + 4;
		Ui.draw(g, Ui.trBold(shown.gains().isEmpty() ? "slashclient-hud.dungeon.sum.nothing" : "slashclient-hud.dungeon.sum.gained"), x + 8, gy, Ui.TEXT_2);
		items(g, shown.gains(), x + 8, gy + 12, w - 16, true);
		float left = Math.max(0f, Math.min(1f, 1f - (float) (age - IN) / SHOW));
		g.fill(x + 8, y + h - 3, x + 8 + Math.round((w - 16) * left), y + h - 2, light);
	}

	private static float ease(float t) {
		float u = 1f - t;
		return 1f - u * u * u;
	}

	// ---------- for the tests ----------

	/** For the test: a trip counts from any length, and the list in memory starts empty. */
	public static void quickForTest() {
		minMs = 0;
		history = new ArrayList<>();
	}

	/** For the test: the last trip's items as the list draws them (read back from the file's form), "*" with a server's model. */
	public static String keptLooksForTest() {
		decoded.clear();
		StringBuilder out = new StringBuilder();
		for (Gain g : history().get(0).gains()) {
			ItemStack s = stackOf(g);
			out.append(out.isEmpty() ? "" : " ").append(BuiltInRegistries.ITEM.getKey(s.getItem()).getPath()).append(Ui.look(s).isEmpty() ? "" : "*");
		}
		return out.toString();
	}

	/** For the test: the spawners beaten so far in this trip. */
	public static int spawnersForTest() {
		return spawners;
	}

	/** For the test: the last trip kept, "level rooms loot gains". */
	public static String lastForTest() {
		if (history().isEmpty()) return "";
		Summary s = history().get(0);
		StringBuilder out = new StringBuilder("poz. " + s.level() + ", loot " + s.loot() + ", kills " + s.kills() + "/" + s.elites() + "/" + s.bosses() + ", xp " + s.xp() + ", got");
		for (Gain g : s.gains()) out.append(' ').append(g.id().replace("minecraft:", "")).append(g.look().isEmpty() ? "" : "*").append(' ').append(g.count());
		return out.toString();
	}
}
