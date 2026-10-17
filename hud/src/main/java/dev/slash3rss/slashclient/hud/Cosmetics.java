package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.core.ClientAsset;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerSkin;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SlashClient cosmetics, seen by everyone who plays with the launcher: the cape a player picked
 * in the launcher (the server tells, with the logo lookup in {@link Badges}), and emotes shown
 * next to the name above the head for a few seconds.
 */
public final class Cosmetics {
	private Cosmetics() {}

	/** The order of the emote wheel and of the glyphs in font/emote.json (U+E100 onwards). */
	public static final List<String> EMOTES = List.of("wave", "heart", "laugh", "gg", "like", "angry", "question", "fire");
	static final List<String> CAPES = List.of("slash", "ocean", "ember", "forest", "galaxy", "rose", "gold", "mono",
		"aurora", "inferno", "waves", "pulse", "staff_admin", "staff_support", "staff_partner",
		"sakura", "night", "rainbow", "ice", "toxic", "checker", "matrix", "storm");
	/** Capes drawn as a loop of frames (textures/cape/<id>_<n>.png), and how many. */
	static final Map<String, Integer> ANIMATED = Map.of("aurora", 8, "inferno", 8, "waves", 8, "pulse", 8, "matrix", 8, "storm", 8);
	private static final long FRAME_MS = 120;
	static final List<String> WINGS = List.of("angel", "demon", "butterfly", "dragon", "phoenix", "crystal", "batwing", "frost", "prism", "shadow");
	static final List<String> ELYTRAS = List.of("feather", "neon", "void", "sunset", "nebula", "venom", "tide");
	static final List<String> TRAILS = List.of("hearts", "sparks", "snow", "notes", "flames", "clouds", "stars", "bubbles", "emerald", "soulfire");
	static final List<String> AURAS = List.of("enchant", "portal", "cherry", "souls", "royal", "glow", "magic", "amber", "sculk");
	static final List<String> PETS = List.of("allay", "vex", "bat", "parrot", "bee", "blaze", "phantom");
	private static final Map<String, List<String>> SLOTS = Map.of("cape", CAPES, "wings", WINGS, "elytra", ELYTRAS,
		"trail", TRAILS, "aura", AURAS, "pet", PETS);
	private static final long EMOTE_MS = 3500;
	private static final FontDescription EMOTE_FONT = new FontDescription.Resource(Identifier.fromNamespaceAndPath(SlashHud.ID, "emote"));

	/** uuid → slot → item, what the server says each player wears (only items this mod knows). */
	private static final Map<UUID, Map<String, String>> worn = new ConcurrentHashMap<>();
	private static final Map<String, ClientAsset.Texture> textures = new ConcurrentHashMap<>();
	private record Shown(String emote, long until) {}
	private static final Map<UUID, Shown> emotes = new ConcurrentHashMap<>();

	/** The emote wheel's key, registered with the others in SlashHud. */
	static net.minecraft.client.KeyMapping key;

	public static net.minecraft.client.KeyMapping emoteKey() {
		return key;
	}

	static void setCape(UUID id, String cape) {
		set(id, "cape", cape);
	}

	/** What a player wears in a slot; null takes it off. Items this version of the mod does not know are left out. */
	static void set(UUID id, String slot, String item) {
		List<String> known = SLOTS.get(slot);
		if (item != null && known != null && known.contains(item)) worn.computeIfAbsent(id, k -> new ConcurrentHashMap<>()).put(slot, item);
		else {
			var w = worn.get(id);
			if (w != null) w.remove(slot);
		}
	}

	/** Everything a player wears, at once (from the server's answer). */
	static void setAll(UUID id, Map<String, String> items) {
		for (String slot : SLOTS.keySet()) set(id, slot, items.get(slot));
	}

	/** The item a player wears in a slot, or null. */
	/** The cape's picture now (an animated cape's current frame). */
	public static Identifier capeTexture(String cape) {
		Integer frames = ANIMATED.get(cape);
		return textureId("cape", frames == null ? cape : cape + "_" + (System.currentTimeMillis() / FRAME_MS) % frames);
	}

	public static String worn(UUID id, String slot) {
		if (!SlashHud.config.badges) return null;
		var w = worn.get(id);
		return w == null ? null : w.get(slot);
	}

