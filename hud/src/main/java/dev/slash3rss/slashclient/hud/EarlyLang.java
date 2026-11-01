package dev.slash3rss.slashclient.hud;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.locale.Language;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.util.FormattedCharSequence;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * SlashClient's own texts before the game has loaded its languages. Right after the start the game still
 * answers every translation with its key, so the first notifications (a friend online, achievements, a
 * challenge done) showed "slashclient-hud.…" instead of words. Until the game loads its languages (and
 * puts its own in place of this one) our texts come from the mod's language files, in the language of
 * the player's options.txt.
 */
public final class EarlyLang {
	private EarlyLang() {}

	/** Puts our texts in place for the time before the game's languages are loaded. */
	public static void install() {
		try {
			Language.inject(language(optionsLanguage(), Language.getInstance()));
		} catch (RuntimeException e) {
			SlashHud.LOG.debug("SlashClient: early texts: {}", e.toString());
		}
	}

	/** The game's language as options.txt says ("lang:pl_pl"); English when there is none yet. */
	static String optionsLanguage() {
		try {
			Path options = FabricLoader.getInstance().getGameDir().resolve("options.txt");
			if (Files.exists(options)) {
				for (String line : Files.readAllLines(options, StandardCharsets.UTF_8)) {
					if (line.startsWith("lang:")) return line.substring(5).trim().toLowerCase(java.util.Locale.ROOT);
				}
			}
		} catch (Exception e) {
			// unreadable: English
		}
		return "en_us";
	}

	/** Our texts in `code` (English where it has none) over `base` for everything else. */
	public static Language language(String code, Language base) {
		Map<String, String> texts = new HashMap<>();
		read("en_us", texts);
		if (!"en_us".equals(code)) read(code, texts);
		return new Language() {
			@Override
			public String getOrDefault(String key, String fallback) {
				String text = texts.get(key);
				return text != null ? text : base.getOrDefault(key, fallback);
			}

			@Override
			public boolean has(String key) {
				return texts.containsKey(key) || base.has(key);
			}

			@Override
			public boolean isDefaultRightToLeft() {
				return base.isDefaultRightToLeft();
			}

			@Override
			public FormattedCharSequence getVisualOrder(FormattedText text) {
				return base.getVisualOrder(text);
			}
		};
	}

	private static void read(String code, Map<String, String> into) {
		try (InputStream in = EarlyLang.class.getResourceAsStream("/assets/" + SlashHud.ID + "/lang/" + code + ".json")) {
			if (in != null) Language.loadFromJson(in, into::put);
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: early texts {}: {}", code, e.toString());
		}
	}
}
