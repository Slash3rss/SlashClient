// SkyUp's fishing is played on 26.3: the fish atlas is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemLore;

import java.util.ArrayList;
import java.util.List;

/** The fish atlas for the in-game test (src/gametest GameSkyAtlas): a page of "Moje okazy" as SkyUp shows it. */
public final class SkyAtlasTestHooks {
	private SkyAtlasTestHooks() {}

	private static ItemStack item(net.minecraft.world.item.Item kind, String name, String... lore) {
		ItemStack s = new ItemStack(kind);
		s.set(DataComponents.CUSTOM_NAME, Component.literal(name));
		List<Component> lines = new ArrayList<>();
		for (String l : lore) lines.add(Component.literal(l));
		s.set(DataComponents.LORE, new ItemLore(lines));
		return s;
	}

	/** SkyUp's own model for the fish (its pack draws each species in its own way). */
	private static ItemStack look(ItemStack s) {
		s.set(DataComponents.CUSTOM_MODEL_DATA, new net.minecraft.world.item.component.CustomModelData(List.of(1001f), List.of(), List.of(), List.of()));
		return s;
	}

	/** A page: the records' head (no fish), two fish with their details, one not caught, the page's button. */
	public static String readPage() {
		SkyAtlas.resetForTest();
		SkyAtlas.seen(List.of(
			item(Items.PLAYER_HEAD, "» Moje rekordy «", "", "▪ Wyłowione ryby » 4", "▪ Najcięższa ryba » Sum (12 400g)"),
			look(item(Items.COD, "» Amur biały «", "", "▪ Wyłowiono » 3", "", "▪ Rekord wagi » 2 450g (spory)", "▪ Rekord ceny » 12,5 SC", "",
				"▪ Maksymalna waga » 45 000g", "▪ Ciekawostka » Pochodzi z Azji -", "  dorzecza Amuru.", "")),
			item(Items.COD, "» Sum «", "", "▪ Wyłowiono » 1", "", "▪ Rekord wagi » 12 400g (duży)", "▪ Rekord ceny » 40 SC", "",
				"▪ Maksymalna waga » 150 000g", "▪ Ciekawostka » Największa ryba słodkowodna Europy.", ""),
			item(Items.GLASS_PANE, "» Boleń «", "", "▪ Nie złowiono.", ""),
			item(Items.PLAYER_HEAD, "» Następna strona «", "", "▪ LPM » Następna strona")));
		// a catch from the chat: one more Boleń, its first record
		SkyAtlas.caught("Boleń", 1830, 7.4, "niewielki");
		StringBuilder out = new StringBuilder();
		for (SkyAtlas.Fish f : SkyAtlas.all())
			out.append(f.name).append(' ').append(f.caught).append(' ').append(Math.round(f.recordGrams)).append('/').append(Math.round(f.maxGrams)).append(f.fact.isEmpty() ? "" : " fact").append(f.look == null ? "" : " look").append(" | ");
		return out.toString().strip();
	}

	/** What the GUI dump says of a fish's item beyond its name and lore (its model and the server's data). */
	public static String dumpData() {
		ItemStack fish = look(item(Items.COD, "» Amur biały «", "▪ Wyłowiono » 3"));
		var tag = new net.minecraft.nbt.CompoundTag();
		tag.putString("kfishing:fish_id", "amur_bialy");
		fish.set(DataComponents.CUSTOM_DATA, net.minecraft.world.item.component.CustomData.of(tag));
		return String.join(" | ", SkyDump.components(Minecraft.getInstance(), fish));
	}

	public static void open(String chosen) {
		var screen = new SkyAtlasScreen(null);
		screen.choose(chosen, "all");
		Minecraft.getInstance().setScreenAndShow(screen);
	}
}
//#endif
