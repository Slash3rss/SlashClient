// SkyUp is played on 26.3: its modules are there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.locale.Language;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SkyUp writes its texts in Polish (the tasks' requirements, the week's plan, the cases' rewards). A player
 * whose game is in another language sees them in it: the game's own names (items, blocks, mobs,
 * enchantments, effects) as the game writes them in that language, SkyUp's own words from a dictionary
 * (skyup/translations.json, Polish to English), and what neither knows (a task's or a custom item's own
 * name) as it is. Only what is shown changes: the tasks are still read and matched in Polish.
 */
public final class SkyLang {
	private SkyLang() {}

	/** Whether the game is in Polish (SkyUp's texts are shown as they are). */
	public static boolean polish() {
		String code = Minecraft.getInstance().getLanguageManager().getSelected();
		return code == null || code.toLowerCase(Locale.ROOT).startsWith("pl");
	}

	/** SkyUp's words, lower case Polish → English. */
	private static Map<String, String> words;
	/** The game's names, lower case Polish → their translation key (built when first needed, again once a world has the enchantments). */
	private static Map<String, String> names;
	private static boolean namesWithEnchantments;

	private static final Pattern COUNT = Pattern.compile("^(\\d{1,5})\\s*[x×]\\s+(.+)$");
	private static final Pattern GROWN = Pattern.compile("^(.+?)\\s+\\((?:dorosły|dorosła|dorosłe)\\)$");
	private static final Pattern EVERY_COLOUR = Pattern.compile("^(.+?)\\s+w każdym kolorze$");
	private static final Pattern BRACKETS = Pattern.compile("^(.+?)\\s+\\((.+)\\)$");
	private static final Pattern LEVEL = Pattern.compile("^(.+?)\\s+([IVXL]+|\\d+)$");
	private static final Pattern AT_LEAST = Pattern.compile("^(.+?)\\s+(?:przynajmniej|co najmniej|conajmniej)\\s+(.+)$");
	private static final Pattern GENERATOR = Pattern.compile("^Generator kamienia z (\\d+) zużytymi punktami ulepszeń$");

	/** A SkyUp text in the game's language when it is not Polish, as far as it is known; else as it is. */
	public static String tr(String text) {
		if (text == null || text.isBlank() || polish()) return text;
		try {
			String out = translate(text.strip(), 0);
			return out != null ? out : text;
		} catch (RuntimeException e) {
			return text;
		}
	}

	/** The text translated, or null when no part of it is known. */
	private static String translate(String s, int depth) {
		if (depth > 4 || s.isEmpty()) return null;
		String word = words().get(s.toLowerCase(Locale.ROOT));
		if (word != null) return word;
		String key = names().get(s.toLowerCase(Locale.ROOT));
		if (key != null) return Language.getInstance().getOrDefault(key);
		Matcher m;
		if ((m = COUNT.matcher(s)).matches()) return part(m.group(1) + "x ", m.group(2), "", depth);
		if ((m = GENERATOR.matcher(s)).matches()) return "Stone generator with " + m.group(1) + " upgrade points spent";
		if ((m = GROWN.matcher(s)).matches()) return part("", m.group(1), " (adult)", depth);
		if ((m = EVERY_COLOUR.matcher(s)).matches()) return part("", m.group(1), " in every colour", depth);
		if ((m = AT_LEAST.matcher(s)).matches()) {
			String a = translate(m.group(1), depth + 1), b = list(m.group(2), depth);
			return a == null && b == null ? null : (a != null ? a : m.group(1)) + " at least " + (b != null ? b : m.group(2));
		}
		if ((m = BRACKETS.matcher(s)).matches()) {
			String a = translate(m.group(1), depth + 1), b = list(m.group(2), depth);
			return a == null && b == null ? null : (a != null ? a : m.group(1)) + " (" + (b != null ? b : m.group(2)) + ")";
		}
		if ((m = LEVEL.matcher(s)).matches()) return part("", m.group(1), " " + m.group(2), depth);
		if (s.contains(", ")) return list(s, depth);
		return null;
	}

	/** `before` + the middle translated + `after`, or null when the middle is not known. */
	private static String part(String before, String middle, String after, int depth) {
		String t = translate(middle, depth + 1);
		return t == null ? null : before + t + after;
	}

	/** "Wydajność V, Szczęście III": each translated, or null when none is known. */
	private static String list(String s, int depth) {
		String[] parts = s.split(",\\s+");
		StringBuilder out = new StringBuilder();
		boolean any = false;
		for (String p : parts) {
			String t = translate(p, depth + 1);
			any |= t != null;
			if (out.length() > 0) out.append(", ");
			out.append(t != null ? t : p);
		}
		return any ? out.toString() : null;
	}

	private static Map<String, String> words() {
		if (words == null) {
			Map<String, String> out = new HashMap<>();
			try (InputStream in = SkyLang.class.getResourceAsStream("/assets/" + SlashHud.ID + "/skyup/translations.json")) {
				if (in != null) {
					JsonObject json = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
					for (var e : json.entrySet()) out.put(e.getKey().toLowerCase(Locale.ROOT), e.getValue().getAsString());
				}
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp translations: {}", e.toString());
			}
			words = out;
		}
		return words;
	}

	private static Map<String, String> names() {
		Minecraft mc = Minecraft.getInstance();
		if (names == null || !namesWithEnchantments && mc.level != null) {
			Map<String, String> out = new HashMap<>();
			for (var item : BuiltInRegistries.ITEM) add(out, item.getDescriptionId());
			for (var block : BuiltInRegistries.BLOCK) add(out, block.getDescriptionId());
			for (var type : BuiltInRegistries.ENTITY_TYPE) add(out, type.getDescriptionId());
			// an enchantment before an effect of the same name ("Szczęście" is Fortune in a task, not Luck)
			if (mc.level != null) {
				mc.level.registryAccess().lookup(Registries.ENCHANTMENT).ifPresent(r -> r.listElementIds()
					.forEach(k -> add(out, "enchantment." + k.identifier().getNamespace() + "." + k.identifier().getPath())));
			}
			for (var effect : BuiltInRegistries.MOB_EFFECT) add(out, effect.getDescriptionId());
			namesWithEnchantments = mc.level != null;
			names = out;
		}
		return names;
	}

	private static void add(Map<String, String> out, String key) {
		String pl = SkyCounters.pl(key);
		if (!pl.isEmpty()) out.putIfAbsent(pl.toLowerCase(Locale.ROOT), key);
	}
}
//#endif
