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
		/** How it looks: the item as SkyUp shows it (its own model from the server's pack), name and lore left out. */
		public com.google.gson.JsonElement look;
	}

	/** The looks as items, made once from the saved ones. */
	private static final Map<String, ItemStack> looks = new java.util.HashMap<>();

	/** The fish's item as SkyUp draws it, or null before one was seen (or outside a world). */
	public static ItemStack look(Fish f) {
		Minecraft mc = Minecraft.getInstance();
		if (f.look == null || mc.level == null) return null;
		return looks.computeIfAbsent(key(f.name), k -> {
			var ops = mc.level.registryAccess().createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE);
			return ItemStack.CODEC.parse(ops, f.look).result().orElse(ItemStack.EMPTY);
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

	/** All species, by name. */
	public static List<Fish> all() {
		List<Fish> out = new ArrayList<>(data().fish.values());
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
		caught(species, grams, price, size, ItemStack.EMPTY);
	}

	static void caught(String species, double grams, double price, String size, ItemStack fish) {
		if (species.isEmpty()) return;
		Data d = data();
		Fish f = d.fish.computeIfAbsent(key(species), k -> {
			Fish n = new Fish();
			n.name = species;
			return n;
		});
		f.caught++;
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
