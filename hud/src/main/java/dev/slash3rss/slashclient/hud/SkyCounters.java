// SkyUp's tasks are played on 26.3: the counting is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

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
import java.util.List;
import java.util.Locale;
import java.util.Map;

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
 * ryba" are any log, sapling or fish.
 */
public final class SkyCounters {
	private SkyCounters() {}

	/** The kind of a section, from its header. */
	enum Kind { BREAK, PLACE, CRAFT, EAT, FISH, KILL, NEAR, OTHER }

	static Kind kind(SkyTaskParser.Section s) {
		String h = s.header.toLowerCase(Locale.ROOT);
		if (h.startsWith("zbierz")) return Kind.BREAK;
		if (h.startsWith("postaw")) return Kind.PLACE;
		if (h.startsWith("stwórz")) return Kind.CRAFT;
		if (h.startsWith("zjedz")) return Kind.EAT;
		if (h.startsWith("wyłów")) return Kind.FISH;
		if (h.startsWith("zabij")) return Kind.KILL;
		if (h.startsWith("stój obok") || h.startsWith("stań obok")) return Kind.NEAR;
		return Kind.OTHER;
	}

	/** What a requirement could be: the names the game gives it, and the groups ("dowolne drewno") it is in. */
	record Thing(List<String> names, boolean log, boolean sapling, boolean fish, boolean baby) {
		static Thing of(boolean baby, boolean log, boolean sapling, boolean fish, String... names) {
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
	static boolean matches(String thing, Thing t) {
		String want = norm(thing);
		if (want.startsWith("dowoln")) {
			if (want.contains("drewn") || want.contains("pień") || want.contains("kłod")) return t.log;
			if (want.contains("sadzon")) return t.sapling;
			if (want.contains("ryb")) return t.fish;
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
		if (amount <= 0 || SlashHud.config == null) return;
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

	private static Thing item(ItemStack stack) {
		// the item's own name too, when the server renamed it
		return Thing.of(false, stack.is(ItemTags.LOGS), stack.is(ItemTags.SAPLINGS), stack.is(ItemTags.FISHES),
			name(stack), stack.getItem().getName(stack).getString());
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
			block.getName().getString(), own.isEmpty() ? null : name(own), crop.isEmpty() ? null : name(crop)), 1);
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

	public static void placed(Player player, BlockItem item) {
		if (!mine(player)) return;
		add(Kind.PLACE, item(new ItemStack(item)), 1);
	}

	public static void crafted(Player player, ItemStack stack, int amount) {
		if (!mine(player) || stack.isEmpty()) return;
		add(Kind.CRAFT, item(stack), amount);
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
		if (mc.player == null || mc.level == null) {
			hit.clear();
			return;
		}
		long now = System.currentTimeMillis();
		// kills
		hit.entrySet().removeIf(e -> {
			Entity entity = mc.level.getEntity(e.getKey());
			if (entity instanceof LivingEntity living && living.isDeadOrDying()) {
				add(Kind.KILL, Thing.of(living.isBaby(), false, false, false, living.getType().getDescription().getString(), living.getName().getString()), 1);
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
		// what is around, and the sidebar: read again each second
		if (++tick % 20 == 0) {
			near.clear();
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
		if (!plain.contains("Wyłowiono")) return;
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

	/** How far around the player "Stój obok" looks (the server's own reach is not known). */
	static final int NEAR_RADIUS = 6;
	/** Each thing's count around the player, read at most once a second. */
	private static final Map<String, Long> near = new HashMap<>();

	/** How many blocks named `thing` are around the player now (an estimate of "Stój obok"). */
	static long around(Minecraft mc, String thing) {
		if (mc.player == null || mc.level == null) return -1;
		return near.computeIfAbsent(thing, k -> {
			long n = 0;
			BlockPos at = mc.player.blockPosition();
			BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
			Map<Block, Boolean> seen = new HashMap<>();
			for (int dx = -NEAR_RADIUS; dx <= NEAR_RADIUS; dx++) for (int dy = -NEAR_RADIUS; dy <= NEAR_RADIUS; dy++) for (int dz = -NEAR_RADIUS; dz <= NEAR_RADIUS; dz++) {
				BlockState state = mc.level.getBlockState(pos.set(at.getX() + dx, at.getY() + dy, at.getZ() + dz));
				if (state.isAir()) continue;
				Block block = state.getBlock();
				if (seen.computeIfAbsent(block, b -> matches(k, Thing.of(false, state.is(BlockTags.LOGS), state.is(BlockTags.SAPLINGS), false, b.getName().getString())))) n++;
			}
			return n;
		});
	}
}
//#endif
