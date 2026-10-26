// SkyUp's fishing is played on 26.3: the fish atlas is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;

import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The fish atlas (SkyAtlasScreen): every species SkyUp has, what the player caught of each and their
 * records, kept per account. Read from the fisherman's "Moje okazy" window (each fish: "Wyłowiono » 3",
 * "Rekord wagi » 2 450g (spory)", "Rekord ceny » 12,5 SC", "Maksymalna waga » 45 000g", "Ciekawostka »
 * …"; one not caught yet: "Nie złowiono."), both of its pages; between two looks each catch from the
 * chat (SkyFish) adds one and may beat a record.
 */
public final class SkyAtlas {
	private SkyAtlas() {}

	/** One species: what the window said and what was caught since. */
	public static final class Fish {
		public String name = "";
		public long caught;
		public double recordGrams, recordPrice, maxGrams;
		public String recordSize = "", fact = "";
		/** The window showed its details (a species not caught shows only its name on some accounts). */
		public boolean known;
		/** Its card was turned over in the album since it was first caught (a new one is, once, with sparkles). */
		public boolean revealed;
		/** How it looks: the item as SkyUp shows it (its own model from the server's pack), name and lore left out. */
		public com.google.gson.JsonElement look;
		/** Each one caught since the atlas keeps them, newest last (the window only tells how many and the records). */
		public List<Catch> catches = new ArrayList<>();

		public List<Catch> catches() {
			if (catches == null) catches = new ArrayList<>();
			return catches;
		}
	}

	/** One fish caught: when, its weight (g), size, quality and what the fisherman pays (SC; -1 not known). */
	public record Catch(long at, double grams, String size, String quality, double price) {}

	/** The most catches kept of one species (the oldest go). */
	private static final int CATCHES_KEPT = 500;

	/** The looks as items, made once from the saved ones. */
	private static final Map<String, ItemStack> looks = new java.util.HashMap<>();

	/**
	 * Each species' model in SkyUp's pack: a cod with this custom model data (read from its "Moje okazy"
	 * window), so a card shows the real fish before one was seen.
	 */
	static final Map<String, Integer> MODELS = models(Map.ofEntries(
		Map.entry("Amur biały", 10101), Map.entry("Amur czarny", 10102), Map.entry("Bass słoneczny", 10142),
		Map.entry("Białorybica", 10103), Map.entry("Boleń", 10104), Map.entry("Brzana aralska", 10143), Map.entry("Buffalo", 10144),
		Map.entry("Certa", 10145), Map.entry("Ciernik", 10147), Map.entry("Ciosa", 10146), Map.entry("Czawycza", 10148),
		Map.entry("Dorsz atlantycki", 10131), Map.entry("Flądra", 10133), Map.entry("Golec arktyczny", 10105),
		Map.entry("Golec czerwony", 10106), Map.entry("Gorbusza", 10149), Map.entry("Halibut atlantycki", 10132),
		Map.entry("Jazgarz", 10139), Map.entry("Jaź", 10107), Map.entry("Jesiotr bałtycki", 10108),
		Map.entry("Jesiotr gwiaździsty", 10150), Map.entry("Jesiotr rosyjski", 10109), Map.entry("Karaś srebrzysty", 10110),
		Map.entry("Karaś złocisty", 10111), Map.entry("Karp golec", 10151), Map.entry("Karp koi", 10112),
		Map.entry("Karp lustrzeń", 10152), Map.entry("Karp pospolity", 10113), Map.entry("Kiżucz", 10153), Map.entry("Kleń", 10154),
		Map.entry("Krąp", 10155), Map.entry("Leszcz", 10114), Map.entry("Lin", 10156), Map.entry("Lipień", 10115),
		Map.entry("Makrela atlantycka", 10134), Map.entry("Malma", 10157), Map.entry("Marlin błękitny", 10140),
		Map.entry("Mintaj", 10135), Map.entry("Minóg", 10158), Map.entry("Miętus", 10117), Map.entry("Morszczuk zwyczajny", 10136),
		Map.entry("Muksun", 10159), Map.entry("Nelma", 10160), Map.entry("Nerka", 10161), Map.entry("Okoń", 10118),
		Map.entry("Omul bajkalski", 10162), Map.entry("Palia jeziorowa", 10163), Map.entry("Peluga", 10164),
		Map.entry("Pstrąg potokowy", 10120), Map.entry("Pstrąg sewański", 10165), Map.entry("Płoć", 10119),
		Map.entry("Rozdymka tygrysia", 10121), Map.entry("Sandacz", 10122), Map.entry("Sapa", 10167), Map.entry("Sardela", 10137),
		Map.entry("Sazan", 10166), Map.entry("Sieja ostronosa", 10123), Map.entry("Sum", 10125), Map.entry("Szczupak", 10126),
		Map.entry("Szprotka", 10168), Map.entry("Tajmień", 10169), Map.entry("Tołpyga biała", 10171),
		Map.entry("Tołpyga pstra", 10127), Map.entry("Tuńczyk pospolity", 10141), Map.entry("Ukleja", 10128),
		Map.entry("Welon", 10170), Map.entry("Wzdręga", 10138), Map.entry("Węgorz", 10129), Map.entry("Złoty lin", 10130),
		Map.entry("Łosoś atlantycki", 10116), Map.entry("Śledź czarnomorski", 10124), Map.entry("Żarłacz tępogłowy", 10172)));

