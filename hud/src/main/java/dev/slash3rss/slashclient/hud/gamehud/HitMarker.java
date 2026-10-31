package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;

/**
 * A marker at the crosshair when we hit something, drawn with the crosshair (SlashHud) in first person.
 *
 * Only our own hits: a melee hit shows at once, from the attack itself (AttackEntityCallback, see
 * SlashHud); a hit by an arrow, trident or other thing we shot shows when the server tells about the
 * damage (its damage event names the one who caused it, DamageEventMixin). A target that starts
 * dying within {@link #KILL_MS} of our hit was our kill: the marker shows again in the kill colour.
 */
public final class HitMarker {
	private HitMarker() {}

	public static final String[] STYLES = { "x", "bold", "plus" };
	public static final String[] SOUNDS = { "ding", "click", "orb" };
	/** Arm length in GUI pixels; the arms start {@link #GAP} pixels from the middle, inside the crosshair's grid. */
	public static final int MIN_SIZE = 2, MAX_SIZE = 7;
	private static final int GAP = 2;
	static final long KILL_MS = 1500;

	/** When the marker started showing (0: none), the entity hit and when, and whether it died of it. */
	private static long shownAt;
	private static long hitAt;
	private static int targetId = -1;
	private static boolean kill;
	private static String cachedKey;
	private static boolean[] cached;

	/** Called just before the local player hits `target` (melee). */
	public static void attacked(Entity target) {
		// a body still falling over is not a new hit (fast clicking hits it again)
		if (target instanceof LivingEntity le && !le.isDeadOrDying()) show(target);
	}

	/**
	 * The server says `entityId` took damage, caused by `causeId` and dealt by `directId` (-1: nobody).
	 * Ours, when the cause is our player and what dealt it is not (an arrow we shot); our melee hits
	 * showed already. Called on the game thread.
	 */
	public static void damaged(int entityId, int causeId, int directId) {
		Minecraft mc = Minecraft.getInstance();
		HudConfig c = SlashHud.config;
		if (c == null || !c.hitMarker || !c.hitMarkerProjectiles || mc.player == null || mc.level == null) return;
		int self = mc.player.getId();
		if (causeId != self || directId == self || directId < 0 || entityId == self) return;
		Entity target = mc.level.getEntity(entityId);
		if (target instanceof LivingEntity) show(target);
	}

	private static void show(Entity target) {
		HudConfig c = SlashHud.config;
		if (c == null || !c.hitMarker) return;
		long now = System.currentTimeMillis();
		shownAt = hitAt = now;
		targetId = target.getId();
		kill = false;
		sound(1f);
	}

	/** Whether the target we hit last started dying: our kill. */
	public static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null) {
			reset();
			return;
		}
		HudConfig c = SlashHud.config;
		if (kill || targetId < 0 || !c.hitMarkerKill) return;
		long now = System.currentTimeMillis();
		if (now - hitAt > KILL_MS) {
			targetId = -1;
			return;
		}
		if (mc.level.getEntity(targetId) instanceof LivingEntity le && le.isDeadOrDying()) {
			kill = true;
			shownAt = now;
			// the same sound, higher
			sound(1.6f);
		}
	}

	public static void reset() {
		shownAt = 0;
		targetId = -1;
		kill = false;
	}

	private static void sound(float pitch) {
		HudConfig c = SlashHud.config;
		if (!c.hitMarkerSound || c.hitMarkerVolume <= 0) return;
		SoundEvent s = switch (c.hitMarkerSoundKind) {
			case "click" -> SoundEvents.NOTE_BLOCK_HAT.value();
			case "orb" -> SoundEvents.EXPERIENCE_ORB_PICKUP;
			default -> SoundEvents.ARROW_HIT_PLAYER;
		};
		Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(s, pitch, c.hitMarkerVolume / 100f));
	}

	/** What shows now, for the test: "hit" or "kill" while the marker is on, "" when not. */
	public static String state() {
		return visibleFor() > 0 ? (kill ? "kill" : "hit") : "";
	}

	/** How opaque the marker is now, 0 to 1: full for its first half, then fading out. */
	private static float visibleFor() {
		HudConfig c = SlashHud.config;
		if (shownAt == 0 || c == null || !c.hitMarker) return 0;
		float t = (System.currentTimeMillis() - shownAt) / (float) Math.max(1, c.hitMarkerDuration);
		return t >= 1 ? 0 : t < 0.5f ? 1 : (1 - t) * 2;
	}

	/** Around the crosshair, in first person only (the third person camera's middle is not where we aim). */
	public static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		float a = visibleFor();
		if (a <= 0 || !mc.options.getCameraType().isFirstPerson()) return;
		HudConfig c = SlashHud.config;
		int color = kill && c.hitMarkerKill ? c.hitMarkerKillColor : c.hitMarkerColor;
		int alpha = Math.round(((color >>> 24) & 0xFF) * a);
		int mid = Crosshair.MID;
		Crosshair.draw(g, g.guiWidth() / 2 - mid, g.guiHeight() / 2 - mid, pixels(c.hitMarkerStyle, c.hitMarkerSize), 1,
			(alpha << 24) | (color & 0xFFFFFF), Math.round(0x90 * a) << 24);
	}

	/** The marker as the crosshair's 21×21 grid: four arms from the middle, slanted ("x", "bold") or straight ("plus"). */
	static boolean[] pixels(String style, int size) {
		String key = style + ":" + size;
		if (key.equals(cachedKey)) return cached;
		int n = Crosshair.N;
		boolean[] p = new boolean[n * n];
		int s = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));
		for (int i = GAP + 1; i <= GAP + s; i++) for (int sx = -1; sx <= 1; sx += 2) for (int sy = -1; sy <= 1; sy += 2) {
			switch (style) {
				case "plus" -> {
					set(p, sx * i, 0);
					set(p, 0, sy * i);
				}
				// two pixels wide: each step of the slant doubled outwards
				case "bold" -> {
					set(p, sx * i, sy * i);
					set(p, sx * (i + 1), sy * i);
				}
				default -> set(p, sx * i, sy * i);
			}
		}
		cached = p;
		cachedKey = key;
		return p;
	}

	private static void set(boolean[] p, int dx, int dy) {
		int x = Crosshair.MID + dx, y = Crosshair.MID + dy;
		if (x >= 0 && y >= 0 && x < Crosshair.N && y < Crosshair.N) p[y * Crosshair.N + x] = true;
	}
}
