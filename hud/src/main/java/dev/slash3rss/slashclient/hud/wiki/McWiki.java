package dev.slash3rss.slashclient.hud.wiki;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * minecraft.wiki in the game (its window is a WikiScreen): the wiki's search and its articles, in the game's
 * language where the wiki has one (pl.minecraft.wiki for Polish) or in English, switched with the window's button.
 * A key opens the article about what the player holds, looks at, or points at in an inventory. All of it comes
 * through the launcher's bridge (/mc-wiki/…); an article's slug is its wiki's language and title ("pl:Diament").
 */
public final class McWiki extends WikiSource {
	public static final McWiki SOURCE = new McWiki();

	/** Opens the wiki, and the article about the thing in hand or under the crosshair (no keys by default). */
	public static KeyMapping key, lookupKey;

	/** The articles read lately, newest first, for the list while nothing is searched. */
	private final List<Ref> recent = new ArrayList<>();

	private McWiki() {
		super("/mc-wiki", "mcwiki");
	}

	@Override
	public String texts() {
		return "slashclient-hud.mcWiki";
	}

	/** The wiki's language: the game's when the wiki has it, English when the player switched to it or it has not. */
	static String lang() {
		return polishGame() && !SlashHud.config.mcWikiEnglish ? "pl" : "en";
	}

	private static boolean polishGame() {
		Minecraft mc = Minecraft.getInstance();
		return mc.options != null && mc.options.languageCode.startsWith("pl");
	}

	/** In a Polish game the button names the other wiki: "EN" on the Polish one, "PL" on the English one. */
	@Override
	public String switchLabel() {
		return polishGame() ? ("pl".equals(lang()) ? "EN" : "PL") : null;
	}

	@Override
	public void switchOver() {
		SlashHud.config.mcWikiEnglish = !SlashHud.config.mcWikiEnglish;
		SlashHud.config.save();
	}

	/** Its wiki named under the article: minecraft.wiki, or the Polish Minecraft Wiki on Fandom. */
	@Override
	public net.minecraft.network.chat.Component credit(Article article) {
		return net.minecraft.network.chat.Component.translatable("pl".equals(lang(article.slug())) ? "slashclient-hud.mcWiki.creditPl" : "slashclient-hud.mcWiki.credit");
	}

	@Override
	public int minSearch() {
		return 2;
	}

	private static String lang(String slug) {
		int at = slug.indexOf(':');
		return at == 2 ? slug.substring(0, 2) : "en";
	}

	private static String title(String slug) {
		int at = slug.indexOf(':');
		return at == 2 ? slug.substring(3) : slug;
	}

	private static String enc(String s) {
		return URLEncoder.encode(s, StandardCharsets.UTF_8);
	}

	@Override
	protected String articlePath(String slug) {
		return "/mc-wiki/article?lang=" + lang(slug) + "&title=" + enc(title(slug));
	}

	@Override
	protected boolean probe(String path) {
		return path.startsWith("/mc-wiki/search") || path.startsWith("/mc-wiki/article");
	}

	/** An article is named by its real title (a redirect's target) in its own wiki. */
	@Override
	protected Article article(String slug, JsonObject o) {
		String title = str(o, "title").isEmpty() ? title(slug) : str(o, "title");
		String lang = str(o, "lang").isEmpty() ? lang(slug) : str(o, "lang");
		return new Article(lang + ":" + title, title, str(o, "url"), o.has("blocks") ? o.getAsJsonArray("blocks") : new com.google.gson.JsonArray());
	}

	/** The article first among those read lately (in another wiki than the player's, its language named). */
	@Override
	protected void opened(Article a) {
		String lang = lang(a.slug()), title = a.title();
		recent.removeIf(r -> r.slug().equals(a.slug()));
		recent.add(0, new Ref(a.slug(), lang.equals(lang()) ? title : title + " (" + lang.toUpperCase(java.util.Locale.ROOT) + ")"));
		while (recent.size() > 15) recent.remove(recent.size() - 1);
	}

	/** A link leads to an article of the same wiki as the one it is in. */
	@Override
	public String linked(Article from, String wiki) {
		return lang(from == null ? lang() + ":" : from.slug()) + ":" + wiki;
	}

	@Override
	public void index(Consumer<Answer<List<Category>>> done) {
		done.accept(Answer.of(recent.isEmpty() ? List.of()
			: List.of(new Category(net.minecraft.network.chat.Component.translatable("slashclient-hud.mcWiki.recent").getString(), List.copyOf(recent)))));
	}

