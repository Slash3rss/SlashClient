package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.ui.Ui;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Items;

/**
 * Tells the player when a potion they drank runs out (or a few seconds before): only effects that came from drinking
 * a potion, not a beacon's, a golden apple's or a server's. An effect is the potion's when it starts (or grows longer)
 * in the moment after the player finished drinking; given again by anything else later, it is no longer counted.
 * Shown where the player picked (a toast, a banner at the top, above the hotbar or in the chat), with a sound of their choice.
 */
public final class PotionEnd {
	public static final String[] PLACES = { "toast", "banner", "actionbar", "chat" };
	public static final String[] SOUNDS = { "none", "pling", "bell", "chime", "bottle", "orb" };
	/** How long after drinking an effect still counts as the potion's (the server's word on it comes a little later). */
	private static final int DRANK_TICKS = 40;
	/** An effect longer by more than this than a tick ago was given again (a small jump is the server's correction). */
	private static final int REGIVEN = 20;

	/** A potion's effect: whether a warning before its end is still to come, and whether it was told already. */
	private record Drunk(String name, boolean warn, boolean told) {}

	private static Player player;
	private static long ticks, drankAt = Long.MIN_VALUE / 2, milkAt = Long.MIN_VALUE / 2;
	private static boolean drinking, drinkingMilk;
	/** Each effect's time left a tick ago, and the ones from a potion drunk (by the effect). */
	private static final Map<Object, Integer> last = new HashMap<>();
	private static final Map<Object, Drunk> drunk = new HashMap<>();
	/** How many notifications were shown (for the in-game test). */
	private static int shownCount;

	private PotionEnd() {}

	public static void tick(Minecraft mc) {
		HudConfig c = SlashHud.config;
		Player p = mc.player;
		if (p == null || p != player || c == null || !c.potionEnd) {
			// another world or a respawn (a new player): nothing of before is told
			player = p;
			last.clear();
			drunk.clear();
			return;
		}
		ticks++;
		boolean potion = p.isUsingItem() && p.getUseItem().is(Items.POTION);
		if (drinking && !potion) drankAt = ticks;
		drinking = potion;
		boolean milk = p.isUsingItem() && p.getUseItem().is(Items.MILK_BUCKET);
		if (drinkingMilk && !milk) milkAt = ticks;
		drinkingMilk = milk;

		int warnTicks = c.potionEndWarn * 20;
		Map<Object, Integer> now = new HashMap<>();
		for (MobEffectInstance e : p.getActiveEffects()) {
			Object key = e.getEffect();
			now.put(key, e.getDuration());
			Integer before = last.get(key);
			if (before == null || e.getDuration() > before + REGIVEN) {
				// a warning only when it lasts longer than the warning, else it is told at its end
				if (ticks - drankAt <= DRANK_TICKS && !e.isInfiniteDuration()) drunk.put(key, new Drunk(name(e), warnTicks > 0 && e.getDuration() > warnTicks, false));
				else drunk.remove(key);
			}
			Drunk d = drunk.get(key);
			if (d != null && d.warn() && e.getDuration() <= warnTicks) {
				drunk.put(key, new Drunk(d.name(), false, true));
				tell(mc, c, d.name(), c.potionEndWarn);
			}
		}
		for (var it = drunk.entrySet().iterator(); it.hasNext();) {
			var d = it.next();
			if (now.containsKey(d.getKey())) continue;
			it.remove();
			// gone by dying or a bucket of milk is not running out; a warning already told is enough
			if (!p.isDeadOrDying() && ticks - milkAt > DRANK_TICKS && !d.getValue().told()) tell(mc, c, d.getValue().name(), 0);
		}
		last.clear();
		last.putAll(now);
	}

	/** "Szybkość II" as the effects module writes it. */
	private static String name(MobEffectInstance e) {
		Component name = Component.translatable(e.getDescriptionId());
		if (e.getAmplifier() > 0) name = Component.empty().append(name).append(" ").append(Component.translatable("enchantment.level." + (e.getAmplifier() + 1)));
		return name.getString();
	}

