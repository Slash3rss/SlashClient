package dev.slash3rss.slashclient.hud.wiki;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * A wiki the game reads through the launcher's bridge (the SkyUp.pl wiki, minecraft.wiki): its articles as simple
 * blocks the launcher made of the website (src/shared/skyupWikiGame.ts), a search, and the articles' pictures as
 * PNGs asked for by id. The game never reads the website itself. A launcher without the wiki answers 404: the
 * window asks to update it.
 */
public abstract class WikiSource {
	public record Ref(String slug, String title) {}
	public record Category(String name, List<Ref> articles) {}
	/** A search's hit: its title, a bit of its text, the article it is in (when it is a section of one) and the place. */
	public record Hit(String slug, String article, String anchor, String title, String snippet) {}
	/** An article: its blocks as the launcher made them. */
	public record Article(String slug, String title, String url, JsonArray blocks) {}
	/** A loaded picture: its texture and size in pixels. */
	public record Picture(Identifier id, int w, int h) {}

	/** An answer: the value, or why there is none ("noLauncher", "oldLauncher", or the error's text). */
	public record Answer<T>(T value, String error) {
		public static <T> Answer<T> of(T value) {
			return new Answer<>(value, null);
		}

		public static <T> Answer<T> failed(String error) {
			return new Answer<>(null, error);
		}
	}

	private static final String URL = System.getProperty("slashclient.bridge", "");
	private static final String KEY = System.getProperty("slashclient.bridgeKey", "");
	private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
	private static final Pattern PICTURE_ID = Pattern.compile("[0-9a-f]{20}");
	/** How many pictures stay as textures (the oldest go first). */
	private static final int PICTURES_KEPT = 48;

	/** The bridge's paths start so ("/skyup-wiki"), and the textures are named so ("skywiki"). */
	private final String path, textures;
	/** What the in-game test feeds instead of the launcher: path → JSON answer. */
	private Map<String, String> fed;
	private final Map<String, Article> articles = new LinkedHashMap<>(16, 0.75f, true);
	private final Map<String, Picture> pictures = new LinkedHashMap<>(16, 0.75f, true);
	private final Set<String> loading = new HashSet<>();
	/** Counts loaded pictures, so the window lays the article out again when one comes. */
	int pictureVersion;
	/** The article last read and where, so the wiki opens there again. */
	public String lastSlug;
	int lastScroll;

	protected WikiSource(String path, String textures) {
		this.path = path;
		this.textures = textures;
	}

	/** The window's texts start so ("slashclient-hud.skyWiki"): title, search, loading, noHits, pick, noLauncher, oldLauncher, error, browser, back. */
	public abstract String texts();

	/** The articles listed when nothing is searched (by category), or an empty list. */
	public abstract void index(Consumer<Answer<List<Category>>> done);

	/** The search's hits for at least minSearch() letters. */
	public abstract void search(String query, Consumer<Answer<List<Hit>>> done);

	/** The bridge's path of an article. */
	protected abstract String articlePath(String slug);

	/** The paths a launcher from before this wiki does not know: their 404 means "update the launcher". */
	protected abstract boolean probe(String path);

	public int minSearch() {
		return 3;
	}

	/** The article opened when none was read yet (null: none, the window asks to pick or search). */
	public String start() {
		return null;
	}

	/** The slug a link of an article leads to (a link's "wiki" as the launcher wrote it). */
	public String linked(Article from, String wiki) {
		return wiki;
	}

	/** The line under an article that names where it comes from, or null. */
	public net.minecraft.network.chat.Component credit(Article article) {
		return null;
	}

	/** The button that switches the wiki's language ("EN"), or null for a wiki in one language. */
	public String switchLabel() {
		return null;
	}

	public void switchOver() {}

	/** Whether the game was started by the launcher, whose bridge reads the wiki (or the test feeds answers). */
	public boolean bridged() {
		return fed != null || (!URL.isEmpty() && !KEY.isEmpty());
	}

