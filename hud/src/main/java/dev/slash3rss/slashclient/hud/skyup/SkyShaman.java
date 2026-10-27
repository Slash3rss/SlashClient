// SkyUp's shamanism is played on 26.3: the helper is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.HudModule;
import dev.slash3rss.slashclient.hud.Modules;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SkyUp's shamanism (skyup.pl/wiki/szamanstwo) for its tasks ("Przyzwij: Wiedźma 0/1"): each mob's
 * recipe – the wand in hand, the main item in the other hand, the experience level and the materials
 * carried – shown under the task with what the player has, and each summon counted. The recipes are
 * read from SkyUp's own window ("Szamaństwo") whenever it is open, so new mobs and changed amounts
 * come by themselves (the list below is for a window never opened); there the middle button or the
 * track key marks mobs, which the module "skyshaman" shows with what is still missing. SkyUp's line for
 * a summon ("Szamaństwo » To… to… TO ŻYJE!!!") does not name the mob: it is the one whose main item
 * was in the other hand at the right click on the campfire just before.
 */
public final class SkyShaman {
	private SkyShaman() {}

	/** A mob: how tasks name it (and the wiki), its wand, main item, level and materials (item id → how many). */
	record Mob(List<String> names, String wand, String main, int level, Map<String, Integer> materials) {}

	private static Map<String, Integer> m(Object... pairs) {
		Map<String, Integer> out = new LinkedHashMap<>();
		for (int i = 0; i + 1 < pairs.length; i += 2) out.put((String) pairs[i], (Integer) pairs[i + 1]);
		return out;
	}

	/** Grade III's three last mobs need the same; kept once. */
	private static final Map<String, Integer> HOOVES = m("porkchop", 128, "beef", 256, "bone", 64, "hay_block", 128, "apple", 64, "sugar", 128, "emerald", 16);