	static void reset() {
		worn.clear();
		CosmeticsScreen.forgetOwn();
		emotes.clear();
	}

	/** For the screenshots of the website (TestHooks): our own player in a given skin. */
	static ClientAsset.Texture testSkin;
	static UUID testSkinFor;

	public static PlayerSkin withTestSkin(UUID id, PlayerSkin skin) {
		if (testSkin == null || !id.equals(testSkinFor)) return skin;
		return new PlayerSkin(testSkin, skin.cape(), skin.elytra(), net.minecraft.world.entity.player.PlayerModelType.WIDE, skin.secure());
	}

	/** The skin with our cape in place of the player's own, when they picked one. */
	public static PlayerSkin withCape(UUID id, PlayerSkin skin, boolean wearsElytra) {
		skin = withTestSkin(id, skin);
		if (!SlashHud.config.badges) return skin;
		String cape = worn(id, "cape");
		// wings take the cape's place on the back (an elytra, when worn, takes theirs)
		if (!wearsElytra && worn(id, "wings") != null) return new PlayerSkin(skin.body(), null, skin.elytra(), skin.model(), skin.secure());
		String elytra = worn(id, "elytra");
		if (cape == null && elytra == null) return skin;
		if (cape != null) {
			Integer frames = ANIMATED.get(cape);
			if (frames != null) cape = cape + "_" + (System.currentTimeMillis() / FRAME_MS) % frames;
		}
		ClientAsset.Texture capeTexture = cape == null ? skin.cape() : texture("cape", cape);
		// without an elytra of its own the elytra is drawn from the cape, as for Minecraft's own capes
		ClientAsset.Texture elytraTexture = elytra != null ? texture("elytra", elytra) : cape != null ? null : skin.elytra();
		return new PlayerSkin(skin.body(), capeTexture, elytraTexture, skin.model(), skin.secure());
	}

	/** Where one of our pictures is, for models drawn with it directly (the wings). */
	public static Identifier textureId(String kind, String name) {
		return Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/" + kind + "/" + name + ".png");
	}

	/** One of our textures (textures/<kind>/<name>.png), made once. */
	static ClientAsset.Texture texture(String kind, String name) {
		return textures.computeIfAbsent(kind + "/" + name, k -> new ClientAsset.ResourceTexture(
			Identifier.fromNamespaceAndPath(SlashHud.ID, k), Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/" + k + ".png")));
	}

	/** An emote arrived (from the launcher) or was sent: it shows by the name for a few seconds. */
	public static void show(UUID id, String emote) {
		if (EMOTES.contains(emote)) emotes.put(id, new Shown(emote, System.currentTimeMillis() + EMOTE_MS));
	}

	/** The emote's picture as a character of the emote font. */
	public static MutableComponent glyph(String emote) {
		return Component.literal(String.valueOf((char) (0xE100 + EMOTES.indexOf(emote)))).withStyle(Style.EMPTY.withFont(EMOTE_FONT));
	}

	/** The name above a head, with the player's emote in front while it lasts. */
	public static Component decorate(UUID id, Component name) {
		Shown s = emotes.get(id);
		if (s == null || name == null) return name;
		if (System.currentTimeMillis() > s.until()) {
			emotes.remove(id);
			return name;
		}
		return Component.empty().append(glyph(s.emote())).append(" ").append(name);
	}

	/** For the test: whether a player shows this cape. */
	public static String cape(UUID id) {
		var w = worn.get(id);
		return w == null ? null : w.get("cape");
	}

	static void tick(Minecraft mc) {
		if (key == null) return;
		while (key.consumeClick()) {
			if (Compat.screen(mc) == null && mc.player != null) mc.setScreenAndShow(new EmoteScreen(key));
		}
	}

	/** Sends an emote: shown above our own head at once, to others through the launcher. */
	public static void send(Minecraft mc, String emote) {
		if (mc.player == null) return;
		show(mc.player.getUUID(), emote);
		if (!dev.slash3rss.slashclient.hud.social.Social.available()) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.emote.noLauncher"));
			return;
		}
		dev.slash3rss.slashclient.hud.social.Social.emote(mc.player.getUUID(), emote);
		Compat.overlay(mc, Component.translatable("slashclient-hud.emote.sent").append(" ").append(glyph(emote)));
	}

}
