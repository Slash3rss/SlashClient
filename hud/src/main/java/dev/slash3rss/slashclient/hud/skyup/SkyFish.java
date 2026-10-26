// SkyUp's fishing is played on 26.3: the fish counter is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.HudModule;
import dev.slash3rss.slashclient.hud.Modules;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * SkyUp's fish counted: this session (since joining the server) and for good (saved), with their
 * weight and what the fisherman pays, and split by size, species or quality when asked.
 *
 * Each catch comes from SkyUp's chat line "Wędkarstwo » Wyłowiono: …", which carries the fish
 * (SkyCounters.onChat). A fish's lore: "Waga » 22 013,82g (przeciętny)", "Jakość » 9% (niezjadliwy)",
 * "Sprzedaj u Wędkarza za 19,81 SC."; its species is in its data ("kfishing:fish_id") or its name
 * ("Przeciętny, niezjadliwy Tuńczyk pospolity").
 */
public final class SkyFish {
	private SkyFish() {}

	/** Fish counted: how many, their weight (g) and value (SC), and by size, species and quality. */
	static final class Tally {
		long count;
		double grams, value;
		Map<String, Long> sizes = new LinkedHashMap<>(), species = new LinkedHashMap<>(), qualities = new LinkedHashMap<>();

		void add(String size, String kind, String quality, double g, double sc) {
			count++;
			grams += Math.max(0, g);
			value += Math.max(0, sc);
			if (!size.isEmpty()) sizes.merge(size, 1L, Long::sum);
			if (!kind.isEmpty()) species.merge(kind, 1L, Long::sum);
			if (!quality.isEmpty()) qualities.merge(quality, 1L, Long::sum);
		}

		Map<String, Long> by(String split) {
			return switch (split) {
				case "size" -> sizes;
				case "species" -> species;
				case "quality" -> qualities;
				default -> Map.of();
			};
		}
	}

	public static final String[] SPLITS = { "none", "size", "species", "quality" };