	private static Map<String, Integer> models(Map<String, Integer> byName) {
		Map<String, Integer> out = new java.util.HashMap<>();
		byName.forEach((name, model) -> out.put(key(name), model));
		return out;
	}

	/** The fish's item as SkyUp draws it: the one seen, else a cod with its species' model; null if neither (or outside a world). */
	public static ItemStack look(Fish f) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return null;
		if (f.look == null) {
			Integer model = MODELS.get(key(f.name));
			if (model == null) return null;
			return looks.computeIfAbsent(key(f.name), k -> {
				ItemStack cod = new ItemStack(net.minecraft.world.item.Items.COD);
				cod.set(net.minecraft.core.component.DataComponents.CUSTOM_MODEL_DATA,
					new net.minecraft.world.item.component.CustomModelData(List.of((float) model), List.of(), List.of(), List.of()));
				return cod;
			});
		}
		return looks.computeIfAbsent(key(f.name), k -> {
			var ops = mc.level.registryAccess().createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE);
			return ItemStack.CODEC.parse(ops, f.look).result().orElse(ItemStack.EMPTY);
		});
	}

	/** SkyUp's pack has a grey "not caught yet" picture of each fish (a red pane with the fish's model number). */
	private static final net.minecraft.resources.Identifier HIDDEN_MODEL =
		net.minecraft.resources.Identifier.parse("skyup:models/item/przedmioty/ryba/nieodblokowana/amur_bialy.json");
	private static final Map<String, ItemStack> hidden = new java.util.HashMap<>();

	/** A species not caught yet as SkyUp's own window shows it, or null without SkyUp's pack (a plain red pane then). */
	public static ItemStack hidden(Fish f) {
		Minecraft mc = Minecraft.getInstance();
		Integer model = MODELS.get(key(f.name));
		if (model == null || mc.getResourceManager().getResource(HIDDEN_MODEL).isEmpty()) return null;
		return hidden.computeIfAbsent(key(f.name), k -> {
			ItemStack pane = new ItemStack(net.minecraft.core.registries.BuiltInRegistries.ITEM.getValue(net.minecraft.resources.Identifier.withDefaultNamespace("red_stained_glass_pane")));
			pane.set(net.minecraft.core.component.DataComponents.CUSTOM_MODEL_DATA,
				new net.minecraft.world.item.component.CustomModelData(List.of((float) model), List.of(), List.of(), List.of()));
			return pane;
		});
	}

	/** Keeps how a fish looks (only an actual fish's item, not the window's placeholder pane). */
	private static void keepLook(Fish f, ItemStack stack) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null || stack.getItem() instanceof net.minecraft.world.item.BlockItem) return;
		ItemStack plain = stack.copyWithCount(1);
		plain.remove(net.minecraft.core.component.DataComponents.LORE);
		plain.remove(net.minecraft.core.component.DataComponents.CUSTOM_NAME);
		var ops = mc.level.registryAccess().createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE);
		ItemStack.CODEC.encodeStart(ops, plain).result().ifPresent(json -> {
			f.look = json;
			looks.remove(key(f.name));
		});
	}

	static final class Data {
		Map<String, Fish> fish = new LinkedHashMap<>();
		long seen;
	}

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Data data;
	private static Path loadedFrom;

	/** The account's file, next to its tasks. */
	static Path file() {
		var user = Minecraft.getInstance().getUser();
		java.util.UUID id = user == null ? null : user.getProfileId();
		Path dir = SkyTasks.FILE.getParent();
		return dir.resolve(id == null ? "atlas.json" : "atlas-" + id.toString().replace("-", "") + ".json");
	}

	static Data data() {
		Path file = file();
		if (data == null || !file.equals(loadedFrom)) {
			loadedFrom = file;
			data = null;
			try {
				if (Files.exists(file)) data = GSON.fromJson(Files.readString(file), Data.class);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp fish atlas: {}", e.toString());
			}
			if (data == null) data = new Data();
			if (data.fish == null) data.fish = new LinkedHashMap<>();
		}
		return data;
	}

	/** A new species' card was turned over in the album: from now on it lies face up. */
	public static void revealed(Fish f) {
		if (f.revealed) return;
		f.revealed = true;
		if (data().fish.containsValue(f)) save();
	}

	private static void save() {
		try {
			Files.createDirectories(loadedFrom.getParent());
			Files.writeString(loadedFrom, GSON.toJson(data));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: SkyUp fish atlas: {}", e.toString());
		}
	}

	/** A species' name compared without case, Polish letters and spaces (the fish's id is "tunczyk_pospolity"). */
	static String key(String name) {
		String s = Normalizer.normalize(SkyTaskParser.plain(name).toLowerCase(Locale.ROOT).replace('ł', 'l'), Normalizer.Form.NFD);
		return s.replaceAll("\\p{M}", "").replaceAll("[^a-z0-9]", "");
	}

	/**
	 * Every species SkyUp has (its "Moje okazy" window, both pages), so the album has a card for each
	 * from the start; a species the window lists that is not here (a new one) joins them when it is read.
	 */
	static final List<String> SPECIES = List.of(
		"Amur biały", "Amur czarny", "Bass słoneczny", "Białorybica", "Boleń", "Brzana aralska", "Buffalo", "Certa", "Ciernik",
		"Ciosa", "Czawycza", "Dorsz atlantycki", "Flądra", "Golec arktyczny", "Golec czerwony", "Gorbusza", "Halibut atlantycki",
		"Jazgarz", "Jaź", "Jesiotr bałtycki", "Jesiotr gwiaździsty", "Jesiotr rosyjski", "Karaś srebrzysty", "Karaś złocisty",
		"Karp golec", "Karp koi", "Karp lustrzeń", "Karp pospolity", "Kiżucz", "Kleń", "Krąp", "Leszcz", "Lin", "Lipień",
		"Makrela atlantycka", "Malma", "Marlin błękitny", "Mintaj", "Minóg", "Miętus", "Morszczuk zwyczajny", "Muksun", "Nelma",
		"Nerka", "Okoń", "Omul bajkalski", "Palia jeziorowa", "Peluga", "Pstrąg potokowy", "Pstrąg sewański", "Płoć",
		"Rozdymka tygrysia", "Sandacz", "Sapa", "Sardela", "Sazan", "Sieja ostronosa", "Sum", "Szczupak", "Szprotka", "Tajmień",
		"Tołpyga biała", "Tołpyga pstra", "Tuńczyk pospolity", "Ukleja", "Welon", "Wzdręga", "Węgorz", "Złoty lin", "Łosoś atlantycki",
		"Śledź czarnomorski", "Żarłacz tępogłowy");

	/** All species, by name: the ones known so far and the rest of SkyUp's, not caught yet. */
	public static List<Fish> all() {
		Map<String, Fish> known = data().fish;
		List<Fish> out = new ArrayList<>(known.values());
		for (String name : SPECIES) {
			if (known.containsKey(key(name))) continue;
			Fish f = new Fish();
			f.name = name;
			out.add(f);
		}
		out.sort(Comparator.comparing(f -> f.name.toLowerCase(new Locale("pl"))));
		return out;
	}

	// ---------- the window ----------

	private static final Pattern TITLE = Pattern.compile("^(?:»|>>)\\s*(.+?)\\s*(?:«|<<)$");
	private static final Pattern NUMBER = Pattern.compile("([\\d  ]+(?:[.,]\\d+)?)");

	/** Whether a window is the fisherman's "Moje okazy". */
	public static boolean window(String title) {
		return SkyTaskParser.plain(title).toLowerCase(Locale.ROOT).contains("moje okazy");
	}

	/** The fish of one page of "Moje okazy" (the other items, the page's buttons and the records, aside). */
	public static void seen(List<ItemStack> items) {
		Data d = data();
		boolean changed = false;
		for (ItemStack stack : items) {
			if (stack.isEmpty()) continue;
			Matcher t = TITLE.matcher(SkyTaskParser.plain(stack.getHoverName().getString()));
			if (!t.matches()) continue;
			List<String> lines = new ArrayList<>();
			for (Component line : SkyDump.lore(stack)) lines.add(SkyTaskParser.plain(line.getString()).replaceFirst("^[▪■•\\s]+", ""));
			boolean notCaught = lines.stream().anyMatch(l -> l.toLowerCase(Locale.ROOT).startsWith("nie złowiono"));
			boolean details = lines.stream().anyMatch(l -> l.toLowerCase(Locale.ROOT).startsWith("wyłowiono"));
			if (!notCaught && !details) continue;
			Fish f = d.fish.computeIfAbsent(key(t.group(1)), k -> new Fish());
			f.name = t.group(1);
			if (notCaught && !details) {
				f.caught = 0;
				changed = true;
				continue;
			}
			f.known = true;
			keepLook(f, stack);
			StringBuilder fact = null;
			for (String l : lines) {
				String lower = l.toLowerCase(Locale.ROOT);
				if (fact != null) {
					if (l.isBlank() || l.contains("»")) {
						f.fact = fact.toString().strip();
						fact = null;
					} else {
						fact.append(' ').append(l.strip());
						continue;
					}
				}
				String value = l.contains("»") ? l.substring(l.indexOf('»') + 1).strip() : "";
				if (lower.startsWith("wyłowiono")) f.caught = (long) first(value);
				else if (lower.startsWith("rekord wagi")) {
					f.recordGrams = first(value);
					int open = value.indexOf('('), close = value.indexOf(')');
					f.recordSize = open >= 0 && close > open ? value.substring(open + 1, close).strip() : "";
				} else if (lower.startsWith("rekord ceny")) f.recordPrice = first(value);
				else if (lower.startsWith("maksymalna waga")) f.maxGrams = first(value);
				else if (lower.startsWith("ciekawostka")) fact = new StringBuilder(value);
			}
			if (fact != null) f.fact = fact.toString().strip();
			changed = true;
		}
		if (changed) {
			d.seen = System.currentTimeMillis();
			save();
		}
	}

	private static double first(String s) {
		Matcher m = NUMBER.matcher(s);
		if (!m.find()) return 0;
		try {
			return Double.parseDouble(m.group(1).replaceAll("[  ]", "").replace(',', '.'));
		} catch (NumberFormatException e) {
			return 0;
		}
	}

	// ---------- a catch ----------

	/** A fish caught (SkyFish, from the chat): one more of its species, and maybe a record. */
	static void caught(String species, double grams, double price, String size) {
		caught(species, grams, price, size, "", ItemStack.EMPTY);
	}

	static void caught(String species, double grams, double price, String size, String quality, ItemStack fish) {
		if (species.isEmpty()) return;
		Data d = data();
		Fish f = d.fish.computeIfAbsent(key(species), k -> {
			Fish n = new Fish();
			n.name = species;
			return n;
		});
		f.caught++;
		f.catches().add(new Catch(System.currentTimeMillis(), grams, size, quality, price));
		while (f.catches().size() > CATCHES_KEPT) f.catches().remove(0);
		if (grams > f.recordGrams) {
			f.recordGrams = grams;
			f.recordSize = size;
		}
		if (price > f.recordPrice) f.recordPrice = price;
		if (f.look == null && !fish.isEmpty()) keepLook(f, fish);
		save();
	}

	/** For the in-game test: no atlas yet. */
	public static void resetForTest() {
		looks.clear();
		data = new Data();
		loadedFrom = file();
		save();
	}
}
//#endif
