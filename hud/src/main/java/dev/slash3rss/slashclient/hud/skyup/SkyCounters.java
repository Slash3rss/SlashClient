// SkyUp's tasks are played on 26.3: the counting is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.state.BlockState;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * What the player does, counted toward SkyUp's tasks between two looks at their GUI: blocks broken
 * ("Zbierz"), placed ("Postaw"), items crafted or smelted ("Stwórz"), food eaten ("Zjedz"), fish
 * caught ("Wyłów"), mobs killed ("Zabij"); and the blocks around the player ("Stój obok").
 *
 * It is an estimate: the server has rules of its own (where it counts, which stone, …), so what is
 * counted here goes on top of the server's number (Req.extra) and is shown with "~"; the next look
 * at the GUI brings the server's number and starts the count again from there.
 *
 * Names are matched as the game shows them in the player's language (the tasks are written in
 * Polish, as the game is when played in Polish); "Dowolne drewno", "Dowolna sadzonka" and "Dowolna
 * ryba" are any log, sapling or fish, "Dowolny blok" and "Dowolny przedmiot" anything.
 */
public final class SkyCounters {
	private SkyCounters() {}

	/** The kind of a section, from its header. */
	enum Kind { BREAK, PLACE, CRAFT, EAT, FISH, KILL, NEAR, SUMMON, OTHER }

	static Kind kind(SkyTaskParser.Section s) {
		String h = s.header.toLowerCase(Locale.ROOT);
		if (h.startsWith("zbierz")) return Kind.BREAK;
		if (h.startsWith("postaw")) return Kind.PLACE;
		if (h.startsWith("stwórz")) return Kind.CRAFT;
		if (h.startsWith("zjedz")) return Kind.EAT;
		if (h.startsWith("wyłów")) return Kind.FISH;
		if (h.startsWith("zabij")) return Kind.KILL;
		if (h.startsWith("stój obok") || h.startsWith("stań obok")) return Kind.NEAR;
		if (h.startsWith("przyzwij")) return Kind.SUMMON;
		return Kind.OTHER;
	}

	/** What a requirement could be: the names the game gives it, and the groups ("dowolne drewno") it is in. */
	public record Thing(List<String> names, boolean log, boolean sapling, boolean fish, boolean baby) {
		public static Thing of(boolean baby, boolean log, boolean sapling, boolean fish, String... names) {
			List<String> out = new ArrayList<>();
			for (String n : names) if (n != null && !n.isBlank()) out.add(norm(n));
			return new Thing(out, log, sapling, fish, baby);
		}
	}

	/** Lower case, without "(dorosły)" and the like. */
	static String norm(String s) {
		return SkyTaskParser.plain(s).replaceAll("\\s*\\([^)]*\\)", "").toLowerCase(Locale.ROOT).strip();
	}

	/** Whether a requirement's thing is this one. */
	public static boolean matches(String thing, Thing t) {
		String want = norm(thing);
		if (want.startsWith("dowoln")) {
			if (want.contains("drewn") || want.contains("pień") || want.contains("kłod")) return t.log;
			if (want.contains("sadzon")) return t.sapling;
			if (want.contains("ryb")) return t.fish;
			// "Dowolny blok" ("Postaw" any 256 blocks), "Dowolny przedmiot": whatever it is
			if (want.contains("blok") || want.contains("przedmiot")) return true;
			return false;
		}
		// "(dorosły)": only grown ones
		String lower = thing.toLowerCase(Locale.ROOT);
		if ((lower.contains("(dorosł") || lower.contains("(adult")) && t.baby) return false;
		for (String n : t.names) {
			if (n.equals(want)) return true;
			// a plural or another form of the same word ("Buraki" for "Burak"): the same start, a letter or two apart
			if (n.length() >= 4 && want.length() >= 4 && Math.abs(n.length() - want.length()) <= 2 && (n.startsWith(want) || want.startsWith(n))) return true;
		}
		return false;
	}