	/** Asks the bridge on a thread of its own; the answer comes back on the game's thread. */
	protected void ask(String path, Consumer<Answer<JsonElement>> done) {
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
		Thread.ofVirtual().start(() -> {
			Answer<JsonElement> answer;
			try {
				HttpRequest req = HttpRequest.newBuilder(URI.create(URL + path)).timeout(Duration.ofSeconds(30)).header("Authorization", "Bearer " + KEY).GET().build();
				HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
				// a launcher from before the wiki in the game: its bridge does not know the path
				if (res.statusCode() == 404 && probe(path)) answer = Answer.failed("oldLauncher");
				else if (res.statusCode() != 200) {
					SlashHud.LOG.info("SlashClient: wiki {}: HTTP {} {}", path, res.statusCode(), res.body());
					answer = Answer.failed(dev.slash3rss.slashclient.hud.ErrorText.ofAnswer(res.statusCode(), res.body()));
				} else answer = Answer.of(JsonParser.parseString(res.body()));
			} catch (Exception e) {
				answer = Answer.failed("noLauncher");
			}
			Answer<JsonElement> result = answer;
			mc.execute(() -> done.accept(result));
		});
	}

	/** An article by its slug (the last few kept). */
	public void article(String slug, Consumer<Answer<Article>> done) {
		Article kept = articles.get(slug);
		if (kept != null) {
			opened(kept);
			done.accept(Answer.of(kept));
			return;
		}
		ask(articlePath(slug), a -> {
			if (a.value() == null) {
				done.accept(Answer.failed(a.error()));
				return;
			}
			Article article = article(slug, a.value().getAsJsonObject());
			articles.put(slug, article);
			while (articles.size() > 12) articles.remove(articles.keySet().iterator().next());
			opened(article);
			done.accept(Answer.of(article));
		});
	}

	/** The article from the bridge's answer. */
	protected Article article(String slug, JsonObject o) {
		return new Article(str(o, "slug"), str(o, "title"), str(o, "url"), o.has("blocks") ? o.getAsJsonArray("blocks") : new JsonArray());
	}

	/** An article was opened (to be remembered as read). */
	protected void opened(Article article) {}

	/** A picture of an article: its texture once loaded, null while it loads (or when it cannot be read). */
	public Picture picture(String id) {
		Picture p = pictures.get(id);
		if (p != null || fed != null || !bridged() || !PICTURE_ID.matcher(id).matches() || !loading.add(id)) return p;
		Minecraft mc = Minecraft.getInstance();
		Thread.ofVirtual().start(() -> {
			try {
				HttpRequest req = HttpRequest.newBuilder(URI.create(URL + path + "/image/" + id)).timeout(Duration.ofSeconds(30)).header("Authorization", "Bearer " + KEY).GET().build();
				HttpResponse<InputStream> res = HTTP.send(req, HttpResponse.BodyHandlers.ofInputStream());
				if (res.statusCode() != 200) return;
				NativeImage img;
				try (InputStream in = res.body()) {
					img = NativeImage.read(in);
				}
				mc.execute(() -> {
					Identifier tex = Identifier.fromNamespaceAndPath(SlashHud.ID, textures + "/" + id);
					mc.getTextureManager().register(tex, new DynamicTexture(() -> "SlashClient wiki picture", img));
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

	protected static String str(JsonElement o, String key) {
		JsonElement v = o.getAsJsonObject().get(key);
		return v == null || v.isJsonNull() ? "" : v.getAsString();
	}

	// ---------- for the in-game test ----------

	/** Answers from these instead of the launcher (null: the launcher again). */
	public void feed(Map<String, String> answers) {
		fed = answers;
		articles.clear();
		lastSlug = null;
		lastScroll = 0;
		forget();
	}

	/** What else is kept is forgotten (a test's answers fed). */
	protected void forget() {}
}
