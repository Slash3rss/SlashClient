package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
//#if MC >= 1.21.9
import net.minecraft.core.ClientAsset;
import net.minecraft.network.chat.FontDescription;
//#endif
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;
//#if MC >= 1.21.9
import net.minecraft.world.entity.player.PlayerSkin;
//#elif MC >= 1.20.2
//$ import net.minecraft.client.resources.PlayerSkin;
//#endif

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
		"aurora", "inferno", "waves", "pulse", "staff_admin", "staff_support", "staff_partner", "staff_friend",
		"sakura", "night", "rainbow", "ice", "toxic", "checker", "matrix", "storm",
		"lava", "desert", "cyber", "honey", "mint", "vortex", "starfall");
	/** Capes drawn as a loop of frames (textures/cape/<id>_<n>.png), and how many. */
	static final Map<String, Integer> ANIMATED = Map.ofEntries(Map.entry("aurora", 8), Map.entry("inferno", 8), Map.entry("waves", 8),
		Map.entry("pulse", 8), Map.entry("matrix", 8), Map.entry("storm", 8), Map.entry("vortex", 8), Map.entry("starfall", 8),
		// the ranks' capes: a light sweeping across the logo, then a rest
		Map.entry("staff_admin", 16), Map.entry("staff_support", 16), Map.entry("staff_partner", 16), Map.entry("staff_friend", 16));
	private static final long FRAME_MS = 120;
	static final List<String> WINGS = List.of("angel", "demon", "butterfly", "dragon", "phoenix", "crystal", "batwing", "frost", "prism", "shadow", "fairy", "bone", "gilded");
	static final List<String> ELYTRAS = List.of("feather", "neon", "void", "sunset", "nebula", "venom", "tide", "magma", "circuit", "autumn");
	static final List<String> TRAILS = List.of("hearts", "sparks", "snow", "notes", "flames", "clouds", "stars", "bubbles", "emerald", "soulfire",
		"crits", "witch", "ink", "ash");
	// fireflies came with 1.21.5
	//#if MC >= 1.21.5
	static final List<String> AURAS = List.of("enchant", "portal", "cherry", "souls", "royal", "glow", "magic", "amber", "sculk",
		"spores", "nautilus", "tears", "fireflies");
	//#else
	//$ static final List<String> AURAS = List.of("enchant", "portal", "cherry", "souls", "royal", "glow", "magic", "amber", "sculk",
	//$ 	"spores", "nautilus", "tears");
	//#endif
	static final List<String> PETS = List.of("allay", "vex", "bat", "parrot", "bee", "blaze", "phantom", "axolotl", "frog", "fox");
	private static final Map<String, List<String>> SLOTS = Map.of("cape", CAPES, "wings", WINGS, "elytra", ELYTRAS,
		"trail", TRAILS, "aura", AURAS, "pet", PETS);
	private static final long EMOTE_MS = 3500;
	private static final FontDescription EMOTE_FONT = Compat.font(Identifier.fromNamespaceAndPath(SlashHud.ID, "emote"));

	/** uuid → slot → item, what the server says each player wears (only items this mod knows). */
	private static final Map<UUID, Map<String, String>> worn = new ConcurrentHashMap<>();
	//#if MC >= 1.21.9
	private static final Map<String, ClientAsset.Texture> textures = new ConcurrentHashMap<>();
	//#endif
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

	/** Whether this version of the mod can draw an item. */
	static boolean knows(String slot, String item) {
		List<String> known = SLOTS.get(slot);
		return known != null && known.contains(item);
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
	//#if MC >= 1.21.9
	static ClientAsset.Texture testSkin;
	//#else
	//$ static Identifier testSkin;
	//#endif
	static UUID testSkinFor;

	//#if MC >= 1.20.2
	public static PlayerSkin withTestSkin(UUID id, PlayerSkin skin) {
		if (testSkin == null || !id.equals(testSkinFor)) return skin;
		//#if MC >= 1.21.9
		return new PlayerSkin(testSkin, skin.cape(), skin.elytra(), net.minecraft.world.entity.player.PlayerModelType.WIDE, skin.secure());
		//#else
		//$ return new PlayerSkin(testSkin, null, skin.capeTexture(), skin.elytraTexture(), PlayerSkin.Model.WIDE, skin.secure());
		//#endif
	}

	/** The skin with our cape in place of the player's own, when they picked one. */
	public static PlayerSkin withCape(UUID id, PlayerSkin skin, boolean wearsElytra) {
		skin = withTestSkin(id, skin);
		if (!SlashHud.config.badges) return skin;
		String cape = worn(id, "cape");
		// wings take the cape's place on the back (an elytra, when worn, takes theirs)
		//#if MC >= 1.21.9
		if (!wearsElytra && worn(id, "wings") != null) return new PlayerSkin(skin.body(), null, skin.elytra(), skin.model(), skin.secure());
		//#elif MC >= 1.21.2
		//$ if (!wearsElytra && worn(id, "wings") != null) return new PlayerSkin(skin.body(), skin.textureUrl(), null, skin.elytra(), skin.model(), skin.secure());
		//#endif
		String elytra = worn(id, "elytra");
		if (cape == null && elytra == null) return skin;
		if (cape != null) {
			Integer frames = ANIMATED.get(cape);
			if (frames != null) cape = cape + "_" + (System.currentTimeMillis() / FRAME_MS) % frames;
		}
		//#if MC >= 1.21.9
		ClientAsset.Texture capeTexture = cape == null ? skin.cape() : texture("cape", cape);
		// without an elytra of its own the elytra is drawn from the cape, as for Minecraft's own capes
		ClientAsset.Texture elytraTexture = elytra != null ? texture("elytra", elytra) : cape != null ? null : skin.elytra();
		return new PlayerSkin(skin.body(), capeTexture, elytraTexture, skin.model(), skin.secure());
		//#else
		//$ Identifier capeTexture = cape == null ? skin.capeTexture() : textureId("cape", cape);
		//$ // without an elytra of its own the elytra is drawn from the cape, as for Minecraft's own capes
		//$ Identifier elytraTexture = elytra != null ? textureId("elytra", elytra) : cape != null ? null : skin.elytraTexture();
		//$ return new PlayerSkin(skin.texture(), skin.textureUrl(), capeTexture, elytraTexture, skin.model(), skin.secure());
		//#endif
	}
	//#else
	//$ // 1.20.1 has no PlayerSkin: the cape and elytra pictures are asked for one by one (CapeMixin)
	//$ /** The cape picture to wear, or `own` (the player's own, maybe null). */
	//$ public static Identifier capeFor(UUID id, Identifier own) {
	//$ 	if (SlashHud.config == null || !SlashHud.config.badges) return own;
	//$ 	String cape = worn(id, "cape");
	//$ 	return cape == null ? own : capeTexture(cape);
	//$ }
	//$
	//$ /** The elytra picture to wear: our elytra, else our cape (as for Minecraft's own capes), else `own`. */
	//$ public static Identifier elytraFor(UUID id, Identifier own) {
	//$ 	if (SlashHud.config == null || !SlashHud.config.badges) return own;
	//$ 	String elytra = worn(id, "elytra");
	//$ 	if (elytra != null) return textureId("elytra", elytra);
	//$ 	return worn(id, "cape") != null ? capeFor(id, own) : own;
	//$ }
	//#endif

	/** Where one of our pictures is, for models drawn with it directly (the wings). */
	public static Identifier textureId(String kind, String name) {
		return Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/" + kind + "/" + name + ".png");
	}

	/** One of our textures (textures/<kind>/<name>.png), made once. */
	//#if MC >= 1.21.9
	static ClientAsset.Texture texture(String kind, String name) {
		//#if MC >= 1.21.9
		return textures.computeIfAbsent(kind + "/" + name, k -> new ClientAsset.ResourceTexture(
			Identifier.fromNamespaceAndPath(SlashHud.ID, k), Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/" + k + ".png")));
		//#else
		//$ // before 1.21.9 a skin holds the textures' own ids
		//$ return textures.computeIfAbsent(kind + "/" + name, k -> Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/" + k + ".png"));
		//#endif
	}
	//#endif

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
