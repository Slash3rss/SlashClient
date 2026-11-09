package dev.slash3rss.slashclient.hud.skyup;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.chat.ChatTabs;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SkyUp's boosts and job skills, read from their boss bars, with a banner and a sound:
 * - a boost ("Boost » Drop z mobów » 1 godz 59 min") about to run out, a set number of minutes before;
 * - a job skill ("Nawałnica (pozostało 1 min 14 sek)") over, and ready again once its cooldown (10 minutes
 *   from its end on SkyUp, a setting) has passed.
 * A bar gone with time still left on it (another sector, the server left) is not the end: only one gone in its
 * last seconds is.
 */
public final class SkyBoosts {
	private SkyBoosts() {}

	/** "Boost » Drop z mobów » 1 godz 59 min". */
	private static final Pattern BOOST = Pattern.compile("^\\s*Boost\\s*»\\s*(.+?)\\s*»\\s*(.+?)\\s*$");
	/** "Nawałnica (pozostało 1 min 14 sek)", a symbol before it. */
	private static final Pattern SKILL = Pattern.compile("^[^\\p{L}]*(\\p{L}[\\p{L} ]*?)\\s*\\(\\s*pozosta\\p{L}*\\s+(.+?)\\)\\s*$");
	private static final Pattern PART = Pattern.compile("(\\d+)\\s*(godz|h|min|m|sek|s)\\p{L}*", Pattern.CASE_INSENSITIVE);
	/** A bar that went with no more than this left ran out (its time is read once a second). */
	private static final long ENDED_WITHIN = 5_000;

	/** A boost or skill seen on a bar: when it ends as last read, and whether its warning was given. */
	private static final class Timer {
		long endsAt;
		boolean warned;
		long seenAt;
		/** How far off the time may be: a second, or a minute when the bar shows minutes only. */
		long slack;
	}

	private static final Map<String, Timer> boosts = new HashMap<>(), skills = new HashMap<>();
	/**
	 * Job skills on their cooldown: name → the time still to wait. SkyUp stops the cooldown while the player is
	 * logged out, so it counts down only while on SkyUp.
	 */
	private static final Map<String, Long> cooldowns = new HashMap<>();
	/** When the cooldowns were last counted down (-1: off SkyUp since). */
	private static long countedAt = -1;

	/** As if on SkyUp (the in-game test's world). */
	public static boolean testWorld;
	/** For the test: the cooldown in ms instead of the setting's minutes (-1: the setting). */
	public static long cooldownForTest = -1;
	private static String lastForTest = "";

	static boolean onSkyUp(Minecraft mc) {
		if (testWorld) return true;
		var server = mc.getCurrentServer();
		return server != null && server.ip.toLowerCase(Locale.ROOT).contains("skyup.pl");
	}

	/** "1 godz 58 min", "1 min 14 sek", "45 sek" in ms; -1 when it says no time. */
	static long parse(String text) {
		Matcher m = PART.matcher(text);
		long ms = 0;
		boolean any = false;
		while (m.find()) {
			long n = Long.parseLong(m.group(1));
			String unit = m.group(2).toLowerCase(Locale.ROOT);
			ms += unit.startsWith("g") || unit.equals("h") ? n * 3_600_000 : unit.startsWith("m") ? n * 60_000 : n * 1_000;
			any = true;
		}
		return any ? ms : -1;
	}

	private static List<String> barTexts(Minecraft mc) {
		List<String> out = new ArrayList<>();
		var overlay = dev.slash3rss.slashclient.hud.Compat.bossOverlay(mc);
		if (overlay == null) return out;
		for (var event : ((dev.slash3rss.slashclient.hud.mixin.BossHealthOverlayAccessor) overlay).slashclient$events().values())
			out.add(DungeonMap.uncoloured(event.getName().getString()));
		return out;
	}

	public static void tick(Minecraft mc) {
		HudConfig c = SlashHud.config;
		if (c == null || !c.skyAlerts || mc.level == null || mc.player == null || !onSkyUp(mc)) {
			boosts.clear();
			skills.clear();
			countedAt = -1;
			return;
		}
		if (mc.level.getGameTime() % 5 != 0) return;
		long now = System.currentTimeMillis();
		long passed = countedAt < 0 ? 0 : now - countedAt;
		countedAt = now;
		for (String bar : barTexts(mc)) {
			Matcher b = BOOST.matcher(bar);
			if (b.find()) {
				long left = parse(b.group(2));
				if (left >= 0) seen(boosts, b.group(1).strip(), left, b.group(2), now);
				continue;
			}
			Matcher s = SKILL.matcher(bar);
			if (s.find()) {
				long left = parse(s.group(2));
				if (left >= 0) {
					seen(skills, s.group(1).strip(), left, s.group(2), now);
					cooldowns.remove(s.group(1).strip());
				}
			}
		}
		// boosts about to run out, then gone
		long warnBefore = c.skyBoostWarn * 60_000L;
		for (var it = boosts.entrySet().iterator(); it.hasNext(); ) {
			var e = it.next();
			Timer t = e.getValue();
			if (t.seenAt == now) {
				if (warnBefore > 0 && !t.warned && t.endsAt - now <= warnBefore && t.endsAt > now) {
					t.warned = true;
					alert(mc, c, "boostSoon", e.getKey(), time(t.endsAt - now), new ItemStack(Items.CLOCK));
				}
				continue;
			}
			it.remove();
			if (c.skyBoostEnd && t.endsAt - now <= ENDED_WITHIN + t.slack) alert(mc, c, "boostEnd", e.getKey(), "", new ItemStack(Items.CLOCK));
		}
		// skills over, then ready again after their cooldown
		for (var it = skills.entrySet().iterator(); it.hasNext(); ) {
			var e = it.next();
			Timer t = e.getValue();
			if (t.seenAt == now) continue;
			it.remove();
			if (t.endsAt - now > ENDED_WITHIN + t.slack) continue;
			if (c.skySkillEnd) alert(mc, c, "skillEnd", e.getKey(), "", skillLook(mc, e.getKey()));
			long cooldown = cooldownForTest >= 0 ? cooldownForTest : c.skySkillCooldown * 60_000L;
			if (c.skySkillReady && cooldown > 0) cooldowns.put(e.getKey(), cooldown + passed);
		}
		for (var it = cooldowns.entrySet().iterator(); it.hasNext(); ) {
			var e = it.next();
			e.setValue(e.getValue() - passed);
			if (e.getValue() > 0) continue;
			it.remove();
			alert(mc, c, "skillReady", e.getKey(), "", skillLook(mc, e.getKey()));
		}
	}