	static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("ryby.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Tally lifetime;
	static Tally session = new Tally();

	static Tally lifetime() {
		if (lifetime == null) {
			try {
				if (Files.exists(FILE)) lifetime = GSON.fromJson(Files.readString(FILE), Tally.class);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp fish: {}", e.toString());
			}
			if (lifetime == null) lifetime = new Tally();
			if (lifetime.sizes == null) lifetime.sizes = new LinkedHashMap<>();
			if (lifetime.species == null) lifetime.species = new LinkedHashMap<>();
			if (lifetime.qualities == null) lifetime.qualities = new LinkedHashMap<>();
		}
		return lifetime;
	}

	private static void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(lifetime()));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: SkyUp fish: {}", e.toString());
		}
	}

	/** A new server: a new session. */
	public static void joined() {
		session = new Tally();
	}

	private static final Pattern WEIGHT = Pattern.compile("Waga\\s*(?:»|>>|:)\\s*([\\d  ]+(?:[.,]\\d+)?)\\s*g\\b\\s*(?:\\(([^)]+)\\))?");
	private static final Pattern QUALITY = Pattern.compile("Jakość\\s*(?:»|>>|:)\\s*[\\d.,]+\\s*%\\s*(?:\\(([^)]+)\\))?");
	private static final Pattern PRICE = Pattern.compile("za\\s+([\\d  ]+(?:[.,]\\d+)?)\\s*SC");

	private static double number(String s) {
		return Double.parseDouble(s.replaceAll("[  ]", "").replace(',', '.'));
	}

	/** One fish caught (from the chat line). */
	static void caught(ItemStack fish) {
		double grams = -1, value = -1;
		String size = "", quality = "";
		for (Component line : SkyDump.lore(fish)) {
			String text = SkyTaskParser.plain(line.getString());
			Matcher w = WEIGHT.matcher(text), q = QUALITY.matcher(text), p = PRICE.matcher(text);
			if (w.find()) {
				grams = number(w.group(1));
				if (w.group(2) != null) size = w.group(2).strip().toLowerCase(Locale.ROOT);
			}
			if (q.find() && q.group(1) != null) quality = q.group(1).strip().toLowerCase(Locale.ROOT);
			if (text.toLowerCase(Locale.ROOT).startsWith("sprzedaj") && p.find()) value = number(p.group(1));
		}
		String kind = species(fish);
		session.add(size, kind, quality, grams, value);
		lifetime().add(size, kind, quality, grams, value);
		save();
		SkyAtlas.caught(kind, grams, value, size, quality, fish);
	}

	/** The species: SkyUp's own id in the item's data, or the name without its two words of size and quality. */
	static String species(ItemStack fish) {
		var data = fish.get(DataComponents.CUSTOM_DATA);
		if (data != null) {
			String id = data.copyTag().getCompoundOrEmpty("PublicBukkitValues").getStringOr("kfishing:fish_id", "");
			if (!id.isEmpty()) return capital(id.toLowerCase(Locale.ROOT));
		}
		String name = SkyTaskParser.plain(fish.getHoverName().getString());
		// "Przeciętny, niezjadliwy Tuńczyk pospolity": after the comma, without the quality's word
		int comma = name.indexOf(", ");
		if (comma >= 0) {
			String rest = name.substring(comma + 2);
			int space = rest.indexOf(' ');
			return space > 0 ? capital(rest.substring(space + 1)) : rest;
		}
		return name;
	}

	private static String capital(String s) {
		return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
	}

	// ---------- on the HUD ----------

	private record Row(String left, int leftColor, String right) {}

	private static String weight(double grams) {
		return grams >= 1000 ? String.format(Locale.ROOT, "%.1f kg", grams / 1000).replace('.', ',') : Math.round(grams) + " g";
	}

	private static String money(double sc) {
		return String.format(Locale.ROOT, "%.2f SC", sc).replace('.', ',');
	}

	/** "12 · 34,5 kg · 120,50 SC", as asked. */
	private static String summary(Tally t) {
		HudConfig cfg = SlashHud.config;
		StringBuilder s = new StringBuilder(String.valueOf(t.count));
		if (cfg.skyFishWeight) s.append(" · ").append(weight(t.grams));
		if (cfg.skyFishValue) s.append(" · ").append(money(t.value));
		return s.toString();
	}

	private static List<Row> rows(Tally session, Tally life) {
		HudConfig cfg = SlashHud.config;
		List<Row> out = new ArrayList<>();
		out.add(new Row(Component.translatable("slashclient-hud.skyFish.title").getString(), 0xFF55FFFF, ""));
		out.add(new Row(Component.translatable("slashclient-hud.skyFish.session").getString(), 0xFF9CA3AF, summary(session)));
		out.add(new Row(Component.translatable("slashclient-hud.skyFish.lifetime").getString(), 0xFF9CA3AF, summary(life)));
		String split = cfg.skyFishSplit;
		if (!"none".equals(split)) {
			// every category seen, with this session's / all-time counts
			Map<String, Long> all = life.by(split);
			List<String> keys = new ArrayList<>(all.keySet());
			if ("size".equals(split)) keys.sort(Comparator.comparingInt(SkyCounters::size));
			else keys.sort(Comparator.comparingLong((String k) -> all.get(k)).reversed());
			for (String k : keys) out.add(new Row("  " + capital(k), 0xFFE5E7EB, session.by(split).getOrDefault(k, 0L) + " / " + all.get(k)));
		}
		return out;
	}

	public static final class Module implements HudModule {
		public String id() {
			return "skyfish";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return SkyTasks.onSkyUp(mc) && lifetime().count > 0;
		}

		private List<Row> rowsOrPreview(Minecraft mc) {
			if (visible(mc)) return rows(session, lifetime());
			// the editor, before the first fish: some made up
			Tally s = new Tally(), l = new Tally();
			String[][] sample = { { "niewielki", "Krąp", "niezjadliwy" }, { "przeciętny", "Tuńczyk pospolity", "niestrawny" }, { "ogromny", "Sum", "smaczny" } };
			for (int i = 0; i < 9; i++) {
				String[] f = sample[i % 3];
				l.add(f[0], f[1], f[2], 4000 + i * 1500, 6 + i);
				if (i < 4) s.add(f[0], f[1], f[2], 4000 + i * 1500, 6 + i);
			}
			return rows(s, l);
		}

		public int width(Minecraft mc) {
			int w = 70;
			for (Row r : rowsOrPreview(mc)) w = Math.max(w, mc.font.width(r.left) + (r.right.isEmpty() ? 0 : 10 + mc.font.width(r.right)));
			return w + Modules.PAD * 2;
		}

		public int height(Minecraft mc) {
			return rowsOrPreview(mc).size() * (mc.font.lineHeight + 1) - 1 + Modules.PAD * 2;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			int w = width(mc) - Modules.PAD * 2, row = y + Modules.PAD;
			for (Row r : rowsOrPreview(mc)) {
				Modules.text(g, mc, r.left, x + Modules.PAD, row, r.leftColor);
				if (!r.right.isEmpty()) Modules.text(g, mc, r.right, x + Modules.PAD + w - mc.font.width(r.right), row, 0xFFFFFFFF);
				row += mc.font.lineHeight + 1;
			}
		}
	}

	// ---------- for the in-game tests ----------

	public static String debug() {
		return "session " + summaryPlain(session) + " lifetime " + summaryPlain(lifetime()) + " sizes " + session.sizes + " species " + session.species + " qualities " + session.qualities;
	}

	private static String summaryPlain(Tally t) {
		return t.count + "/" + Math.round(t.grams) + "g/" + String.format(Locale.ROOT, "%.2f", t.value);
	}

	public static void resetForTest() {
		session = new Tally();
		lifetime = new Tally();
	}
}
//#endif
