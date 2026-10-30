package dev.slash3rss.slashclient.hud.cosmetics;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Sprays, a SlashClient cosmetic: with its key the player sprays their picture (slot "spray") on the
 * face of the block they look at, up to {@link #REACH} blocks away. It is drawn on our side only, a
 * hair off the face, and fades after {@link #LIFE_MS}; it goes when the block is broken, and a player
 * has at most {@link #PER_PLAYER} at once (a new one takes the oldest one's place).
 *
 * Others see it through the SlashClient server: the spray goes out through the launcher, and the
 * server passes it on to players there with SlashClient ('spray' events, {@link #received}). Nothing
 * reaches the game's server. Drawing is in {@link SprayRender}.
 */
public final class Sprays {
	private Sprays() {}

	/** In the order of the menus (and of the server's catalog). */
	public static final List<String> IDS = List.of("spray_logo", "spray_gg", "spray_heart", "spray_skull", "spray_lol",
		"spray_crown", "spray_emblem", "spray_pumpkin",
		"spray_spark", "spray_trophy");
	static final double REACH = 5;
	static final long LIFE_MS = 60_000, FADE_MS = 5_000, COOLDOWN_MS = 3_000;
	static final int PER_PLAYER = 3;
	/** Further than this a spray is not drawn. */
	static final double DRAW_RANGE_SQ = 96 * 96;

	/**
	 * One spray on a block: whose, which picture, which face of which block, and where the picture's
	 * top points on a floor or a ceiling (0 north, 1 east, 2 south, 3 west).
	 */
	record Decal(UUID owner, String id, BlockPos pos, Direction face, int rot, String dimension, long at) {
		/** How opaque it is now: full, then fading out over its last seconds. */
		float alpha(long now) {
			long left = at + LIFE_MS - now;
			return left >= FADE_MS ? 1f : Math.max(0f, left / (float) FADE_MS);
		}
	}

	/** Touched on the game's thread only. */
	static final List<Decal> decals = new ArrayList<>();
	/** The spray key, registered with the others in SlashHud (no key by default). */
	public static net.minecraft.client.KeyMapping key;
	private static long lastSpray;

	public static Identifier texture(String id) {
		return Cosmetics.textureId("spray", id);
	}

	public static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null) {
			decals.clear();
			return;
		}
		if (key != null) while (key.consumeClick()) {
			if (Compat.screen(mc) == null) spray(mc);
		}
		long now = System.currentTimeMillis();
		String here = dimension(mc);
		// gone with time, or with the block it was on (only checked where the block is loaded)
		decals.removeIf(d -> now - d.at() >= LIFE_MS || d.dimension().equals(here) && mc.level.isLoaded(d.pos()) && mc.level.getBlockState(d.pos()).isAir());
	}

	public static void reset() {
		decals.clear();
	}

	/** The key was pressed: our spray on the block face in front of us, here and for the others. */
	public static void spray(Minecraft mc) {
		UUID self = mc.player.getUUID();
		String id = Cosmetics.worn(self, "spray");
		if (id == null) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.spray.none"));
			return;
		}
		long now = System.currentTimeMillis();
		long wait = lastSpray + COOLDOWN_MS - now;
		if (wait > 0) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.spray.wait", String.format(java.util.Locale.ROOT, "%.1f", wait / 1000.0)));
			return;
		}
		HitResult hit = mc.player.pick(REACH, 1f, false);
		if (!(hit instanceof BlockHitResult b) || hit.getType() != HitResult.Type.BLOCK) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.spray.noBlock"));
			return;
		}
		BlockPos pos = b.getBlockPos();
		Direction face = b.getDirection();
		// a whole face only: on a fence or a flower the picture would hang in the air
		if (!mc.level.getBlockState(pos).isFaceSturdy(mc.level, pos, face)) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.spray.cannot"));
			return;
		}
		int rot = rotFor(face, mc.player.getYRot());
		lastSpray = now;
		String dim = dimension(mc);
		add(new Decal(self, id, pos, face, rot, dim, now));
		if (dev.slash3rss.slashclient.hud.social.Social.bridged()) {
			String server = mc.getCurrentServer() != null && !mc.hasSingleplayerServer() ? mc.getCurrentServer().ip : "";
			dev.slash3rss.slashclient.hud.social.Social.spray(self, id, server, dim, pos.getX(), pos.getY(), pos.getZ(), face.getSerializedName(), rot);
		} else Compat.overlay(mc, Component.translatable("slashclient-hud.spray.noLauncher"));
	}

	/**
	 * Where the picture's top points on a floor or a ceiling, for a player looking with this yaw: on a
	 * floor where they look, on a ceiling back towards them (so either reads upright from where they stand).
	 */
	static int rotFor(Direction face, float yaw) {
		if (face.getAxis() != Direction.Axis.Y) return 0;
		// yaw 0 looks south, 90 west, 180 north, 270 east
		int quarter = Math.floorMod(Math.round(yaw / 90f), 4);
		int looking = switch (quarter) {
			case 0 -> 2;
			case 1 -> 3;
			case 2 -> 0;
			default -> 1;
		};
		return face == Direction.UP ? looking : (looking + 2) % 4;
	}

	/** A new spray: it replaces one on the same face, and the owner's oldest beyond {@link #PER_PLAYER}. */
	static void add(Decal d) {
		decals.removeIf(o -> o.pos().equals(d.pos()) && o.face() == d.face() && o.dimension().equals(d.dimension()));
		decals.add(d);
		List<Decal> theirs = new ArrayList<>();
		for (Decal o : decals) if (o.owner().equals(d.owner())) theirs.add(o);
		for (int i = 0; i < theirs.size() - PER_PLAYER; i++) decals.remove(theirs.get(i));
	}

	/**
	 * Another player's spray (the server's 'spray' event, through the launcher). Shown when other
	 * players' sprays are on, it is in our dimension and its player is in our game (the tab list:
	 * the same server, or the same LAN world).
	 */
	public static void received(JsonObject e) {
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> {
			if (SlashHud.config == null || !SlashHud.config.sprays || !SlashHud.config.spraysOthers || !SlashHud.config.cosmeticsOthers || mc.level == null || mc.player == null) return;
			try {
				UUID owner = UUID.fromString(e.get("uuid").getAsString());
				String id = e.get("spray").getAsString();
				if (owner.equals(mc.player.getUUID()) || !IDS.contains(id)) return;
				if (!e.get("dimension").getAsString().equals(dimension(mc))) return;
				if (mc.getConnection() == null || mc.getConnection().getPlayerInfo(owner) == null) return;
				Direction face = face(e.get("face").getAsString());
				int rot = e.has("rot") ? e.get("rot").getAsInt() : 0;
				if (face == null || rot < 0 || rot > 3) return;
				add(new Decal(owner, id, new BlockPos(e.get("x").getAsInt(), e.get("y").getAsInt(), e.get("z").getAsInt()), face, rot,
					dimension(mc), System.currentTimeMillis()));
			} catch (RuntimeException ignored) {
				// not a spray this version understands
			}
		});
	}

	public static Direction face(String name) {
		for (Direction d : Direction.values()) if (d.getSerializedName().equals(name)) return d;
		return null;
	}

	/** "minecraft:overworld" and the like, the same text on every version. */
	static String dimension(Minecraft mc) {
		if (mc.level == null) return "";
		// a ResourceKey prints as "ResourceKey[minecraft:dimension / minecraft:overworld]"
		String s = String.valueOf(mc.level.dimension());
		int slash = s.lastIndexOf(" / ");
		return slash < 0 ? s : s.substring(slash + 3).replace("]", "");
	}

	/** The light where a spray is: that of the air in front of its face, packed as the game packs it. */
	static int light(Minecraft mc, Decal d) {
		BlockPos front = d.pos().relative(d.face());
		return mc.level.getBrightness(LightLayer.BLOCK, front) << 4 | mc.level.getBrightness(LightLayer.SKY, front) << 20;
	}

	/** Whether a spray of ours waits for the next one: how much of the wait is left (0 to 1, 0 for none). */
	static float cooldown() {
		long left = lastSpray + COOLDOWN_MS - System.currentTimeMillis();
		return left <= 0 ? 0 : left / (float) COOLDOWN_MS;
	}

	/** A thin bar under the crosshair while the next spray waits. */
	public static void drawCooldown(GuiGraphicsExtractor g, Minecraft mc) {
		float left = cooldown();
		if (left <= 0 || mc.player == null || Compat.screen(mc) != null) return;
		int w = 20, x = g.guiWidth() / 2 - w / 2, y = g.guiHeight() / 2 + 9;
		g.fill(x - 1, y - 1, x + w + 1, y + 2, 0x80000000);
		g.fill(x, y, x + Math.round(w * (1 - left)), y + 1, 0xFF60A5FA);
	}

	// ---------- for the tests ----------

	/** Sprays as the key would, ignoring the wait between sprays. */
	public static void sprayNow(Minecraft mc) {
		lastSpray = 0;
		spray(mc);
	}

	/** Puts a spray of `owner` on a face (as if one arrived), `ageMs` old already. */
	public static void place(UUID owner, String id, BlockPos pos, Direction face, int rot, long ageMs) {
		add(new Decal(owner, id, pos, face, rot, dimension(Minecraft.getInstance()), System.currentTimeMillis() - ageMs));
	}

	/** "id@x,y,z/face" of every spray, oldest first. */
	public static String summary() {
		List<String> out = new ArrayList<>();
		for (Decal d : decals) out.add(d.id() + "@" + d.pos().getX() + "," + d.pos().getY() + "," + d.pos().getZ() + "/" + d.face().getSerializedName());
		return String.join(";", out);
	}
}
