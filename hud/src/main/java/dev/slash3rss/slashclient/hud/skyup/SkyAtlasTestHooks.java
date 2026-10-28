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
			item(Items.GLASS_PANE, "» Certa «", "", "▪ Nie złowiono.", ""),
			item(Items.PLAYER_HEAD, "» Następna strona «", "", "▪ LPM » Następna strona")));
		// catches from the chat: one more Boleń (its first record), two more Amur (one the heaviest yet)
		SkyAtlas.caught("Boleń", 1830, 7.4, "niewielki");
		SkyAtlas.caught("Amur biały", 1210, 6.1, "przeciętny", "zjadliwy", ItemStack.EMPTY);
		SkyAtlas.caught("Amur biały", 39200, 98.5, "ogromny", "wyśmienity", ItemStack.EMPTY);
		StringBuilder out = new StringBuilder();
		List<SkyAtlas.Fish> read = new ArrayList<>(SkyAtlas.data().fish.values());
		read.sort(java.util.Comparator.comparing(f -> f.name));
		for (SkyAtlas.Fish f : read)
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

	/** A species not caught yet, as its card draws it: a cod with its model from SkyUp's pack. */
	public static String unseenLook() {
		SkyAtlas.Fish sapa = new SkyAtlas.Fish();
		sapa.name = "Sapa";
		ItemStack look = SkyAtlas.look(sapa);
		var model = look == null ? null : look.get(DataComponents.CUSTOM_MODEL_DATA);
		return look == null ? "none" : look.getItem() + " " + (model == null ? "-" : model.floats());
	}

	/**
	 * What goes to the server: after the page and catches of readPage, the species caught or seen
	 * with their summaries and those catches; then, with a long list of new catches, parts that keep
	 * under the size and count limits, oldest first, only the ones the server does not have yet.
	 */
	public static String uploadParts() {
		readPage();
		SkyAtlas.Data d = SkyAtlas.data();
		StringBuilder out = new StringBuilder();
		List<SkyAtlas.Part> first = SkyAtlas.parts(d);
		List<String> keys = new ArrayList<>();
		int catches = 0;
		for (SkyAtlas.Part p : first) {
			for (var e : p.body().getAsJsonArray("species")) keys.add(e.getAsJsonObject().get("key").getAsString());
			catches += p.body().getAsJsonArray("catches").size();
		}
		var amur = first.getFirst().body().getAsJsonArray("species").asList().stream().map(e -> e.getAsJsonObject())
			.filter(o -> o.get("key").getAsString().equals("amurbialy")).findFirst().orElseThrow();
		out.append(first.size()).append(' ').append(String.join(",", keys.stream().sorted().toList())).append(" catches=").append(catches)
			.append(" amur=").append(amur.get("caught").getAsLong()).append('/').append(Math.round(amur.get("recordGrams").getAsDouble()))
			.append('/').append(amur.get("fact").getAsString().isEmpty() ? "-" : "fact").append(" | ");
		// 400 more Sum catches, the first 100 already on the server
		long base = 1_800_000_000_000L;
		SkyAtlas.Fish sum = d.fish.get(SkyAtlas.key("Sum"));
		for (int i = 0; i < 400; i++) sum.catches().add(new SkyAtlas.Catch(base + i, 1000 + i, "duży", "dobra", i % 7 == 0 ? -1 : 12.5));
		d.uploadedUpTo = base + 99;
		List<SkyAtlas.Part> parts = SkyAtlas.parts(d);
		long last = base + 99;
		int sent = 0;
		boolean ok = parts.size() > 1;
		for (SkyAtlas.Part p : parts) {
			ok &= p.body().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= SkyAtlas.PART_BYTES;
			var arr = p.body().getAsJsonArray("catches");
			ok &= arr.size() <= SkyAtlas.PART_CATCHES;
			for (var e : arr) {
				long at = e.getAsJsonObject().get("at").getAsLong();
				ok &= at == last + 1;
				last = at;
				sent++;
			}
			ok &= p.upTo() == last;
		}
		return out.append(ok ? "ok" : "bad").append(" sent=").append(sent).append(" upTo=").append(last - base).toString();
	}

	/** The album as the player sees it opened: its cards being dealt. */
	public static void openMoving() {
		open(null);
		SkyAtlasScreen.still = false;
	}

	/** Whether the caught species' cards were turned over for good (they are, after their reveal). */
	public static String revealed() {
		StringBuilder out = new StringBuilder();
		for (SkyAtlas.Fish f : SkyAtlas.all()) if (f.caught > 0) out.append(f.name).append('=').append(f.revealed).append(' ');
		return out.toString().strip();
	}

	/** The atlas: the album (null) or one species open. */
	public static void open(String chosen) {
		SkyAtlasScreen.still = true;
		var screen = new SkyAtlasScreen(null);
		screen.choose(chosen, "all");
		Minecraft.getInstance().setScreenAndShow(screen);
	}
}
//#endif
