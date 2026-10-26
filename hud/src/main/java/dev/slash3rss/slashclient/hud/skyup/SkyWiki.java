// SkyUp's wiki is for SkyUp, played on 26.3: the screen is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * The SkyUp.pl wiki in the game (SkyWikiScreen): its articles by category, an article, the website's
 * search, and the articles' pictures. All of it comes through the launcher's bridge (/skyup-wiki/…,
 * launchers 0.9.52+), which fetches and caches the wiki and turns an article into simple blocks; the
 * game never reads the website itself. A launcher without it answers 404: the screen asks to update it.
 */
public final class SkyWiki {
	private SkyWiki() {}

	/** Opens the wiki (no key by default: set in SlashClient's keys window or the game's Controls). */
	public static KeyMapping key;

	private static final String URL = System.getProperty("slashclient.bridge", "");
	private static final String KEY = System.getProperty("slashclient.bridgeKey", "");
	private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
	private static final Pattern PICTURE_ID = Pattern.compile("[0-9a-f]{20}");
	/** How many pictures stay as textures (the oldest go first). */
	private static final int PICTURES_KEPT = 48;

	public record Ref(String slug, String title) {}
	public record Category(String name, List<Ref> articles) {}
	/** A search's hit: the section's title, a bit of its text, and the article it is in (when known). */
	public record Hit(String slug, String article, String anchor, String title, String snippet) {}
	/** An article: its blocks as the launcher made them (src/shared/skyupWikiGame.ts). */
	public record Article(String slug, String title, String url, JsonArray blocks) {}
	/** A loaded picture: its texture and size in pixels. */
	public record Picture(Identifier id, int w, int h) {}

	/** An answer: the value, or why there is none ("noLauncher", "oldLauncher", or the error's text). */
	public record Answer<T>(T value, String error) {
		static <T> Answer<T> of(T value) {
			return new Answer<>(value, null);
		}

		static <T> Answer<T> failed(String error) {
			return new Answer<>(null, error);
		}
	}

	/** What the in-game test feeds instead of the launcher: path → JSON answer. */
	private static Map<String, String> fed;
	private static final Map<String, Article> articles = new LinkedHashMap<>(16, 0.75f, true);
	private static List<Category> index;
	private static final Map<String, Picture> pictures = new LinkedHashMap<>(16, 0.75f, true);
	private static final Set<String> loading = new HashSet<>();
	/** Counts loaded pictures, so the screen lays the article out again when one comes. */
	static int pictureVersion;
	/** The article last read and where, so the wiki opens there again. */
	static String lastSlug;
	static int lastScroll;

	public static boolean bridged() {
		return fed != null || (!URL.isEmpty() && !KEY.isEmpty());
	}

	public static void tick(Minecraft mc) {
		if (key == null) return;
		while (key.consumeClick()) {
			if (dev.slash3rss.slashclient.hud.Compat.screen(mc) == null) mc.setScreenAndShow(new SkyWikiScreen(null));
		}
	}

	/** Asks the bridge on a thread of its own; the answer comes back on the game's thread. */
	private static void ask(String path, Consumer<Answer<JsonElement>> done) {
		Minecraft mc = Minecraft.getInstance();
		if (fed != null) {
			String json = fed.get(path);
			mc.execute(() -> done.accept(json == null ? Answer.failed("Not found") : Answer.of(JsonParser.parseString(json))));
			return;
		}
		if (!bridged()) {
			mc.execute(() -> done.accept(Answer.failed("noLauncher")));
			return;
		}
		Thread.ofVirtual().name("SlashClient SkyUp wiki").start(() -> {
			Answer<JsonElement> answer;
			try {
				HttpRequest req = HttpRequest.newBuilder(URI.create(URL + path)).timeout(Duration.ofSeconds(30)).header("Authorization", "Bearer " + KEY).GET().build();
				HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
				// a launcher from before the wiki in the game: its bridge does not know the path
				if (res.statusCode() == 404 && path.equals("/skyup-wiki/index")) answer = Answer.failed("oldLauncher");
				else if (res.statusCode() != 200) answer = Answer.failed(errorOf(res.body(), res.statusCode()));
				else answer = Answer.of(JsonParser.parseString(res.body()));
			} catch (Exception e) {
				answer = Answer.failed("noLauncher");
			}
			Answer<JsonElement> result = answer;
			mc.execute(() -> done.accept(result));
		});
	}

