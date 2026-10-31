package dev.slash3rss.slashclient.hud.cosmetics;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ShieldItem;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * SlashClient skins for held items: a shield ("shield" slot) and a sword or bow ("weapon" slot,
 * sword_… skins for every sword, bow_… for the bow). Only the item in a hand changes (first and
 * third person, mixin.HeldSkinsMixin): the inventory, the hotbar, dropped items, the name and the
 * item itself stay the game's. Our own skin always shows; other players' only when switched on
 * (HudConfig.heldSkinsOthers, off by default: in PvP everyone should recognise a weapon at a glance).
 * An item with a model of its own (a server's resource pack: custom model data, another item model)
 * keeps it. The pictures and models come from scripts/make-held.mjs (held.json, textures/item/held,
 * models/item/held, items/held).
 */
public final class HeldSkins {
	private HeldSkins() {}

	public static final List<String> SLOTS = List.of("shield", "weapon");
	/** id → "shield", "sword" or "bow". */
	static final Map<String, String> KINDS = new LinkedHashMap<>();
	/** A weapon's opaque pixels (16 rows of '#' and '.'), for the menu figure. */
	static final Map<String, String[]> MASKS = new LinkedHashMap<>();
	public static final List<String> SHIELDS, WEAPONS;

	static {
		try (InputStream in = HeldSkins.class.getResourceAsStream("/assets/" + SlashHud.ID + "/held.json")) {
			JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
			for (JsonElement e : root.getAsJsonArray("items")) {
				JsonObject o = e.getAsJsonObject();
				String id = o.get("id").getAsString();
				KINDS.put(id, o.get("kind").getAsString());
				if (o.has("mask")) {
					List<String> rows = new ArrayList<>();
					for (JsonElement r : o.getAsJsonArray("mask")) rows.add(r.getAsString());
					MASKS.put(id, rows.toArray(String[]::new));
				}
			}
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient held item skins could not be read", e);
		}
		SHIELDS = KINDS.entrySet().stream().filter(e -> e.getValue().equals("shield")).map(Map.Entry::getKey).toList();
		WEAPONS = KINDS.entrySet().stream().filter(e -> !e.getValue().equals("shield")).map(Map.Entry::getKey).toList();
	}

	/** A weapon's opaque pixels (16 rows, # for a pixel), or null. */
	public static String[] mask(String id) {
		return MASKS.get(id);
	}

	/** "shield", "sword" or "bow" (null: not ours). */
	public static String kind(String id) {
		return KINDS.get(id);
	}

	/** How many held items were drawn with a skin (for the tests). */
	public static int swapped;

	/** The skin for an item held by `owner` and drawn in `context`, or null for the game's own look. */
	public static String skinFor(Entity owner, ItemStack stack, ItemDisplayContext context) {
		if (context != ItemDisplayContext.FIRST_PERSON_RIGHT_HAND && context != ItemDisplayContext.FIRST_PERSON_LEFT_HAND
			&& context != ItemDisplayContext.THIRD_PERSON_RIGHT_HAND && context != ItemDisplayContext.THIRD_PERSON_LEFT_HAND) return null;
		if (!(owner instanceof Player player)) return null;
		var mc = Minecraft.getInstance();
		boolean self = mc.player != null && player.getUUID().equals(mc.player.getUUID());
		String skin = pick(player.getUUID(), self, stack);
		if (skin != null) swapped++;
		return skin;
	}

	/** The skin `id` (ourselves when `self`) shows on this item, or null. */
	public static String pick(UUID id, boolean self, ItemStack stack) {
		HudConfig c = SlashHud.config;
		if (c == null || stack == null || stack.isEmpty()) return null;
		if (!self && !c.heldSkinsOthers) return null;
		String slot, want;
		if (stack.getItem() instanceof ShieldItem) {
			slot = "shield";
			want = "shield";
		} else if (stack.is(ItemTags.SWORDS)) {
			slot = "weapon";
			want = "sword";
		} else if (stack.is(Items.BOW)) {
			slot = "weapon";
			want = "bow";
		} else return null;
		String skin = Cosmetics.worn(id, slot);
		if (skin == null || !want.equals(KINDS.get(skin)) || !vanillaLook(stack)) return null;
		return skin;
	}

	/** Whether the item looks as the game's own (no model of a server's resource pack on it). */
	static boolean vanillaLook(ItemStack stack) {
		//#if MC >= 1.21.4
		if (stack.has(net.minecraft.core.component.DataComponents.CUSTOM_MODEL_DATA)) return false;
		return java.util.Objects.equals(stack.get(net.minecraft.core.component.DataComponents.ITEM_MODEL),
			stack.getItem().components().get(net.minecraft.core.component.DataComponents.ITEM_MODEL));
		//#elif MC >= 1.20.5
		//$ return !stack.has(net.minecraft.core.component.DataComponents.CUSTOM_MODEL_DATA);
		//#else
		//$ return stack.getTag() == null || !stack.getTag().contains("CustomModelData");
		//#endif
	}

	/** The item model of a skin (items/held/<id>.json, 1.21.4+). */
	public static Identifier itemModel(String skin) {
		return Identifier.fromNamespaceAndPath(SlashHud.ID, "held/" + skin);
	}

	//#if MC < 1.21.4
	//$ /** Before item models: the models the game is asked to load as well (models/item/held/legacy and those they name). */
	//$ public static List<Identifier> legacyModels() {
	//$ 	List<Identifier> ids = new ArrayList<>();
	//$ 	for (String id : KINDS.keySet()) {
	//$ 		ids.add(legacyModel(id, ""));
	//$ 		if (KINDS.get(id).equals("shield")) ids.add(legacyModel(id, BLOCKING));
	//$ 	}
	//$ 	return ids;
	//$ }
	//$
	//$ /** The blocking shield's model: the game held it otherwise in 1.20.1. */
	//#if MC >= 1.20.2
	//$ private static final String BLOCKING = "_blocking";
	//#else
	//$ private static final String BLOCKING = "_blocking_120";
	//#endif
	//$
	//$ private static Identifier legacyModel(String id, String suffix) {
	//$ 	return Identifier.fromNamespaceAndPath(SlashHud.ID, "item/held/legacy/" + id + suffix);
	//$ }
	//$
	//$ /** The model to draw instead of `model` (the game's, already picked for the item), or `model` itself. */
	//$ public static net.minecraft.client.resources.model.BakedModel legacy(net.minecraft.client.resources.model.BakedModel model, net.minecraft.world.entity.LivingEntity owner,
	//$ 		ItemStack stack, ItemDisplayContext context, net.minecraft.world.level.Level level) {
	//$ 	String skin = skinFor(owner, stack, context);
	//$ 	if (skin == null) return model;
	//$ 	// a shield a resource pack gave a model of its own keeps it
	//$ 	if (KINDS.get(skin).equals("shield") && !model.isCustomRenderer()) return model;
	//$ 	boolean blocking = KINDS.get(skin).equals("shield") && owner.isUsingItem() && owner.getUseItem() == stack;
	//$ 	var manager = Minecraft.getInstance().getModelManager();
	//$ 	var ours = manager.getModel(legacyModel(skin, blocking ? BLOCKING : ""));
	//$ 	if (ours == null || ours == manager.getMissingModel()) return model;
	//$ 	// a bow's model picks its drawn picture itself
	//$ 	var resolved = ours.getOverrides().resolve(ours, stack, level instanceof net.minecraft.client.multiplayer.ClientLevel cl ? cl : null, owner, 0);
	//$ 	return resolved == null ? ours : resolved;
	//$ }
	//#endif
}