	private static void tell(Minecraft mc, HudConfig c, String effect, int secondsLeft) {
		shownCount++;
		String title = I18n.get(secondsLeft > 0 ? "slashclient-hud.potionEnd.soon" : "slashclient-hud.potionEnd.ended");
		String text = secondsLeft > 0 ? I18n.get("slashclient-hud.potionEnd.in", effect, secondsLeft) : effect;
		switch (c.potionEndPlace) {
			case "banner" -> show(title, text);
			case "actionbar" -> Compat.overlay(mc, Component.literal(title + ": " + text));
			case "chat" -> chat(mc, Component.literal(title + ": ").withStyle(s -> s.withColor(0xC084FC)).append(Component.literal(text).withStyle(s -> s.withColor(0xFFFFFF))));
			default -> dev.slash3rss.slashclient.hud.social.Social.toast(title, text, "m-effects");
		}
		sound(c);
	}

	private static void chat(Minecraft mc, Component line) {
		//#if MC >= 26.1
		Compat.chat(mc).addClientSystemMessage(line);
		//#else
		//$ Compat.chat(mc).addMessage(line);
		//#endif
	}

	private static void sound(HudConfig c) {
		if (c.potionEndVolume <= 0) return;
		SoundEvent s = switch (c.potionEndSound) {
			case "none" -> null;
			case "bell" -> SoundEvents.NOTE_BLOCK_BELL.value();
			case "chime" -> SoundEvents.AMETHYST_BLOCK_CHIME;
			case "bottle" -> SoundEvents.BOTTLE_EMPTY;
			case "orb" -> SoundEvents.EXPERIENCE_ORB_PICKUP;
			default -> SoundEvents.NOTE_BLOCK_PLING.value();
		};
		if (s != null) dev.slash3rss.slashclient.hud.Sounds.play(s, 1f, c.potionEndVolume);
	}

	// ---------- the banner at the top: slides down, a dark card in the potions' purple, slides back up ----------

	private static final long IN = 300, SHOW = 4000, OUT = 300;
	private static final int LIGHT = 0xFFC084FC, DARK = 0xFF7E22CE;
	private static String bannerTitle = "", bannerText = "";
	private static long bannerAt = -1;

	private static void show(String title, String text) {
		bannerTitle = title;
		bannerText = text;
		bannerAt = System.currentTimeMillis();
	}

	public static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		if (bannerAt < 0) return;
		long age = System.currentTimeMillis() - bannerAt;
		if (age >= IN + SHOW + OUT) {
			bannerAt = -1;
			return;
		}
		float in = ease(Math.min(1f, (float) age / IN));
		float out = age > IN + SHOW ? ease((float) (age - IN - SHOW) / OUT) : 0f;
		Component head = Ui.bold(bannerTitle), line = Component.literal(bannerText);
		int w = Math.max(160, Math.min(280, 46 + Math.max(Ui.width(head), Ui.width(line))));
		int h = 32;
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		// under the boss bars
		int at = Math.max(30, sh / 9);
		int x = (sw - w) / 2, y = Math.round(-h - 4 + (at + h + 4) * (in - out));
		Ui.round(g, x, y, w, h, 7, Ui.PANEL);
		Ui.roundOutline(g, x, y, w, h, 7, LIGHT & 0x80FFFFFF);
		Ui.roundGradient(g, x + 7, y + 7, 18, 18, 5, LIGHT, DARK);
		Ui.icon(g, "m-effects", x + 11, y + 11, 10, 0xFFFFFFFF);
		int textW = w - 33 - 8;
		Ui.draw(g, Ui.fit(head, textW), x + 33, y + 7, LIGHT);
		Ui.draw(g, Ui.fit(line, textW), x + 33, y + 18, Ui.TEXT);
		float left = Math.max(0f, Math.min(1f, 1f - (float) (age - IN) / SHOW));
		g.fill(x + 8, y + h - 3, x + 8 + Math.round((w - 16) * left), y + h - 2, LIGHT);
	}

	private static float ease(float t) {
		float u = 1f - t;
		return 1f - u * u * u;
	}

	/** For the test: the player finished drinking a potion now. */
	public static void drankForTest() {
		drankAt = ticks;
	}

	/** For the test: how many notifications were shown, and whether the banner is on screen. */
	public static int shownForTest() {
		return shownCount;
	}

	public static boolean bannerForTest() {
		return bannerAt >= 0;
	}
}