	private static String errorOf(String body, int status) {
		try {
			JsonObject o = JsonParser.parseString(body).getAsJsonObject();
			if (o.has("error")) return o.get("error").getAsString();
		} catch (Exception ignored) {
		}
		return "HTTP " + status;
	}

	/** The articles by category (kept once read). */
	static void index(Consumer<Answer<List<Category>>> done) {
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

	/** An article by its slug (the last few kept). */
	static void article(String slug, Consumer<Answer<Article>> done) {
		Article kept = articles.get(slug);
		if (kept != null) {
			done.accept(Answer.of(kept));
			return;
		}
		ask("/skyup-wiki/article/" + slug, a -> {
			if (a.value() == null) {
				done.accept(Answer.failed(a.error()));
				return;
			}
			JsonObject o = a.value().getAsJsonObject();
			Article article = new Article(str(o, "slug"), str(o, "title"), str(o, "url"), o.has("blocks") ? o.getAsJsonArray("blocks") : new JsonArray());
			articles.put(slug, article);
			while (articles.size() > 12) articles.remove(articles.keySet().iterator().next());
			done.accept(Answer.of(article));
		});
	}

	/** The website's search (at least 3 letters, as the website wants). */
	static void search(String query, Consumer<Answer<List<Hit>>> done) {
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

	/** A picture of an article: its texture once loaded, null while it loads (or when it cannot be read). */
	static Picture picture(String id) {
		Picture p = pictures.get(id);
		if (p != null || fed != null || !bridged() || !PICTURE_ID.matcher(id).matches() || !loading.add(id)) return p;
		Minecraft mc = Minecraft.getInstance();
		Thread.ofVirtual().name("SlashClient SkyUp wiki picture").start(() -> {
			try {
				HttpRequest req = HttpRequest.newBuilder(URI.create(URL + "/skyup-wiki/image/" + id)).timeout(Duration.ofSeconds(30)).header("Authorization", "Bearer " + KEY).GET().build();
				HttpResponse<InputStream> res = HTTP.send(req, HttpResponse.BodyHandlers.ofInputStream());
				if (res.statusCode() != 200) return;
				NativeImage img;
				try (InputStream in = res.body()) {
					img = NativeImage.read(in);
				}
				mc.execute(() -> {
					Identifier tex = Identifier.fromNamespaceAndPath(SlashHud.ID, "skywiki/" + id);
					mc.getTextureManager().register(tex, new DynamicTexture(() -> "SlashClient SkyUp wiki picture", img));
					pictures.put(id, new Picture(tex, img.getWidth(), img.getHeight()));
					pictureVersion++;
					while (pictures.size() > PICTURES_KEPT) {
						String oldest = pictures.keySet().iterator().next();
						mc.getTextureManager().release(pictures.remove(oldest).id());
						loading.remove(oldest);
					}
				});
			} catch (Exception ignored) {
				// no picture: the article shows its place empty
			}
		});
		return null;
	}

	private static String str(JsonElement o, String key) {
		JsonElement v = o.getAsJsonObject().get(key);
		return v == null || v.isJsonNull() ? "" : v.getAsString();
	}

	// ---------- for the in-game test ----------

	/** Answers from these instead of the launcher (null: the launcher again). */
	public static void feed(Map<String, String> answers) {
		fed = answers;
		index = null;
		articles.clear();
		lastSlug = null;
		lastScroll = 0;
	}
}
//#endif
