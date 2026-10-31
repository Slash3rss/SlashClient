// SkyUp's wiki is for SkyUp, played on 26.3: the screen is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.wiki.WikiScreen;
import dev.slash3rss.slashclient.hud.wiki.WikiSource;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * The SkyUp.pl wiki in the game (its window is a WikiScreen): its articles by category, an article, the website's
 * search, and the articles' pictures, all through the launcher's bridge (/skyup-wiki/…, launchers 0.9.52+), which
 * fetches and caches the wiki and turns an article into simple blocks.
 */
public final class SkyWiki extends WikiSource {
	public static final SkyWiki SOURCE = new SkyWiki();

	/** Opens the wiki (no key by default: set in SlashClient's keys window or the game's Controls). */
	public static KeyMapping key;

	private List<Category> index;

	private SkyWiki() {
		super("/skyup-wiki", "skywiki");
	}

	public static WikiScreen screen(net.minecraft.client.gui.screens.Screen parent) {
		return new WikiScreen(SOURCE, parent);
	}

	public static boolean bridgedNow() {
		return SOURCE.bridged();
	}

	public static void tick(Minecraft mc) {
		if (key == null) return;
		while (key.consumeClick()) {
			if (dev.slash3rss.slashclient.hud.Compat.screen(mc) == null) mc.setScreenAndShow(screen(null));
		}
	}

	@Override
	public String texts() {
		return "slashclient-hud.skyWiki";
	}

	@Override
	protected String articlePath(String slug) {
		return "/skyup-wiki/article/" + slug;
	}

	@Override
	protected boolean probe(String path) {
		return path.equals("/skyup-wiki/index");
	}

	/** The wiki's own start page (skyup.pl/wiki/start, not in its menu). */
	@Override
	public String start() {
		return "start";
	}

	/** The articles by category (kept once read). */
	@Override
	public void index(Consumer<Answer<List<Category>>> done) {
		if (index != null) {
			done.accept(Answer.of(index));
			return;
		}
		ask("/skyup-wiki/index", a -> {
			if (a.value() == null) {
				done.accept(Answer.failed(a.error()));
				return;
			}
			List<Category> out = new ArrayList<>();
			for (JsonElement c : a.value().getAsJsonArray()) {
				JsonObject o = c.getAsJsonObject();
				List<Ref> refs = new ArrayList<>();
				for (JsonElement r : o.getAsJsonArray("articles")) refs.add(new Ref(str(r, "slug"), str(r, "title")));
				out.add(new Category(str(c, "name"), refs));
			}
			index = out;
			done.accept(Answer.of(out));
		});
	}

	/** The website's search (at least 3 letters, as the website wants). */
	@Override
	public void search(String query, Consumer<Answer<List<Hit>>> done) {
		ask("/skyup-wiki/search?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8), a -> {
			if (a.value() == null) {
				done.accept(Answer.failed(a.error()));
				return;
			}
			List<Hit> out = new ArrayList<>();
			for (JsonElement h : a.value().getAsJsonArray()) out.add(new Hit(str(h, "slug"), str(h, "article"), str(h, "anchor"), str(h, "title"), str(h, "snippet")));
			done.accept(Answer.of(out));
		});
	}

	@Override
	protected void forget() {
		index = null;
	}

	/** For the plan of the week, which reads one article. */
	static void read(String slug, Consumer<Answer<Article>> done) {
		SOURCE.article(slug, done);
	}

	/** For the in-game test: the bridge's answers by path (null: the launcher again). */
	static void feedAnswers(Map<String, String> answers) {
		SOURCE.feed(answers);
	}
}
//#endif