	static final List<Mob> MOBS = List.of(
		// I: a campfire, a stick (the witch: a redstone torch)
		new Mob(List.of("Wiedźma"), "redstone_torch", "glass_bottle", 10, m("rotten_flesh", 20, "bone", 10)),
		new Mob(List.of("Bałwan"), "stick", "iron_shovel", 15, m("coal", 16, "carrot", 1, "stick", 2)),
		new Mob(List.of("Świnia"), "stick", "carrot_on_a_stick", 15, m("bone", 16, "wheat", 128)),
		new Mob(List.of("Kura", "Kurczak"), "stick", "hay_block", 15, m("porkchop", 16, "bone", 8, "wheat_seeds", 256)),
		new Mob(List.of("Królik"), "stick", "golden_carrot", 15, m("porkchop", 16, "bone", 8, "carrot", 128)),
		new Mob(List.of("Krowa"), "stick", "short_grass", 15, m("porkchop", 64, "bone", 16, "wheat", 128)),
		new Mob(List.of("Owca"), "stick", "shears", 15, m("porkchop", 64, "bone", 16, "wheat", 128, "string", 32)),
		// II: a blaze rod
		new Mob(List.of("Kot"), "blaze_rod", "string", 30, m("porkchop", 64, "bone", 16, "brown_wool", 32, "black_wool", 32, "white_wool", 32, "orange_wool", 32, "light_gray_wool", 32, "emerald", 1)),
		new Mob(List.of("Wilk"), "blaze_rod", "lead", 30, m("beef", 64, "porkchop", 64, "bone", 128, "rabbit_hide", 64, "emerald", 1)),
		new Mob(List.of("Delfin"), "blaze_rod", "tube_coral", 30, m("porkchop", 128, "bone", 32, "tube_coral_block", 64, "emerald", 1)),
		new Mob(List.of("Koza"), "blaze_rod", "leather", 30, m("white_wool", 128, "mutton", 128, "short_grass", 16, "bone", 64, "oxeye_daisy", 16)),
		new Mob(List.of("Żółw"), "blaze_rod", "seagrass", 30, m("porkchop", 128, "bone", 64, "seagrass", 128, "kelp", 256, "sea_pickle", 16)),
		new Mob(List.of("Lis"), "blaze_rod", "sweet_berries", 30, m("porkchop", 128, "rabbit", 64, "bone", 64, "sweet_berries", 256, "black_wool", 128, "orange_wool", 128)),
		new Mob(List.of("Pszczoła"), "blaze_rod", "sugar", 30, m("yellow_wool", 64, "black_wool", 64, "sugar", 320, "dandelion", 16, "poppy", 16, "oxeye_daisy", 16, "cornflower", 16)),
		new Mob(List.of("Pancernik"), "blaze_rod", "shield", 30, m("mutton", 128, "bone", 64, "brown_concrete", 16, "brown_terracotta", 16, "leather", 32)),
		// III: a soul campfire, an end rod
		new Mob(List.of("Lama"), "end_rod", "yellow_carpet", 40, m("porkchop", 128, "mutton", 256, "bone", 64, "brown_wool", 128, "yellow_wool", 128, "white_wool", 128, "gray_wool", 128, "emerald", 16)),
		new Mob(List.of("Niedźwiedź polarny"), "end_rod", "packed_ice", 40, m("porkchop", 128, "mutton", 128, "beef", 128, "bone", 64, "packed_ice", 64, "gray_wool", 256, "white_wool", 256, "emerald", 16)),
		new Mob(List.of("Osioł"), "end_rod", "chest", 40, HOOVES),
		new Mob(List.of("Koń"), "end_rod", "saddle", 40, HOOVES),
		new Mob(List.of("Wielbłąd"), "end_rod", "sand", 40, HOOVES),
		new Mob(List.of("Panda"), "end_rod", "bamboo", 40, m("porkchop", 128, "mutton", 128, "beef", 128, "bone", 64, "bamboo", 512, "black_wool", 256, "white_wool", 256, "emerald", 16)),
		new Mob(List.of("Żaba"), "end_rod", "slime_ball", 40, m("slime_ball", 128, "kelp", 256, "leather", 64, "bone", 32, "emerald", 16, "lily_pad", 16)),
		new Mob(List.of("Papuga"), "end_rod", "egg", 40, m("chicken", 128, "egg", 128, "wheat_seeds", 256, "feather", 128, "red_dye", 64, "blue_dye", 64, "lime_dye", 64, "cyan_dye", 64, "gray_dye", 64, "emerald", 16)),
		new Mob(List.of("Aksolotl"), "end_rod", "tropical_fish_bucket", 50, m("rotten_flesh", 256, "bone", 64, "glow_berries", 32, "brown_dye", 64, "light_blue_dye", 64, "yellow_dye", 64, "pink_dye", 64, "blue_dye", 64, "emerald", 16)),
		new Mob(List.of("Niuchacz"), "end_rod", "torchflower", 50, m("blue_orchid", 64, "orange_tulip", 64, "cornflower", 64, "moss_block", 128, "turtle_helmet", 5, "emerald", 16)),
		new Mob(List.of("Łodzik"), "end_rod", "turtle_scute", 40, m("horn_coral_block", 4, "fire_coral_block", 4, "brain_coral_block", 4, "tube_coral_block", 4, "bubble_coral_block", 4,
			"seagrass", 16, "turtle_scute", 1, "emerald", 4)));

	/** The mob a task's requirement names ("Kura", "Niedźwiedź polarny"), or null: as SkyUp's window showed it, else from the list. */
	static Mob named(String thing) {
		String want = SkyCounters.norm(thing);
		for (Mob mob : all()) for (String n : mob.names()) if (SkyCounters.norm(n).equals(want)) return mob;
		return null;
	}

	/** An item the game does not know by the window's name: kept by that name ("name:Kość"). */
	private static final String BY_NAME = "name:";

