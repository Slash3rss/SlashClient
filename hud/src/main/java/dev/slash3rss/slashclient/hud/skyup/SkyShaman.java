// SkyUp's shamanism is played on 26.3: the helper is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * SkyUp's shamanism (skyup.pl/wiki/szamanstwo) for its tasks ("Przyzwij: Wiedźma 0/1"): each mob's
 * recipe – the wand in hand, the main item in the other hand, the experience level and the materials
 * carried – shown under the task with what the player has, and each summon counted. SkyUp's line for
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

	/** The mob a task's requirement names ("Kura", "Niedźwiedź polarny"), or null. */
	static Mob named(String thing) {
		String want = SkyCounters.norm(thing);
		for (Mob mob : MOBS) for (String n : mob.names()) if (SkyCounters.norm(n).equals(want)) return mob;
		return null;
	}

	static Item item(String id) {
		return BuiltInRegistries.ITEM.getOptional(Identifier.withDefaultNamespace(id)).orElse(null);
	}

	/** An item's name in the game's language. */
	static String itemName(String id) {
		Item item = item(id);
		return item == null ? id : Component.translatable(item.getDescriptionId()).getString();
	}

	/** How many of an item the player carries (hands included). */
	static int carried(Minecraft mc, String id) {
		Item item = item(id);
		if (item == null || mc.player == null) return 0;
		int n = 0;
		var inv = mc.player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) if (inv.getItem(i).is(item)) n += inv.getItem(i).getCount();
		return n;
	}

	/** What the recipe still lacks, as the tracker's lines (a mark per piece, the materials short); empty when all is there. */
	static List<String> lacking(Minecraft mc, Mob mob) {
		List<String> out = new ArrayList<>();
		if (mc.player == null) return out;
		Item wand = item(mob.wand()), main = item(mob.main());
		boolean wandOk = wand != null && mc.player.getMainHandItem().is(wand), mainOk = main != null && mc.player.getOffhandItem().is(main);
		boolean levelOk = mc.player.experienceLevel >= mob.level();
		out.add(Component.translatable("slashclient-hud.skyShaman.tools", (wandOk ? "✔ " : "✖ ") + itemName(mob.wand()), (mainOk ? "✔ " : "✖ ") + itemName(mob.main()),
			(levelOk ? "✔ " : "✖ ") + mob.level()).getString());
		for (var e : mob.materials().entrySet()) {
			int have = carried(mc, e.getKey());
			if (have < e.getValue()) out.add(itemName(e.getKey()) + " " + have + "/" + e.getValue());
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
		for (Mob mob : MOBS) {
			Item wand = item(mob.wand()), main = item(mob.main());
			if (wand != null && main != null && hand.is(wand) && other.is(main)) {
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

	/** For the test: as if a right click on a campfire just summoned the mob named so. */
	public static void pendingForTest(String name) {
		pending = named(name);
		pendingAt = System.currentTimeMillis();
	}
}
//#endif
