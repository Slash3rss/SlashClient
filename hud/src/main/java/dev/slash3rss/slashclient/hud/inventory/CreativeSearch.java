package dev.slash3rss.slashclient.hud.inventory;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The creative inventory's search, beyond the game's own (the game's language): an item whose
 * Polish or English name has every word typed is found too, with or without Polish letters
 * ("miecz", "sword" and "zelazny" all work in any language). A search for a tag ("#…") is the game's alone.
 */
public final class CreativeSearch {
	private CreativeSearch() {}

	/** Each item's names in both languages, plain (InventorySearch.plain); made once. */
	private static final Map<Item, String> NAMES = new HashMap<>();

	/** Adds to the game's results (`shown`) the items it missed whose Polish or English name matches; whether it added any. */
	public static boolean extend(String query, List<ItemStack> shown) {
		if (SlashHud.config == null || !SlashHud.config.inventorySearch) return false;
		String q = InventorySearch.plain(query == null ? "" : query).strip();
		if (q.isEmpty() || q.startsWith("#")) return false;
		String[] words = q.split("\\s+");
		boolean added = false;
		Set<Item> found = new HashSet<>();
		for (ItemStack s : shown) found.add(s.getItem());
		for (ItemStack stack : CreativeModeTabs.searchTab().getDisplayItems()) {
			Item item = stack.getItem();
			// an item the game found already (its other variants share its name)
			if (found.contains(item)) continue;
			String names = NAMES.computeIfAbsent(item, i -> InventorySearch.plain(InventorySearch.bothLanguages(i.getDescriptionId())));
			boolean all = true;
			for (String w : words) if (!names.contains(w)) all = false;
			if (all) {
				shown.add(stack);
				added = true;
			}
		}
		return added;
	}
}
