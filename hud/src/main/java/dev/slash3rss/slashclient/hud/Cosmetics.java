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
	static final List<String> CAPES = List.of("slash", "ocean", "ember", "forest", "galaxy", "rose", "gold", "mono");
	private static final long EMOTE_MS = 3500;
	private static final FontDescription EMOTE_FONT = new FontDescription.Resource(Identifier.fromNamespaceAndPath(SlashHud.ID, "emote"));

	private static final Map<UUID, String> capes = new ConcurrentHashMap<>();
	private static final Map<String, ClientAsset.Texture> textures = new ConcurrentHashMap<>();
	private record Shown(String emote, long until) {}
	private static final Map<UUID, Shown> emotes = new ConcurrentHashMap<>();

	/** The emote wheel's key, registered with the others in SlashHud. */
	static net.minecraft.client.KeyMapping key;

	public static net.minecraft.client.KeyMapping emoteKey() {
		return key;
	}

	static void setCape(UUID id, String cape) {
		if (cape != null && CAPES.contains(cape)) capes.put(id, cape);
		else capes.remove(id);
	}

	static void reset() {
		capes.clear();
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
	public static PlayerSkin withCape(UUID id, PlayerSkin skin) {
		skin = withTestSkin(id, skin);
		if (!SlashHud.config.badges) return skin;
		String cape = capes.get(id);
		if (cape == null) return skin;
		ClientAsset.Texture texture = textures.computeIfAbsent(cape, c -> new ClientAsset.ResourceTexture(
			Identifier.fromNamespaceAndPath(SlashHud.ID, "cape/" + c), Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/cape/" + c + ".png")));
		// elytra drawn from the cape, as for Minecraft's own capes
		return new PlayerSkin(skin.body(), texture, null, skin.model(), skin.secure());
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
		return capes.get(id);
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