	/** `amount` more of `what` for every known task's requirements of this kind. */
	static void add(Kind kind, Thing what, long amount) {
		if (amount <= 0 || SlashHud.config == null || !SkyTasks.onSkyUp(Minecraft.getInstance())) return;
		boolean any = false;
		for (SkyTaskParser.Task t : SkyTasks.data().tasks.values()) {
			for (SkyTaskParser.Section s : t.sections) {
				if (kind(s) != kind) continue;
				for (SkyTaskParser.Req r : s.items) {
					// counted only where the server gave a number to count on from
					if (r.current < 0 || r.required < 0 || !matches(r.thing, what)) continue;
					r.extra += amount;
					any = true;
				}
			}
		}
		if (any) SkyTasks.changed();
	}

	private static boolean mine(Player player) {
		Minecraft mc = Minecraft.getInstance();
		return player != null && player == mc.player && !player.isCreative() && !player.isSpectator();
	}

	private static String name(ItemStack stack) {
		return stack.getHoverName().getString();
	}

	/** The game's Polish names (SkyUp writes its tasks in Polish), whatever language the game is played in. */
	private static net.minecraft.client.resources.language.ClientLanguage polish;

	static String pl(String key) {
		if (polish == null) {
			try {
				polish = net.minecraft.client.resources.language.ClientLanguage.loadFrom(Minecraft.getInstance().getResourceManager(), List.of("pl_pl"), false);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: Polish names: {}", e.toString());
				return "";
			}
		}
		return polish.getOrDefault(key, "");
	}

	static String plItem(net.minecraft.world.item.Item item) {
		return pl(item.getDescriptionId());
	}

	static String plBlock(Block block) {
		return pl(block.getDescriptionId());
	}

	static String plEntity(net.minecraft.world.entity.EntityType<?> type) {
		return pl("entity." + net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(type).toLanguageKey());
	}

	private static Thing item(ItemStack stack) {
		// the item's own name too, when the server renamed it
		return Thing.of(false, stack.is(ItemTags.LOGS), stack.is(ItemTags.SAPLINGS), stack.is(ItemTags.FISHES),
			name(stack), stack.getItem().getName(stack).getString(), plItem(stack.getItem()));
	}

	// ---------- the events ----------

	/** A block broken by the player: crops only when grown; a crop's name and its crop's item both match ("Pszenica"). */
	public static void broken(Player player, BlockState state) {
		if (!mine(player)) return;
		Block block = state.getBlock();
		if (block instanceof CropBlock crop && !crop.isMaxAge(state)) return;
		ItemStack own = new ItemStack(block.asItem());
		ItemStack crop = new ItemStack(CROPS.getOrDefault(block, Items.AIR));
		add(Kind.BREAK, Thing.of(false, state.is(BlockTags.LOGS), state.is(BlockTags.SAPLINGS), false,
			block.getName().getString(), plBlock(block), own.isEmpty() ? null : name(own), own.isEmpty() ? null : plItem(own.getItem()),
			crop.isEmpty() ? null : name(crop), crop.isEmpty() ? null : plItem(crop.getItem())), 1);
	}

	/** What a crop gives, by its name in the tasks ("Pszenica" is the wheat crop's grain, not its seeds). */
	private static final Map<Block, net.minecraft.world.item.Item> CROPS = new HashMap<>();
	static {
		CROPS.put(Blocks.WHEAT, Items.WHEAT);
		CROPS.put(Blocks.CARROTS, Items.CARROT);
		CROPS.put(Blocks.POTATOES, Items.POTATO);
		CROPS.put(Blocks.BEETROOTS, Items.BEETROOT);
		CROPS.put(Blocks.NETHER_WART, Items.NETHER_WART);
		CROPS.put(Blocks.COCOA, Items.COCOA_BEANS);
		CROPS.put(Blocks.SWEET_BERRY_BUSH, Items.SWEET_BERRIES);
		CROPS.put(Blocks.MELON, Items.MELON_SLICE);
	}