	/** Each job's skill on SkyUp: its name on the bar → the job. */
	private static final Map<String, String> SKILL_JOBS = Map.of(
		"wiertło", "Górnik", "piła", "Drwal", "pług", "Farmer", "nawałnica", "Łowca",
		"rozbiórka", "Budowniczy", "sieci rybackie", "Rybak", "eskalacja", "Czarodziej");

	/** The job a skill belongs to, or null for one not known. */
	static String jobOf(String skill) {
		return SKILL_JOBS.get(skill.strip().toLowerCase(Locale.ROOT));
	}

	/**
	 * The item the skill is used with (skyup.pl/wiki/prace): the drill a pickaxe, the saw an axe, the plough a hoe,
	 * the storm a sword, the demolition a shovel, the nets a fishing rod, the escalation a potion; another skill
	 * its job's picture.
	 */
	static net.minecraft.world.item.Item skillIcon(String skill) {
		return switch (skill.strip().toLowerCase(Locale.ROOT)) {
			case "wiertło" -> Items.DIAMOND_PICKAXE;
			case "piła" -> Items.DIAMOND_AXE;
			case "pług" -> Items.DIAMOND_HOE;
			case "nawałnica" -> Items.DIAMOND_SWORD;
			case "rozbiórka" -> Items.DIAMOND_SHOVEL;
			case "sieci rybackie" -> Items.FISHING_ROD;
			case "eskalacja" -> Items.POTION;
			default -> {
				String job = jobOf(skill);
				yield job == null ? Items.IRON_PICKAXE : DungeonRun.jobIcon(job);
			}
		};
	}

	private static void seen(Map<String, Timer> map, String name, long left, String text, long now) {
		Timer t = map.computeIfAbsent(name, k -> new Timer());
		t.slack = text.toLowerCase(Locale.ROOT).matches(".*\\d+\\s*s.*") ? 0 : 60_000;
		long endsAt = now + left;
		// a new boost of the same kind (longer than the one before): warned again when it runs low
		if (endsAt > t.endsAt + 120_000) t.warned = false;
		t.endsAt = endsAt;
		t.seenAt = now;
	}

	/** "1 min 5 sek", "45 sek": how long is left, as SkyUp writes it. */
	static String time(long ms) {
		long s = Math.max(0, Math.round(ms / 1000.0));
		return s >= 60 ? Component.translatable("slashclient-hud.skyAlerts.minSec", s / 60, s % 60).getString()
			: Component.translatable("slashclient-hud.skyAlerts.sec", s).getString();
	}

	/**
	 * The jobs in SkyUp's order and their active skill's picture in its /prace menu: a head with the model
	 * 641 (the miner) to 647 (the wizard) from SkyUp's resource pack.
	 */
	private static final List<String> JOB_ORDER = List.of("Górnik", "Drwal", "Farmer", "Łowca", "Budowniczy", "Rybak", "Czarodziej");

	/** The skill as SkyUp's menu draws it (with its pack loaded), else the item it is used with. */
	public static ItemStack skillLook(Minecraft mc, String skill) {
		String job = jobOf(skill);
		int at = job == null ? -1 : JOB_ORDER.indexOf(job);
		//#if MC >= 26.3
		if (at >= 0 && mc.getResourceManager().getNamespaces().contains("skyup")) {
			ItemStack head = new ItemStack(Items.PLAYER_HEAD);
			head.set(net.minecraft.core.component.DataComponents.CUSTOM_MODEL_DATA,
				new net.minecraft.world.item.component.CustomModelData(List.of(641f + at), List.of(), List.of(), List.of()));
			return head;
		}
		//#endif
		return new ItemStack(skillIcon(skill));
	}

	private static void alert(Minecraft mc, HudConfig c, String key, String name, String left, ItemStack icon) {
		String title = Component.translatable("slashclient-hud.skyAlerts." + key + "Title").getString();
		String text = Component.translatable("slashclient-hud.skyAlerts." + key, name, left).getString();
		lastForTest = title + ": " + text;
		//#if MC >= 26.3
		SkyReminder.show(key.startsWith("boost") ? SkyReminder.Look.BOOST : SkyReminder.Look.SKILL, title, text, icon);
		//#endif
		String sound = c.skyAlertsSound == null || c.skyAlertsSound.equals("default") ? "" : c.skyAlertsSound;
		mc.execute(() -> ChatTabs.playSound(mc, sound, c.skyAlertsVolume));
	}

	/** For the test: the last banner, "title: text". */
	public static String lastForTest() {
		return lastForTest;
	}

	/** For the test: nothing seen, nothing waiting. */
	public static void clearForTest() {
		boosts.clear();
		skills.clear();
		cooldowns.clear();
		countedAt = -1;
		lastForTest = "";
	}
}
