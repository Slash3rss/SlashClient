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
	enum Kind { BREAK, PLACE, CRAFT, EAT, FISH, KILL, NEAR, SUMMON, BELL, DRINK, CASE, SHEAR, TAME, BARTER, TRADE, HATCH, WITCH, OTHER }

	/** Kinds whose requirement is the thing done, whatever its line says ("Uderz w dzwony", "Wypij mikstury", "Ręcznie"). */
	private static boolean anyThing(Kind k) {
		return k == Kind.BELL || k == Kind.DRINK || k == Kind.CASE || k == Kind.BARTER || k == Kind.HATCH || k == Kind.WITCH;
	}

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
		if (h.startsWith("uderz w dzwon")) return Kind.BELL;
		if (h.startsWith("wypij mikstur")) return Kind.DRINK;
		if (h.startsWith("otwórz skycase")) return Kind.CASE;
		if (h.startsWith("ostrzyż")) return Kind.SHEAR;
		if (h.startsWith("oswój")) return Kind.TAME;
		if (h.startsWith("handluj z piglin")) return Kind.BARTER;
		if (h.startsWith("wymień z piglin")) return Kind.TRADE;
		if (h.startsWith("wykluj z jaj")) return Kind.HATCH;
		if (h.startsWith("przeżyj ataki wiedźm")) return Kind.WITCH;
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
		return BRACKETS.matcher(SkyTaskParser.plain(s)).replaceAll("").toLowerCase(Locale.ROOT).strip();
	}

	private static final java.util.regex.Pattern BRACKETS = java.util.regex.Pattern.compile("\\s*\\([^)]*\\)");

	/** Leaving SkyUp (or another of its sectors): nothing half-counted is carried into the next world. */
	static void reset() {
		hit.clear();
		before = null;
		crafting = null;
		placedAt.clear();
		pending.clear();
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
			// anything else ("Dowolne jajko", "Dowolny odłamek ceramiki"): whatever has those words in its
			// name, in any form ("Brązowe jajko", "Odłamek ceramiki z łucznikiem")
			String[] words = want.replaceFirst("^dowoln\\S*\\s*", "").split("\\s+");
			for (String n : t.names) {
				boolean all = words.length > 0 && !words[0].isEmpty();
				for (String w : words) all &= n.contains(w.length() > 4 ? w.substring(0, w.length() - 1) : w);
				if (all) return true;
			}
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
					// counted only where the server gave a number; some kinds whatever the line names
					if (r.current < 0 || r.required < 0 || (!anyThing(kind) && !matches(r.thing, what))) continue;
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

	static Thing item(ItemStack stack) {
		// the item's own name too, when the server renamed it
		return Thing.of(false, stack.is(ItemTags.LOGS), stack.is(ItemTags.SAPLINGS), stack.is(ItemTags.FISHES),
			name(stack), stack.getItem().getName(stack).getString(), plItem(stack.getItem()));
	}

	// ---------- the events ----------

	/**
	 * A block or a placing the game foresaw, waiting for the server: counted only once it is still so a moment later
	 * (a server that refuses it, on another's island or a protected spot, puts the block back as it was).
	 */
	private record Pending(net.minecraft.core.BlockPos pos, BlockState was, BlockState now, Runnable count, long at) {}

	private static final List<Pending> pending = new ArrayList<>();
	private static final long CONFIRM_MS = 750;

	/** A block broken by the player: counted once the server has not put it back. */
	public static void broken(Player player, net.minecraft.core.BlockPos pos, BlockState state) {
		if (!mine(player)) return;
		pending.add(new Pending(pos.immutable(), state, null, () -> broken(state), System.currentTimeMillis()));
	}

	/** Crops only when grown; a crop's name and its crop's item both match ("Pszenica"). */
	private static void broken(BlockState state) {
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

	/** A block the player placed: counted once the server has not taken it away. */
	public static void placed(Player player, BlockItem item, net.minecraft.core.BlockPos pos) {
		if (!mine(player)) return;
		BlockState now = player.level().getBlockState(pos);
		String dimension = player.level().dimension().toString();
		pending.add(new Pending(pos.immutable(), null, now, () -> placed(dimension, item, pos), System.currentTimeMillis()));
	}

	private static void placed(String dimension, BlockItem item, net.minecraft.core.BlockPos pos) {
		// placing, breaking and placing again on one spot counts once in three minutes (as SkyUp counts it)
		String spot = dimension + " " + pos.asLong();
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
		if (food.isEmpty()) return;
		// a potion drunk ("Wypij mikstury"); anything else eaten
		if (food.is(Items.POTION)) add(Kind.DRINK, item(food), 1);
		else add(Kind.EAT, item(food), 1);
	}

	// ---------- a right click, a case opened ----------

	/** When the player last right-clicked a block (a case's chest is opened so), for "Otwórz SkyCase: Ręcznie". */
	private static long blockUsedAt;

	/** A bell clicked and when: it counts once the server swings it (a protected one stays still and silent). */
	private static net.minecraft.core.BlockPos ringing;
	private static long ringingSince;
	/**
	 * A sheep clicked with shears, when, how many it stood for (a stacked sheep is many) and where: it counts
	 * once the server is seen to have shorn it, and not at all when the server refused the click.
	 */
	private static int shearing = -1;
	private static long shearingSince;
	private static int shearingStack;
	private static net.minecraft.world.phys.Vec3 shearingAt;
	private static net.minecraft.world.entity.EntityType<?> shearingType;

	/** A right click: on a bell it rings ("Uderz w dzwony"); shears on a sheep that has wool ("Ostrzyż"). */
	public static void used(Minecraft mc) {
		if (mc.player == null || mc.level == null) return;
		if (mc.hitResult instanceof net.minecraft.world.phys.BlockHitResult hit && hit.getType() == net.minecraft.world.phys.HitResult.Type.BLOCK) {
			blockUsedAt = System.currentTimeMillis();
			if (mc.level.getBlockState(hit.getBlockPos()).is(Blocks.BELL)) {
				ringing = hit.getBlockPos().immutable();
				ringingSince = blockUsedAt;
			}
		} else if (mc.hitResult instanceof net.minecraft.world.phys.EntityHitResult hit
			&& hit.getEntity() instanceof net.minecraft.world.entity.animal.sheep.Sheep sheep && sheep.readyForShearing()
			&& (mc.player.getMainHandItem().is(Items.SHEARS) || mc.player.getOffhandItem().is(Items.SHEARS))) {
			shearing = sheep.getId();
			shearingSince = System.currentTimeMillis();
			shearingStack = stackOf(sheep);
			shearingAt = sheep.position();
			shearingType = sheep.getType();
		} else if (mc.hitResult instanceof net.minecraft.world.phys.EntityHitResult hit
			&& hit.getEntity() instanceof net.minecraft.world.entity.monster.piglin.Piglin piglin && mc.player.getMainHandItem().is(Items.GOLD_INGOT)) {
			// gold given to a piglin by hand (as on SkyUp): what it drops in the next while is the trade
			traded.put(piglin.getId(), System.currentTimeMillis() + 10_000);
			bartered.remove(piglin.getId());
		}
	}

	/**
	 * What the server did with the last click: the bell swings (with its sound) only when the server rang it,
	 * and the sheep loses its wool only when it was shorn, so a click the server refused counts for nothing.
	 */
	private static void watchUsed(Minecraft mc, long now) {
		if (ringing != null) {
			if (now - ringingSince > 2000) ringing = null;
			else if (mc.level.getBlockEntity(ringing) instanceof net.minecraft.world.level.block.entity.BellBlockEntity bell && bell.shaking && bell.ticks <= 5) {
				ringing = null;
				add(Kind.BELL, Thing.of(false, false, false, false, "Dzwon"), 1);
			}
		}
		if (shearing >= 0) {
			int shorn = now - shearingSince > 2000 ? -1 : shorn(mc);
			if (shorn != 0) shearing = -1;
			if (shorn > 0) {
				var type = shearingType;
				add(Kind.SHEAR, Thing.of(false, false, false, false, type.getDescription().getString(), plEntity(type)), shorn);
			}
		}
	}

	/**
	 * How many sheep the server has shorn after the click (0 while nothing is seen yet). Servers that stack mobs
	 * shear the whole stack (the sheep shorn, its number the same: all of them), take one off it (its number
	 * smaller: that many), or put a shorn sheep in its place (the clicked one gone, a shorn one where it stood).
	 */
	private static int shorn(Minecraft mc) {
		Entity e = mc.level.getEntity(shearing);
		if (e instanceof net.minecraft.world.entity.animal.sheep.Sheep sheep && sheep.isAlive()) {
			int stack = stackOf(sheep);
			if (sheep.isSheared()) return stack == shearingStack ? shearingStack : 1;
			return stack < shearingStack ? shearingStack - stack : 0;
		}
		var near = net.minecraft.world.phys.AABB.ofSize(shearingAt, 3, 2, 3);
		return mc.level.getEntitiesOfClass(net.minecraft.world.entity.animal.sheep.Sheep.class, near, s -> s.isSheared() && s.tickCount < 60).isEmpty() ? 0 : 1;
	}

	/** A case won (SkyCase): one opening; by hand when the player had just clicked a chest (a key gem's run of wins counts once). */
	public static void caseOpened() {
		long now = System.currentTimeMillis();
		if (now - blockUsedAt > 15_000) return;
		blockUsedAt = 0;
		add(Kind.CASE, Thing.of(false, false, false, false, "Ręcznie"), 1);
	}

	// ---------- around the player: tamed animals, piglins, eggs, witches' potions ----------

	/** What was seen around the player last tick (entity id →): tamed or not, a piglin admiring gold, an egg or a witch's potion and where. */
	private static final Map<Integer, Boolean> tamed = new HashMap<>(), admiring = new HashMap<>();
	private static final Map<Integer, net.minecraft.world.phys.Vec3> eggs = new HashMap<>(), witchPotions = new HashMap<>();
	private static final java.util.Set<Integer> seenItems = new java.util.HashSet<>(), seenChicks = new java.util.HashSet<>();
	/** Where the player's eggs broke, and when ({x, y, z, ms}): a chick there right after hatched from it. */
	private static final List<double[]> eggsBroken = new ArrayList<>();
	/** Piglins given gold or that just let go of it (id → until when): what lies by them by then is what they gave. */
	private static final Map<Integer, Long> traded = new HashMap<>();
	/** Those of them whose trade was counted already ("Handluj z piglinami" once per trade, however many items). */
	private static final java.util.Set<Integer> bartered = new java.util.HashSet<>();

	private static boolean wants(Kind... kinds) {
		for (SkyTaskParser.Task t : SkyTasks.data().tasks.values()) for (SkyTaskParser.Section s : t.sections) for (Kind k : kinds) if (kind(s) == k) return true;
		return false;
	}

	/** Each tick, when a task asks for it: what around the player became so since the last one. */
	private static void watchAround(Minecraft mc) {
		if (!wants(Kind.TAME, Kind.BARTER, Kind.TRADE, Kind.HATCH, Kind.WITCH)) return;
		long now = System.currentTimeMillis();
		var player = mc.player;
		var box = player.getBoundingBox().inflate(24);
		Map<Integer, net.minecraft.world.phys.Vec3> eggsNow = new HashMap<>(), potionsNow = new HashMap<>();
		for (var e : mc.level.getEntities(player, box)) {
			int id = e.getId();
			// an animal by the player that is tamed now and was not ("Oswój")
			boolean isTamed = e instanceof net.minecraft.world.entity.TamableAnimal ta ? ta.isTame()
				: e instanceof net.minecraft.world.entity.animal.equine.AbstractHorse h && h.isTamed();
			if (e instanceof net.minecraft.world.entity.TamableAnimal || e instanceof net.minecraft.world.entity.animal.equine.AbstractHorse) {
				Boolean was = tamed.put(id, isTamed);
				if (was != null && !was && isTamed && e.distanceTo(player) < 8)
					add(Kind.TAME, Thing.of(false, false, false, false, e.getType().getDescription().getString(), plEntity(e.getType())), 1);
			}
			// a piglin letting go of the gold it admired: its barter drops come now
			if (e instanceof net.minecraft.world.entity.monster.piglin.Piglin piglin) {
				boolean gold = piglin.getOffhandItem().is(Items.GOLD_INGOT);
				Boolean was = admiring.put(id, gold);
				if (was != null && was && !gold && e.distanceTo(player) < 24) traded.merge(id, now + 3000, Math::max);
			}
			// the player's thrown eggs, and the witches' thrown potions
			if (e instanceof net.minecraft.world.entity.projectile.throwableitemprojectile.ThrowableItemProjectile p) {
				if (p.getOwner() == player && net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(p.getItem().getItem()).getPath().endsWith("egg")) eggsNow.put(id, e.position());
				if (p.getOwner() instanceof net.minecraft.world.entity.monster.Witch && p instanceof net.minecraft.world.entity.projectile.throwableitemprojectile.AbstractThrownPotion) potionsNow.put(id, e.position());
			}
			// a chick where an egg of the player's broke ("Wykluj z jajek")
			if (e instanceof net.minecraft.world.entity.animal.chicken.Chicken chick && chick.isBaby() && seenChicks.add(id)) {
				for (var it = eggsBroken.iterator(); it.hasNext(); ) {
					double[] b = it.next();
					if (now - (long) b[3] < 2000 && e.distanceToSqr(b[0], b[1], b[2]) < 6.25) {
						add(Kind.HATCH, Thing.of(true, false, false, false, "Kurczak"), 1);
						it.remove();
						break;
					}
				}
			}
			// what lies by a piglin that was given gold: a trade done ("Handluj z piglinami") and what it gave
			// ("Wymień z piglinami: Obsydian"); gold lying there is the player's own, not the piglin's
			// (looked at for its first two seconds: it may show up a tick before the piglin is seen letting go of the
			// gold, and it flies off towards the player, a few blocks away from the piglin by then)
			if (e instanceof net.minecraft.world.entity.item.ItemEntity drop && drop.tickCount < 40 && !seenItems.contains(id) && !drop.getItem().is(Items.GOLD_INGOT)) {
				for (var t : traded.entrySet()) {
					var piglin = mc.level.getEntity(t.getKey());
					if (piglin != null && now < t.getValue() && piglin.distanceTo(e) < 6) {
						seenItems.add(id);
						if (bartered.add(t.getKey())) add(Kind.BARTER, Thing.of(false, false, false, false, "Piglin"), 1);
						add(Kind.TRADE, item(drop.getItem()), drop.getItem().getCount());
						break;
					}
				}
			}
		}
		// eggs gone since the last tick broke where they were last
		for (var e : eggs.entrySet()) if (!eggsNow.containsKey(e.getKey())) eggsBroken.add(new double[] { e.getValue().x, e.getValue().y, e.getValue().z, now });
		eggs.clear();
		eggs.putAll(eggsNow);
		eggsBroken.removeIf(b -> now - (long) b[3] > 2000);
		// a witch's potion gone by the player: an attack lived through ("Przeżyj ataki wiedźmy")
		for (var e : witchPotions.entrySet()) {
			if (!potionsNow.containsKey(e.getKey()) && player.isAlive() && player.position().distanceTo(e.getValue()) < 5)
				add(Kind.WITCH, Thing.of(false, false, false, false, "Wiedźma"), 1);
		}
		witchPotions.clear();
		witchPotions.putAll(potionsNow);
		traded.values().removeIf(until -> now > until);
		bartered.retainAll(traded.keySet());
		// what was seen keeps to what is still around
		if (tamed.size() > 2000) tamed.clear();
		if (admiring.size() > 500) admiring.clear();
		if (seenItems.size() > 5000) seenItems.clear();
		if (seenChicks.size() > 2000) seenChicks.clear();
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
				job(key, value);
			}
		}
	}

	/** A job's level, wherever it was read (the sidebar, the boss bar, the jobs' window). */
	static void job(String name, long level) {
		SkyTasks.Data d = SkyTasks.data();
		if (d == null || name.isBlank() || level < 0) return;
		Long old = d.jobs.put(name.strip(), level);
		if (old == null || old != level) SkyTasks.changed();
	}

	/** The boss bar while a job earns: "Drwal (poziom 9) 1 504,02/7 000 xp (+15,3 xp)". */
	private static final java.util.regex.Pattern JOB_BAR = java.util.regex.Pattern.compile("^\\s*(\\p{L}[\\p{L} ]*?)\\s*\\(poziom\\s+(\\d+)\\)");

	static void readBossBar(Minecraft mc) {
		var overlay = dev.slash3rss.slashclient.hud.Compat.bossOverlay(mc);
		if (overlay == null) return;
		for (var event : ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values()) jobBar(event.getName().getString());
	}

	/** One boss bar's text: a job's level when it is a job's bar. */
	public static void jobBar(String text) {
		java.util.regex.Matcher m = JOB_BAR.matcher(SkyTaskParser.plain(text));
		if (m.find()) job(m.group(1), Long.parseLong(m.group(2)));
	}

	/** The jobs' window ("Prace"): each job's head named "» Górnik (7) «", with its progress in the lore. */
	private static final java.util.regex.Pattern JOB_ITEM = java.util.regex.Pattern.compile("^(?:»|>>)\\s*(\\p{L}[\\p{L} ]*?)\\s*\\((\\d+)\\)\\s*(?:«|<<)$");

	public static void jobsSeen(List<ItemStack> items) {
		for (ItemStack stack : items) {
			if (stack.isEmpty()) continue;
			java.util.regex.Matcher m = JOB_ITEM.matcher(SkyTaskParser.plain(stack.getHoverName().getString()));
			if (!m.matches()) continue;
			// a job, not something else with a number in its name: its lore has the level's progress
			boolean job = false;
			for (var line : SkyDump.lore(stack)) if (SkyTaskParser.plain(line.getString()).toLowerCase(Locale.ROOT).contains("postęp poziomu")) job = true;
			if (job) job(m.group(1), Long.parseLong(m.group(2)));
		}
	}

	/**
	 * A requirement the sidebar answers ("Posiadaj poziom wyspy", "… dowolnej pracy", "… sumę poziomów
	 * prac"), or the dungeon's boss bar ("Dotrzyj do poziomu w dungeonach": the highest level seen), or -1.
	 */
	static long fromSidebar(SkyTaskParser.Section s) {
		String h = s.header.toLowerCase(Locale.ROOT);
		SkyTasks.Data d = SkyTasks.data();
		if (h.startsWith("posiadaj poziom wyspy")) return d.islandLevel;
		if (h.startsWith("dotrzyj do poziomu w dungeon")) return d.dungeonLevel;
		// "Posiadaj poziom: 60 poz.": the player's own experience level
		if (h.equals("posiadaj poziom")) {
			var player = Minecraft.getInstance().player;
			return player == null ? -1 : player.experienceLevel;
		}
		if (d.jobs.isEmpty()) return -1;
		if (h.startsWith("posiadaj poziom dowolnej pracy")) return d.jobs.values().stream().mapToLong(Long::longValue).max().orElse(-1);
		if (h.startsWith("posiadaj sumę poziomów prac")) return d.jobs.values().stream().mapToLong(Long::longValue).sum();
		return -1;
	}

	/** A dungeon's level on its boss bar: the highest one seen is how far the player got. */
	public static void dungeonLevel(long level) {
		SkyTasks.Data d = SkyTasks.data();
		if (d == null || level <= d.dungeonLevel) return;
		d.dungeonLevel = level;
		SkyTasks.changed();
	}

	/** SkyUp's jobs: the sidebar shows them one after another, so all are known once this many came by. */
	static final int JOBS = 7;

	/** Not all of it is known from the sidebar yet: jobs not shown since joining SkyUp the first time are missing. */
	static boolean sidebarEstimate(SkyTaskParser.Section s) {
		String h = s.header.toLowerCase(Locale.ROOT);
		return (h.startsWith("posiadaj poziom dowolnej pracy") || h.startsWith("posiadaj sumę poziomów prac")) && SkyTasks.data().jobs.size() < JOBS;
	}

	// ---------- watched each tick: kills, fish, what is around ----------

	/** A mob the player hit: when, and how many it stood for then (a stacked mob stands for several). */
	private record Hit(long at, int stack) {}

	/** Mobs the player hit: one of them dying, or its stack shrinking, within a few seconds is the player's kill. */
	private static final Map<Integer, Hit> hit = new HashMap<>();

	/** For the test: the kills counted so far. */
	public static long killedForTest;

	/**
	 * How many mobs a stacked one stands for, from its name (SkyUp's "Sztuk: 10"; elsewhere "x11 Krowa", "Krowa x11",
	 * "11x Krowa", "Krowa [x11]"): the server keeps one mob for many alike, and each kill takes one off its number.
	 */
	private static final java.util.regex.Pattern STACK = java.util.regex.Pattern.compile(
		"(?iu)sztuk\\s*:?\\s*(\\d{1,5})|(?:^|[\\s\\[(])(?:[x×]\\s?(\\d{1,5})|(\\d{1,5})\\s?[x×])(?=$|[\\s\\])])");

	/** A mob's number: from its own name, else from a hologram just above it (a stand or a text over the mob). */
	static int stackOf(Entity e) {
		if (e.hasCustomName() && hasStack(e.getCustomName().getString())) return stackOf(e.getCustomName().getString());
		var above = e.getBoundingBox().inflate(0.3, 0, 0.3).expandTowards(0, 1.5, 0);
		for (Entity h : e.level().getEntities(e, above, x -> !(x instanceof LivingEntity) || x instanceof net.minecraft.world.entity.decoration.ArmorStand)) {
			if (h.hasCustomName() && hasStack(h.getCustomName().getString())) return stackOf(h.getCustomName().getString());
		}
		return 1;
	}

	private static boolean hasStack(String name) {
		return STACK.matcher(SkyTaskParser.plain(name)).find();
	}

	static int stackOf(String name) {
		java.util.regex.Matcher m = STACK.matcher(SkyTaskParser.plain(name));
		if (!m.find()) return 1;
		String n = m.group(1) != null ? m.group(1) : m.group(2) != null ? m.group(2) : m.group(3);
		return Math.max(1, Integer.parseInt(n));
	}

	/** For the test: a kill in a dungeon and one out of it, "counted in, counted out" (1 or 0 each). */
	public static String dungeonKillForTest() {
		var player = Minecraft.getInstance().player;
		long before = killedForTest;
		DungeonMap.activeForTest(true);
		killed(player, 1);
		long in = killedForTest - before;
		DungeonMap.activeForTest(false);
		killed(player, 1);
		return in + " " + (killedForTest - before - in);
	}

	/** For the test: the stack each name stands for, space-separated. */
	public static String stacksForTest(String... names) {
		StringBuilder out = new StringBuilder();
		for (String n : names) out.append(out.isEmpty() ? "" : " ").append(stackOf(n));
		return out.toString();
	}

	public static void attacked(Player player, Entity target) {
		if (mine(player) && target instanceof LivingEntity) hit.put(target.getId(), new Hit(System.currentTimeMillis(), stackOf(target)));
	}

	private static void killed(LivingEntity living, int amount) {
		// the dungeon's mobs are no task's: SkyUp does not count them
		if (DungeonMap.active()) return;
		killedForTest += amount;
		add(Kind.KILL, Thing.of(living.isBaby(), false, false, false, living.getType().getDescription().getString(), plEntity(living.getType()), living.getName().getString()), amount);
	}

	/** The fishing hook was out last tick; the inventory as it was when it came back. */
	private static boolean fishing;
	private static long reeledAt;
	private static List<ItemStack> before;

	private static int tick;

	static void tick(Minecraft mc) {
		if (mc.player == null || mc.level == null || !SkyTasks.onSkyUp(mc)) {
			reset();
			return;
		}
		long now = System.currentTimeMillis();
		// blocks broken and placed, a moment later: still broken (another state there now), still placed (the same block)
		pending.removeIf(p -> {
			if (now - p.at() < CONFIRM_MS) return false;
			BlockState there = mc.level.getBlockState(p.pos());
			boolean held = p.was() != null ? !there.equals(p.was()) : there.getBlock() == p.now().getBlock();
			if (held) p.count().run();
			return true;
		});
		// kills: a mob hit dying, or a stacked mob hit standing for fewer (each one fewer a kill)
		hit.entrySet().removeIf(e -> {
			Entity entity = mc.level.getEntity(e.getKey());
			if (entity instanceof LivingEntity living && living.isDeadOrDying()) {
				killed(living, 1);
				return true;
			}
			if (entity instanceof LivingEntity living) {
				int stack = stackOf(living);
				if (stack < e.getValue().stack()) {
					killed(living, e.getValue().stack() - stack);
					// still being fought: kept a while longer, from what it stands for now
					e.setValue(new Hit(now, stack));
				} else if (stack > e.getValue().stack()) {
					// more joined the stack: counted down from there
					e.setValue(new Hit(e.getValue().at(), stack));
				}
			}
			return entity == null || now - e.getValue().at() > 5000;
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
		watchUsed(mc, now);
		readNear(mc);
		watchAround(mc);
		// the sidebar: read again each second
		if (++tick % 20 == 0) {
			readSidebar(mc);
			readBossBar(mc);
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
	/** The creatures around in the last full read ("Stój obok: Żelazny golem"), each as its names. */
	private static List<Thing> nearMobs = List.of();
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
			// and the creatures and things standing in the same cube (an end crystal, a frame): not the player, nor what
			// only lies or flies there (a dropped item, an arrow, experience)
			List<Thing> mobs = new ArrayList<>();
			var box = new net.minecraft.world.phys.AABB(readAt).inflate(NEAR_RADIUS);
			for (var e : mc.level.getEntities(mc.player, box, e -> e.isAlive() && !(e instanceof net.minecraft.world.entity.item.ItemEntity)
					&& !(e instanceof net.minecraft.world.entity.ExperienceOrb) && !(e instanceof net.minecraft.world.entity.projectile.Projectile))) {
				boolean baby = e instanceof LivingEntity living && living.isBaby();
				mobs.add(Thing.of(baby, false, false, false, e.getType().getDescription().getString(), plEntity(e.getType()), e.getName().getString()));
			}
			nearMobs = mobs;
			readX = Integer.MIN_VALUE;
			nearRead = true;
			near.clear();
		}
	}

	/** For the in-game test: what "Stój obok" counts of a thing around the player now. */
	public static long aroundForTest(String thing) {
		return around(Minecraft.getInstance(), thing);
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
			for (Thing mob : nearMobs) if (matches(k, mob)) n++;
			return n;
		});
	}
}
//#endif