	public static void placed(Player player, BlockItem item, net.minecraft.core.BlockPos pos) {
		if (!mine(player)) return;
		// placing, breaking and placing again on one spot counts once in three minutes (as SkyUp counts it)
		String spot = player.level().dimension() + " " + pos.asLong();
		long now = System.currentTimeMillis();
		Long last = placedAt.get(spot);
		if (last != null && now - last < PLACE_AGAIN_MS) return;
		placedAt.remove(spot);
		placedAt.put(spot, now);
		if (placedAt.size() > 20000) placedAt.remove(placedAt.keySet().iterator().next());
		add(Kind.PLACE, item(new ItemStack(item)), 1);
	}

	private static final long PLACE_AGAIN_MS = 3 * 60_000;
	/** The spots a block was counted as placed on, oldest first, and when. */
	private static final LinkedHashMap<String, Long> placedAt = new LinkedHashMap<>();

	public static void crafted(Player player, ItemStack stack, int amount) {
		if (!mine(player) || stack.isEmpty()) return;
		add(Kind.CRAFT, item(stack), amount);
		// shift-click crafts as many as the grid allows, but the game here only foresees the first:
		// the rest shows up as the server sends the inventory, so that growth is counted too
		if (crafting != null && ItemStack.isSameItemSameComponents(crafting, stack)) {
			craftedCount += amount;
		} else {
			crafting = stack.copyWithCount(1);
			// the crafted items are already in the inventory or on the cursor by now
			craftBase = held(Minecraft.getInstance(), crafting) - amount;
			craftedCount = amount;
		}
		craftedAt = System.currentTimeMillis();
	}

	/** The item last crafted, how many of it the player held then, and how many were counted since. */
	private static ItemStack crafting;
	private static int craftBase, craftedCount;
	private static long craftedAt;