	static Item item(String id) {
		if (id == null || id.startsWith(BY_NAME)) return null;
		return BuiltInRegistries.ITEM.getOptional(Identifier.withDefaultNamespace(id)).orElse(null);
	}

	/** An item's name in the game's language. */
	static String itemName(String id) {
		if (id.startsWith(BY_NAME)) return id.substring(BY_NAME.length());
		Item item = item(id);
		return item == null ? id : Component.translatable(item.getDescriptionId()).getString();
	}

	/** Whether a stack is that item (by name when the game does not know it). */
	private static boolean is(ItemStack stack, String id) {
		if (stack.isEmpty()) return false;
		if (id.startsWith(BY_NAME)) return SkyCounters.norm(stack.getHoverName().getString()).equals(SkyCounters.norm(id.substring(BY_NAME.length())));
		Item item = item(id);
		return item != null && stack.is(item);
	}

	/** How many of an item the player carries (hands included). */
	static int carried(Minecraft mc, String id) {
		if (mc.player == null) return 0;
		int n = 0;
		var inv = mc.player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) if (is(inv.getItem(i), id)) n += inv.getItem(i).getCount();
		return n;
	}

	/** The recipe as the tracker's lines: a mark per tool, then every material with how many are carried ("✔" once there are enough). */
	static List<String> recipe(Minecraft mc, Mob mob) {
		List<String> out = new ArrayList<>();
		if (mc.player == null) return out;
		Item wand = item(mob.wand()), main = item(mob.main());
		boolean wandOk = wand != null && mc.player.getMainHandItem().is(wand), mainOk = main != null && mc.player.getOffhandItem().is(main);
		boolean levelOk = mc.player.experienceLevel >= mob.level();
		out.add(Component.translatable("slashclient-hud.skyShaman.tools", (wandOk ? "✔ " : "✖ ") + itemName(mob.wand()), (mainOk ? "✔ " : "✖ ") + itemName(mob.main()),
			(levelOk ? "✔ " : "✖ ") + mob.level()).getString());
		for (var e : mob.materials().entrySet()) {
			int have = carried(mc, e.getKey());
			out.add((have >= e.getValue() ? "✔ " : "") + itemName(e.getKey()) + " " + Math.min(have, e.getValue()) + "/" + e.getValue());
		}
		return out;
	}

	// ---------- a summon counted ----------

	/** The mob being summoned (by the main item at the click on a campfire), and when. */
	private static Mob pending;
	private static long pendingAt;

	/** A right click: on a campfire with a known wand, the mob of the main item in the other hand is the one coming. */
	public static void used(Minecraft mc) {
		if (mc.player == null || !(mc.hitResult instanceof BlockHitResult hit) || hit.getType() != HitResult.Type.BLOCK || mc.level == null) return;
		String block = BuiltInRegistries.BLOCK.getKey(mc.level.getBlockState(hit.getBlockPos()).getBlock()).getPath();
		if (!block.endsWith("campfire")) return;
		ItemStack hand = mc.player.getMainHandItem(), other = mc.player.getOffhandItem();
		for (Mob mob : all()) {
			if (is(hand, mob.wand()) && is(other, mob.main())) {
				pending = mob;
				pendingAt = System.currentTimeMillis();
				return;
			}
		}
	}

	/** SkyUp's line in the chat: "Szamaństwo » To… to… TO ŻYJE!!!" counts the mob summoned just before. */
	static void onChat(String plain) {
		String lower = plain.toLowerCase(Locale.ROOT);
		if (!lower.contains("szamaństwo") || !lower.contains("żyje")) return;
		if (pending == null || System.currentTimeMillis() - pendingAt > 5000) return;
		SkyCounters.add(SkyCounters.Kind.SUMMON, SkyCounters.Thing.of(false, false, false, false, pending.names().toArray(String[]::new)), 1);
		pending = null;
	}

	// ---------- recipes read from SkyUp's window, and the mobs tracked ----------

	/** A recipe as the window shows it: the mob, how many come, the wand, the main item, the level and the materials (item ids, or "name:…"). */
	static final class Learned {
		String name = "";
		int count = 1, level;
		String wand = "", main = "";
		Map<String, Integer> materials = new LinkedHashMap<>();

		boolean same(Learned o) {
			return o != null && name.equals(o.name) && count == o.count && level == o.level && wand.equals(o.wand) && main.equals(o.main) && materials.equals(o.materials);
		}
	}

	/** What is saved: the recipes seen (by the mob's name, in the window's order) and the mobs tracked. */
	static final class Data {
		Map<String, Learned> recipes = new LinkedHashMap<>();
		List<String> tracked = new ArrayList<>();
	}

	static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("szamanstwo.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Data data;

	static Data data() {
		if (data == null) {
			try {
				if (Files.exists(FILE)) data = GSON.fromJson(Files.readString(FILE), Data.class);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp shamanism: {}", e.toString());
			}
			if (data == null) data = new Data();
			if (data.recipes == null) data.recipes = new LinkedHashMap<>();
			if (data.tracked == null) data.tracked = new ArrayList<>();
		}
		return data;
	}

	private static void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(data()));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: SkyUp shamanism: {}", e.toString());
		}
	}

	/** A learned recipe as a mob: its name, and the list's names for the same wand and main item ("Śnieżny golem" is the tasks' "Bałwan"). */
	private static Mob mob(Learned l) {
		List<String> names = new ArrayList<>(List.of(l.name));
		for (Mob m : MOBS) if (m.wand().equals(l.wand) && m.main().equals(l.main)) for (String n : m.names()) if (!names.contains(n)) names.add(n);
		return new Mob(names, l.wand, l.main, l.level, l.materials);
	}

	/** Every recipe known: the window's first, then the list's mobs the window has not shown. */
	static List<Mob> all() {
		List<Mob> out = new ArrayList<>();
		for (Learned l : data().recipes.values()) out.add(mob(l));
		for (Mob m : MOBS) {
			boolean shown = false;
			for (Mob o : out) if (o.names().contains(m.names().get(0))) shown = true;
			if (!shown) out.add(m);
		}
		return out;
	}

	/** How many a recipe summons (the window says "2 x Świnia"; 1 when only the list knows it). */
	static int count(Mob mob) {
		Learned l = data().recipes.get(mob.names().get(0));
		return l == null ? 1 : l.count;
	}

	/** SkyUp's shamanism window ("Szamaństwo"). */
	static boolean window(AbstractContainerScreen<?> screen) {
		return SkyTaskParser.plain(screen.getTitle().getString()).toLowerCase(Locale.ROOT).contains("szamaństwo");
	}

	private static final Pattern NAME = Pattern.compile("^(\\d+)\\s*x\\s+(.+)$");
	private static final Pattern MATERIAL = Pattern.compile("^(.+?):\\s*([\\d  ]+)$");
	private static final Map<ItemStack, java.util.Optional<Learned>> READ = new java.util.WeakHashMap<>();

	/** A mob's recipe from its item in the window ("» 1 x Wiedźma «", lore "▪ Różdżka » Pochodnia redstone", "» Kość: 10"); null for anything else. */
	static Learned read(Minecraft mc, ItemStack stack) {
		if (stack.isEmpty()) return null;
		return READ.computeIfAbsent(stack, s -> {
			List<String> lines = new ArrayList<>();
			for (Component c : SkyDump.lore(s)) lines.add(SkyTaskParser.plain(c.getString()).strip());
			if (lines.stream().noneMatch(l -> l.contains("Blok przywołujący"))) return java.util.Optional.empty();
			Learned r = new Learned();
			String name = SkyTaskParser.plain(s.getHoverName().getString()).replace("»", "").replace("«", "").strip();
			Matcher n = NAME.matcher(name);
			if (n.matches()) {
				r.count = Integer.parseInt(n.group(1));
				name = n.group(2).strip();
			}
			r.name = name;
			boolean materials = false;
			for (String l : lines) {
				String line = l.replaceFirst("^[▪•»\\s]+", "");
				int at = line.indexOf('»');
				String label = at < 0 ? line : line.substring(0, at).strip(), value = at < 0 ? "" : line.substring(at + 1).strip();
				if (label.startsWith("Różdżka")) r.wand = key(mc, value);
				else if (label.startsWith("Przedmiot główny")) r.main = key(mc, value);
				else if (label.startsWith("Doświadczenie")) r.level = Integer.parseInt("0" + value.replaceAll("\\D", ""));
				else if (label.startsWith("Potrzebne materiały")) materials = true;
				else if (materials) {
					Matcher m = MATERIAL.matcher(line);
					if (m.matches()) r.materials.merge(key(mc, m.group(1).strip()), Integer.parseInt(m.group(2).replaceAll("\\D", "")), Integer::sum);
				}
			}
			return r.wand.isEmpty() || r.main.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(r);
		}).orElse(null);
	}

	/** The item a window's name means (SkyUp writes in Polish, whatever language the game is in). */
	private static String key(Minecraft mc, String name) {
		Item item = SkyTasks.itemNamed(mc, name);
		return item == null ? BY_NAME + name : BuiltInRegistries.ITEM.getKey(item).getPath();
	}

	/** The window's recipe kept (and saved when new or changed). */
	private static void learn(Learned r) {
		Learned old = data().recipes.get(r.name);
		if (r.same(old)) return;
		data().recipes.put(r.name, r);
		save();
	}

	static boolean tracked(String name) {
		return data().tracked.contains(name);
	}

	public static void toggle(String name) {
		if (!data().tracked.remove(name)) data().tracked.add(name);
		save();
	}

	private static boolean on(Minecraft mc) {
		return SlashHud.config != null && SlashHud.config.placement("skyshaman").enabled && SkyTasks.onSkyUp(mc);
	}

	/** Everything a recipe takes is carried (the wand and the main item anywhere, the materials on top of them) and the level is there. */
	static boolean ready(Minecraft mc, Mob mob) {
		if (mc.player == null || mc.player.experienceLevel < mob.level()) return false;
		Map<String, Integer> need = new LinkedHashMap<>(mob.materials());
		need.merge(mob.wand(), 1, Integer::sum);
		need.merge(mob.main(), 1, Integer::sum);
		for (var e : need.entrySet()) if (carried(mc, e.getKey()) < e.getValue()) return false;
		return true;
	}

	/** Ready and held as the summon takes it: the wand in the main hand, the main item in the other. */
	static boolean summonable(Minecraft mc, Mob mob) {
		return ready(mc, mob) && is(mc.player.getMainHandItem(), mob.wand()) && is(mc.player.getOffhandItem(), mob.main());
	}

	/** The recipe under the mouse in the window, or null. */
	private static Learned hovered(AbstractContainerScreen<?> screen) {
		if (!window(screen)) return null;
		Slot slot = ((ContainerScreenAccessor) screen).slashclient$hoveredSlot();
		if (slot == null || slot.container instanceof Inventory) return null;
		return read(Minecraft.getInstance(), slot.getItem());
	}

	/** The middle button on a mob: tracks it (and the server never sees the click). */
	public static boolean click(AbstractContainerScreen<?> screen, net.minecraft.client.input.MouseButtonEvent e) {
		if (e.button() != InputConstants.MOUSE_BUTTON_MIDDLE || !on(Minecraft.getInstance())) return false;
		Learned r = hovered(screen);
		if (r == null) return false;
		toggle(r.name);
		return true;
	}

	/** The tasks' track key on a mob. */
	public static boolean key(AbstractContainerScreen<?> screen, net.minecraft.client.input.KeyEvent e) {
		if (SkyTasks.trackKey == null || !SkyTasks.trackKey.matches(e) || !on(Minecraft.getInstance())) return false;
		Learned r = hovered(screen);
		if (r == null) return false;
		toggle(r.name);
		return true;
	}

	/** The slots lit as ready on the last frame (for the test). */
	public static List<Integer> readySlots = List.of();

	/** Over the window: the recipes read, those with everything carried in green, the tracked ones with a gold corner, and what the key does. */
	public static void drawOver(AbstractContainerScreen<?> screen, GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (!on(mc) || !window(screen)) return;
		ContainerScreenAccessor at = (ContainerScreenAccessor) screen;
		boolean any = false;
		List<Integer> lit = new ArrayList<>();
		for (int i = 0; i < screen.getMenu().slots.size(); i++) {
			Slot slot = screen.getMenu().slots.get(i);
			if (slot.container instanceof Inventory) continue;
			Learned r = read(mc, slot.getItem());
			if (r == null) continue;
			any = true;
			learn(r);
			int sx = at.slashclient$leftPos() + slot.x, sy = at.slashclient$topPos() + slot.y;
			if (ready(mc, mob(r))) {
				lit.add(i);
				g.fill(sx, sy, sx + 16, sy + 16, 0x3822C55E);
				outline(g, sx - 1, sy - 1, 18, 18, 0xFF4ADE80);
			}
			if (!tracked(r.name)) continue;
			// a gold corner, top right (as a tracked task)
			for (int k = 0; k < 5; k++) g.fill(sx + 11 + k, sy + k, sx + 16, sy + k + 1, 0xFFFACC15);
		}
		readySlots = lit;
		if (!any) return;
		Learned r = hovered(screen);
		Component keyName = SkyTasks.trackKey == null ? Component.literal("?") : SkyTasks.trackKey.getTranslatedKeyMessage();
		Component hint = r == null ? Component.translatable("slashclient-hud.skyShaman.hint", keyName)
			: Component.translatable("slashclient-hud.skyShaman." + (tracked(r.name) ? "untrack" : "track"), keyName, r.name);
		int w = mc.font.width(hint) + 8;
		int x = at.slashclient$leftPos() + (at.slashclient$imageWidth() - w) / 2;
		int y = Math.min(screen.height - 14, at.slashclient$topPos() + at.slashclient$imageHeight() + 3);
		g.fill(x, y, x + w, y + 12, 0xE0101827);
		g.fill(x, y + 11, x + w, y + 12, r != null && tracked(r.name) ? 0xFFFACC15 : 0xFF60A5FA);
		g.text(mc.font, hint, x + 4, y + 2, 0xFFFFFFFF, false);
	}

	private static void outline(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		g.fill(x, y, x + w, y + 1, color);
		g.fill(x, y + h - 1, x + w, y + h, color);
		g.fill(x, y + 1, x + 1, y + h - 1, color);
		g.fill(x + w - 1, y + 1, x + w, y + h - 1, color);
	}

	// ---------- the module: the tracked mobs and what each still needs ----------

	private static final int GOLD = 0xFFFACC15, GREEN = 0xFF4ADE80, AMBER = 0xFFFBBF24, RED = 0xFFF87171, GREY = 0xFF9CA3AF;

	record Row(String left, int leftColor, String right, int rightColor, int indent) {}

	/** A tool's row: green in its hand, amber carried but not there, red not carried. */
	private static Row tool(Minecraft mc, String label, String id, boolean inHand) {
		boolean have = carried(mc, id) > 0;
		return new Row(Component.translatable(label).getString() + ": " + itemName(id), WHITE, inHand ? "✔" : have
			? Component.translatable("slashclient-hud.skyShaman.inBag").getString() : "✖", inHand ? GREEN : have ? AMBER : RED, 6);
	}

	private static final int WHITE = 0xFFFFFFFF;

	static List<Row> rows(Minecraft mc, List<Mob> mobs) {
		List<Row> out = new ArrayList<>();
		for (Mob mob : mobs) {
			int n = count(mob);
			boolean ready = mc.player != null && summonable(mc, mob);
			out.add(new Row(mob.names().get(0) + (n > 1 ? " ×" + n : ""), ready ? GREEN : GOLD, "", 0, 0));
			if (mc.player == null) continue;
			if (ready) {
				out.add(new Row(Component.translatable("slashclient-hud.skyShaman.ready").getString(), GREEN, "", 0, 6));
				continue;
			}
			out.add(tool(mc, "slashclient-hud.skyShaman.wand", mob.wand(), is(mc.player.getMainHandItem(), mob.wand())));
			out.add(tool(mc, "slashclient-hud.skyShaman.main", mob.main(), is(mc.player.getOffhandItem(), mob.main())));
			int level = mc.player.experienceLevel;
			out.add(new Row(Component.translatable("slashclient-hud.skyShaman.level").getString(), WHITE, Math.min(level, mob.level()) + "/" + mob.level(),
				level >= mob.level() ? GREEN : RED, 6));
			for (var e : mob.materials().entrySet()) {
				int have = carried(mc, e.getKey());
				boolean enough = have >= e.getValue();
				out.add(new Row(itemName(e.getKey()), enough ? GREY : WHITE, Math.min(have, e.getValue()) + "/" + e.getValue(), enough ? GREEN : RED, 6));
			}
		}
		return out;
	}

	public static final class Module implements HudModule {
		public String id() {
			return "skyshaman";
		}

		private static List<Mob> tracked() {
			List<Mob> out = new ArrayList<>();
			for (String name : data().tracked) {
				Mob mob = named(name);
				if (mob != null) out.add(mob);
			}
			return out;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return SkyTasks.onSkyUp(mc) && !tracked().isEmpty();
		}

		/** The tracked mobs, or (in the editor, nothing tracked) the witch as an example. */
		private List<Row> shown(Minecraft mc) {
			List<Mob> mobs = tracked();
			return rows(mc, mobs.isEmpty() ? List.of(MOBS.get(0)) : mobs);
		}

		public int width(Minecraft mc) {
			int w = 80;
			for (Row r : shown(mc)) w = Math.max(w, r.indent() + mc.font.width(r.left()) + (r.right().isEmpty() ? 0 : 10 + mc.font.width(r.right())));
			return Math.min(260, w) + Modules.PAD * 2;
		}

		public int height(Minecraft mc) {
			return shown(mc).size() * (mc.font.lineHeight + 1) - 1 + Modules.PAD * 2;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			int w = width(mc) - Modules.PAD * 2, row = y + Modules.PAD;
			for (Row r : shown(mc)) {
				Modules.text(g, mc, r.left(), x + Modules.PAD + r.indent(), row, r.leftColor() == WHITE ? Modules.textColor() : r.leftColor());
				if (!r.right().isEmpty()) Modules.text(g, mc, r.right(), x + Modules.PAD + w - mc.font.width(r.right()), row, r.rightColor());
				row += mc.font.lineHeight + 1;
			}
		}
	}

	/** For the test: the recipe read from a window's item, as one line. */
	public static String readForTest(ItemStack stack) {
		Learned r = read(Minecraft.getInstance(), stack);
		return r == null ? "none" : r.count + " x " + r.name + " " + r.wand + "/" + r.main + " " + r.level + " " + r.materials;
	}

	/** For the test: the module's rows as text, and the slots lit in the window. */
	public static String moduleForTest() {
		Minecraft mc = Minecraft.getInstance();
		StringBuilder sb = new StringBuilder();
		for (Row r : rows(mc, Module.tracked())) sb.append(r.left()).append(r.right().isEmpty() ? "" : " " + r.right()).append(" | ");
		return sb + "lit " + readySlots;
	}

	public static void resetForTest() {
		data = new Data();
		READ.clear();
	}

	/** For the test: as if a right click on a campfire just summoned the mob named so. */
	public static void pendingForTest(String name) {
		pending = named(name);
		pendingAt = System.currentTimeMillis();
	}
}
//#endif