	@Override
	public void search(String query, Consumer<Answer<List<Hit>>> done) {
		String lang = lang();
		ask("/mc-wiki/search?lang=" + lang + "&q=" + enc(query), a -> {
			if (a.value() == null) {
				done.accept(Answer.failed(a.error()));
				return;
			}
			List<Hit> out = new ArrayList<>();
			for (JsonElement h : a.value().getAsJsonArray()) out.add(new Hit(lang + ":" + str(h, "title"), "", "", str(h, "title"), str(h, "snippet")));
			done.accept(Answer.of(out));
		});
	}

	@Override
	protected void forget() {
		recent.clear();
	}

	// ---------- keys ----------

	public static WikiScreen screen(Screen parent) {
		return new WikiScreen(SOURCE, parent);
	}

	public static void tick(Minecraft mc) {
		if (key == null || lookupKey == null) return;
		while (key.consumeClick()) {
			if (dev.slash3rss.slashclient.hud.Compat.screen(mc) == null) mc.setScreenAndShow(screen(null));
		}
		while (lookupKey.consumeClick()) {
			if (dev.slash3rss.slashclient.hud.Compat.screen(mc) == null) lookUp(mc, thing(mc), null);
		}
	}

	/** The lookup key over an inventory: the article about the item under the mouse. */
	public static void attach(Minecraft mc, net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?> screen) {
		//#if MC >= 1.21.9
		net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, e) -> {
			if (lookupKey == null || lookupKey.isUnbound() || !lookupKey.matches(e)) return true;
		//#else
		//$ net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, key, scancode, mods) -> {
		//$ 	if (lookupKey == null || lookupKey.isUnbound() || !lookupKey.matches(key, scancode)) return true;
		//#endif
			// typing in a field (the inventory's search) is not a lookup
			if (s.getFocused() instanceof net.minecraft.client.gui.components.EditBox) return true;
			net.minecraft.world.inventory.Slot slot = ((dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor) s).slashclient$hoveredSlot();
			if (slot == null || !slot.hasItem()) return true;
			lookUp(mc, item(slot.getItem()), s);
			return false;
		});
	}

	/** What a lookup is about: its id ("minecraft:oak_planks") and its name in the game's language. */
	record Thing(String id, String name) {}

	private static Thing item(ItemStack stack) {
		// the item's own name, not one given on an anvil
		return new Thing(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString(), new ItemStack(stack.getItem()).getHoverName().getString());
	}

	/** The thing in the main hand, else the mob or block under the crosshair, else nothing. */
	static Thing thing(Minecraft mc) {
		if (mc.player == null) return null;
		ItemStack held = mc.player.getMainHandItem();
		if (!held.isEmpty()) return item(held);
		HitResult hit = mc.hitResult;
		if (hit instanceof EntityHitResult e) {
			Entity entity = e.getEntity();
			return new Thing(BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString(), entity.getType().getDescription().getString());
		}
		if (hit instanceof BlockHitResult b && hit.getType() == HitResult.Type.BLOCK && mc.level != null) {
			var block = mc.level.getBlockState(b.getBlockPos()).getBlock();
			return new Thing(BuiltInRegistries.BLOCK.getKey(block).toString(), block.getName().getString());
		}
		return null;
	}

	/** The wiki opened on the article about a thing; without one found, on a search for its name. */
	static void lookUp(Minecraft mc, Thing thing, Screen parent) {
		if (thing == null) {
			mc.setScreenAndShow(new WikiScreen(SOURCE, parent));
			return;
		}
		SOURCE.ask("/mc-wiki/lookup?lang=" + lang() + "&id=" + enc(thing.id()) + "&name=" + enc(thing.name()), a -> {
			// the player moved on to another window meanwhile: nothing pops up over it
			if (dev.slash3rss.slashclient.hud.Compat.screen(mc) != parent) return;
			if (a.value() != null && !str(a.value(), "title").isEmpty()) {
				String lang = str(a.value(), "lang").isEmpty() ? lang() : str(a.value(), "lang");
				mc.setScreenAndShow(new WikiScreen(SOURCE, parent, lang + ":" + str(a.value(), "title")));
				return;
			}
			WikiScreen screen = new WikiScreen(SOURCE, parent);
			mc.setScreenAndShow(screen);
			if (!"noLauncher".equals(a.error())) screen.typeSearch(thing.name());
		});
	}

	// ---------- for the in-game test ----------

	public static String thingForTest() {
		Thing t = thing(Minecraft.getInstance());
		return t == null ? "none" : t.id() + "|" + t.name();
	}

	public static void lookUpForTest(String id, String name) {
		lookUp(Minecraft.getInstance(), new Thing(id, name), null);
	}
}