	/** All of `like` in the inventory and on the cursor. */
	private static int held(Minecraft mc, ItemStack like) {
		int n = 0;
		var inv = mc.player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack is = inv.getItem(i);
			if (ItemStack.isSameItemSameComponents(is, like)) n += is.getCount();
		}
		ItemStack carried = mc.player.containerMenu.getCarried();
		if (ItemStack.isSameItemSameComponents(carried, like)) n += carried.getCount();
		return n;
	}

	private static void watchCrafting(Minecraft mc, long now) {
		if (crafting == null) return;
		int more = held(mc, crafting) - craftBase - craftedCount;
		if (more > 0) {
			add(Kind.CRAFT, item(crafting), more);
			craftedCount += more;
			craftedAt = now;
		}
		if (now - craftedAt > 1500) crafting = null;
	}

	public static void ate(Player player) {
		if (!mine(player)) return;
		ItemStack food = player.getUseItem();
		if (!food.isEmpty()) add(Kind.EAT, item(food), 1);
	}

	// ---------- the scoreboard: the island's level, the jobs' levels ----------

	/** The sidebar's lines, top to bottom, as plain text. */
	static List<String> sidebar(Minecraft mc) {
		List<String> out = new ArrayList<>();
		var objective = Compat.displayed(mc, true);
		if (objective == null) return out;
		var board = mc.level.getScoreboard();
		List<net.minecraft.world.scores.PlayerScoreEntry> entries = new ArrayList<>(board.listPlayerScores(objective));
		entries.removeIf(net.minecraft.world.scores.PlayerScoreEntry::isHidden);
		// the game's own order: the highest score on top
		entries.sort((a, b) -> a.value() != b.value() ? Integer.compare(b.value(), a.value()) : a.owner().compareToIgnoreCase(b.owner()));
		for (var e : entries) {
			var text = e.display() != null ? e.display() : net.minecraft.world.scores.PlayerTeam.formatNameForTeam(board.getPlayersTeam(e.owner()), e.ownerName());
			out.add(SkyTaskParser.plain(text.getString()));
		}
		return out;
	}

	private static final java.util.regex.Pattern LEVEL = java.util.regex.Pattern.compile("^(.+?):\\s*(\\d+)\\s*(poz\\.?)?.*$");

	/**
	 * SkyUp's sidebar, which shows by turns "» Wyspa" with "Poziom: 3" or the island's bank, and "» Prace"
	 * with one job at a time ("Rybak: 1 poz.", all seven in turn): the island's level and each job's
	 * level, kept as they come by (the level stays while the bank shows).
	 */
	static void readSidebar(Minecraft mc) {
		String part = "";
		SkyTasks.Data d = SkyTasks.data();
		for (String line : sidebar(mc)) {
			if (line.startsWith("»") || line.startsWith(">>")) {
				part = line.replaceFirst("^(»|>>)\\s*", "").toLowerCase(Locale.ROOT);
				continue;
			}
			java.util.regex.Matcher m = LEVEL.matcher(line);
			if (!m.matches()) continue;
			String key = m.group(1).strip();
			long value = SkyTaskParser.number(m.group(2));
			if (part.startsWith("wysp") && key.equalsIgnoreCase("Poziom")) {
				if (d.islandLevel != value) SkyTasks.changed();
				d.islandLevel = value;
			} else if (part.startsWith("prac") && m.group(3) != null) {
				Long old = d.jobs.put(key, value);
				if (old == null || old != value) SkyTasks.changed();
			}
		}
	}

	/** A requirement the sidebar answers ("Posiadaj poziom wyspy", "… dowolnej pracy", "… sumę poziomów prac"), or -1. */
	static long fromSidebar(SkyTaskParser.Section s) {
		String h = s.header.toLowerCase(Locale.ROOT);
		SkyTasks.Data d = SkyTasks.data();
		if (h.startsWith("posiadaj poziom wyspy")) return d.islandLevel;
		if (d.jobs.isEmpty()) return -1;
		if (h.startsWith("posiadaj poziom dowolnej pracy")) return d.jobs.values().stream().mapToLong(Long::longValue).max().orElse(-1);
		if (h.startsWith("posiadaj sumę poziomów prac")) return d.jobs.values().stream().mapToLong(Long::longValue).sum();
		return -1;
	}

	/** SkyUp's jobs: the sidebar shows them one after another, so all are known once this many came by. */
	static final int JOBS = 7;

	/** Not all of it is known from the sidebar yet: jobs not shown since joining SkyUp the first time are missing. */
	static boolean sidebarEstimate(SkyTaskParser.Section s) {
		String h = s.header.toLowerCase(Locale.ROOT);
		return (h.startsWith("posiadaj poziom dowolnej pracy") || h.startsWith("posiadaj sumę poziomów prac")) && SkyTasks.data().jobs.size() < JOBS;
	}

	// ---------- watched each tick: kills, fish, what is around ----------

	/** Mobs the player hit, and when: one of them dying within a few seconds is the player's kill. */
	private static final Map<Integer, Long> hit = new HashMap<>();

	public static void attacked(Player player, Entity target) {
		if (mine(player) && target instanceof LivingEntity) hit.put(target.getId(), System.currentTimeMillis());
	}

	/** The fishing hook was out last tick; the inventory as it was when it came back. */
	private static boolean fishing;
	private static long reeledAt;
	private static List<ItemStack> before;

	private static int tick;

	static void tick(Minecraft mc) {
		if (mc.player == null || mc.level == null || !SkyTasks.onSkyUp(mc)) {
			hit.clear();
			before = null;
			crafting = null;
			placedAt.clear();
			return;
		}
		long now = System.currentTimeMillis();
		// kills
		hit.entrySet().removeIf(e -> {
			Entity entity = mc.level.getEntity(e.getKey());
			if (entity instanceof LivingEntity living && living.isDeadOrDying()) {
				add(Kind.KILL, Thing.of(living.isBaby(), false, false, false, living.getType().getDescription().getString(), plEntity(living.getType()), living.getName().getString()), 1);
				return true;
			}
			return entity == null || now - e.getValue() > 5000;
		});
		// fish: what came into the inventory within two seconds of reeling in
		boolean out = mc.player.fishing != null;
		if (fishing && !out) {
			reeledAt = now;
			before = counts(mc);
		}
		fishing = out;
		if (before != null && now - reeledAt > 300) {
			var inv = mc.player.getInventory();
			for (int i = 0; i < before.size() && i < inv.getContainerSize(); i++) {
				ItemStack was = before.get(i), is = inv.getItem(i);
				if (is.isEmpty() || ItemStack.matches(was, is)) continue;
				int more = ItemStack.isSameItemSameComponents(was, is) ? is.getCount() - was.getCount() : is.getCount();
				// SkyUp says each catch in the chat (counted from there): the inventory only for other fish
				if (more > 0 && !chatCatches) fished(is, more);
				before.set(i, is.copy());
			}
			if (now - reeledAt > 2000) before = null;
		}
		watchCrafting(mc, now);
		readNear(mc);
		// the sidebar: read again each second
		if (++tick % 20 == 0) {
			readSidebar(mc);
		}
	}

	/** Each inventory slot as it is now (copies). */
	private static List<ItemStack> counts(Minecraft mc) {
		List<ItemStack> out = new ArrayList<>();
		var inv = mc.player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) out.add(inv.getItem(i).copy());
		return out;
	}

	/** A catch was seen in the chat: from then on the chat counts the fish, not the inventory. */
	private static boolean chatCatches;

	/**
	 * SkyUp's line on each catch, "Wędkarstwo » Wyłowiono: Przeciętny, niezjadliwy Tuńczyk pospolity
	 * (22 013,82g, 9%)!", carries the fish itself (to show on hover): counted from it, so a catch
	 * counts wherever the fish goes (a full inventory, a fishing bag).
	 */
	public static void onChat(net.minecraft.network.chat.Component message) {
		String plain = SkyTaskParser.plain(message.getString());
		// a mob summoned with shamanism (SkyShaman)
		if (SkyTasks.onSkyUp(Minecraft.getInstance())) SkyShaman.onChat(plain);
		if (!plain.contains("Wyłowiono") || !SkyTasks.onSkyUp(Minecraft.getInstance())) return;
		var fish = message.visit((net.minecraft.network.chat.Style style, String text) ->
			style.getHoverEvent() instanceof net.minecraft.network.chat.HoverEvent.ShowItem show ? java.util.Optional.of(show.item().create()) : java.util.Optional.<ItemStack>empty(),
			net.minecraft.network.chat.Style.EMPTY);
		if (fish.isEmpty()) return;
		// someone else's catch, should the server ever say those
		Minecraft mc = Minecraft.getInstance();
		for (var line : SkyDump.lore(fish.get())) {
			String text = SkyTaskParser.plain(line.getString());
			if (text.startsWith("Wyłowił") && mc.player != null && !text.endsWith(mc.player.getName().getString())) return;
		}
		chatCatches = true;
		fished(fish.get(), 1);
		SkyFish.caught(fish.get());
	}

	/** SkyUp's fish (cod with a name of their own): "Wyłowił » nick", "Waga » 8 090,31g (niewielki)". */
	private static final java.util.regex.Pattern WEIGHT = java.util.regex.Pattern.compile("Waga\\s*(?:»|>>|:)\\s*([\\d  ]+(?:[.,]\\d+)?)\\s*g\\b\\s*(?:\\(([^)]+)\\))?");
	/** SkyUp's fish sizes from the smallest; a word's start is enough ("ogromne" is "ogromny"). */
	static final String[] SIZES = { "niewiel", "przeciętn", "wymiarow", "ogromn", "mamu" };

	static int size(String word) {
		String w = word.toLowerCase(Locale.ROOT).strip();
		for (int i = SIZES.length - 1; i >= 0; i--) if (w.startsWith(SIZES[i])) return i;
		return -1;
	}

	/** `count` of a caught item: the fish's kind ("Dowolna ryba"), its weight ("Wyłów: 0g/200 000g") and its size ("Wyłów conajmniej ogromne"). */
	static void fished(ItemStack stack, int count) {
		double grams = -1;
		int size = -1;
		boolean caught = false;
		for (var line : SkyDump.lore(stack)) {
			String text = SkyTaskParser.plain(line.getString());
			if (text.contains("Wyłowił")) caught = true;
			java.util.regex.Matcher m = WEIGHT.matcher(text);
			if (m.find()) {
				grams = Double.parseDouble(m.group(1).replaceAll("[  ]", "").replace(',', '.'));
				if (m.group(2) != null) size = size(m.group(2));
			}
		}
		boolean fish = caught || stack.is(ItemTags.FISHES);
		if (!fish) return;
		add(Kind.FISH, Thing.of(false, false, false, true, name(stack), stack.getItem().getName(stack).getString()), count);
		boolean any = false;
		for (SkyTaskParser.Task t : SkyTasks.data().tasks.values()) {
			for (SkyTaskParser.Section s : t.sections) {
				if (kind(s) != Kind.FISH) continue;
				String h = s.header.toLowerCase(Locale.ROOT);
				for (SkyTaskParser.Req r : s.items) {
					if (r.current < 0 || r.required < 0 || !r.thing.equals(s.header)) continue;
					if (r.unit.equals("g") && grams >= 0) {
						// the weight caught, in grams
						r.extra += Math.round(grams) * count;
						any = true;
					} else if (h.contains("conajmniej") || h.contains("co najmniej")) {
						// "Wyłów conajmniej ogromne": fish of that size or bigger
						int least = size(h.replaceFirst("^.*(conajmniej|co najmniej)\\s*", ""));
						if (least >= 0 && size >= least) {
							r.extra += count;
							any = true;
						}
					}
				}
			}
		}
		if (any) SkyTasks.changed();
	}

	/** How far around the player "Stój obok" looks: SkyUp's own reach, 30 blocks each way. */
	static final int NEAR_RADIUS = 30;
	/** The cube is read a few slices (x) a tick, all of it in about a second, so no tick takes long. */
	private static final int SLICES_PER_TICK = 4;
	/** Each kind of block in the last full read, and how many of it. */
	private static Map<Block, Long> nearCounts = Map.of();
	private static Map<Block, Long> reading = new HashMap<>();
	private static BlockPos readAt;
	private static int readX = Integer.MIN_VALUE;
	private static boolean nearRead;
	/** Each thing's count from the last full read. */
	private static final Map<String, Long> near = new HashMap<>();

	/** Whether any known task asks for blocks around the player (only then is the world read). */
	private static boolean wantNear() {
		for (SkyTaskParser.Task t : SkyTasks.data().tasks.values()) for (SkyTaskParser.Section s : t.sections) if (kind(s) == Kind.NEAR) return true;
		return false;
	}

	/** A few slices more of the cube around the player; a full one replaces the counts. */
	private static void readNear(Minecraft mc) {
		if (!wantNear()) return;
		if (readX == Integer.MIN_VALUE) {
			readAt = mc.player.blockPosition();
			readX = -NEAR_RADIUS;
			reading = new HashMap<>();
		}
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int i = 0; i < SLICES_PER_TICK && readX <= NEAR_RADIUS; i++, readX++) {
			for (int dy = -NEAR_RADIUS; dy <= NEAR_RADIUS; dy++) for (int dz = -NEAR_RADIUS; dz <= NEAR_RADIUS; dz++) {
				BlockState state = mc.level.getBlockState(pos.set(readAt.getX() + readX, readAt.getY() + dy, readAt.getZ() + dz));
				if (!state.isAir()) reading.merge(state.getBlock(), 1L, Long::sum);
			}
		}
		if (readX > NEAR_RADIUS) {
			nearCounts = reading;
			readX = Integer.MIN_VALUE;
			nearRead = true;
			near.clear();
		}
	}

	/** How many blocks named `thing` are around the player (an estimate of "Stój obok"), or -1 before the first read. */
	static long around(Minecraft mc, String thing) {
		if (!nearRead) return -1;
		return near.computeIfAbsent(thing, k -> {
			long n = 0;
			for (var e : nearCounts.entrySet()) {
				Block b = e.getKey();
				BlockState state = b.defaultBlockState();
				if (matches(k, Thing.of(false, state.is(BlockTags.LOGS), state.is(BlockTags.SAPLINGS), false, b.getName().getString(), plBlock(b)))) n += e.getValue();
			}
			return n;
		});
	}
}
//#endif
