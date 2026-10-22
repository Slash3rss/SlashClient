package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientSendMessageEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The game session in numbers, for the launcher's "Podsumowanie sesji" after the game closes:
 * time in worlds and on servers, deaths, kills, damage, blocks, distance, chat messages,
 * screenshots, clips and the FPS. Only counters: nothing is kept per frame or per block. Written
 * to config/slashclient-session.json every minute (a crash still leaves most of it) and when
 * the game closes ("closed": true).
 */
public final class SessionStats {
	private SessionStats() {}

	/** When this game started: the launcher takes the file only when it is from its own run. */
	static final long STARTED = System.currentTimeMillis();
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final long SAVE_EVERY_MS = 60_000;

	static long playMs;
	static int deaths, playerKills, mobKills, blocksMined, blocksPlaced, messages, commands, screenshots, clips;
	static double damageDealt, damageTaken;
	static double walk, sprint, swim, fly, elytra, ride;
	private static long lifeMs, longestLifeMs;

	/** Worlds and servers by "kind:name", in the order first visited. */
	private static final Map<String, Place> places = new LinkedHashMap<>();
	private static Place current;

	private static final class Place {
		final String kind, name, address;
		long ms;
		int visits;

		Place(String kind, String name, String address) {
			this.kind = kind;
			this.name = name;
			this.address = address;
		}
	}

	private static long lastTick, lastSave;
	private static boolean wasDead, wasInWorld;
	private static float lastHealth = -1;
	private static Vec3 lastPos;

	/** Health of what we hit lately, by entity id: drops in the next moments are our damage. */
	private static final Map<Integer, float[]> hit = new HashMap<>();
	private static final Map<Integer, Long> hitAt = new HashMap<>();

	// frame times in half milliseconds (the last bucket takes everything slower), for the 1% low
	private static final int[] frameTimes = new int[1000];
	private static long frames;
	private static double frameMsTotal;
	private static long lastFrame;

	static void register() {
		ClientSendMessageEvents.CHAT.register(message -> messages++);
		ClientSendMessageEvents.COMMAND.register(command -> commands++);
		ClientLifecycleEvents.CLIENT_STOPPING.register(mc -> save(true));
	}

	static void tick(Minecraft mc) {
		long now = System.currentTimeMillis();
		long dt = lastTick == 0 ? 0 : Math.min(1000, Math.max(0, now - lastTick));
		lastTick = now;
		boolean inWorld = mc.player != null && mc.level != null;
		if (!inWorld) {
			current = null;
			lastHealth = -1;
			lastPos = null;
			wasDead = false;
			hit.clear();
			hitAt.clear();
			// just left a world: the time there is written now
			if (wasInWorld) save(false);
			wasInWorld = false;
			return;
		}
		wasInWorld = true;
		playMs += dt;
		if (current == null) current = placeOf(mc);
		if (current != null) current.ms += dt;

		var p = mc.player;
		boolean dead = p.isDeadOrDying();
		if (dead && !wasDead) {
			deaths++;
			longestLifeMs = Math.max(longestLifeMs, lifeMs);
			lifeMs = 0;
		}
		if (!dead) lifeMs += dt;
		wasDead = dead;

		float health = p.getHealth();
		if (lastHealth >= 0 && health < lastHealth) damageTaken += lastHealth - health;
		lastHealth = health;

		for (Iterator<Map.Entry<Integer, float[]>> it = hit.entrySet().iterator(); it.hasNext(); ) {
			Map.Entry<Integer, float[]> e = it.next();
			Entity entity = mc.level.getEntity(e.getKey());
			Long at = hitAt.get(e.getKey());
			if (!(entity instanceof LivingEntity le) || at == null || now - at > 1500) {
				it.remove();
				hitAt.remove(e.getKey());
				continue;
			}
			float h = Math.max(0, le.getHealth());
			if (h < e.getValue()[0]) damageDealt += e.getValue()[0] - h;
			e.getValue()[0] = h;
		}

		Vec3 pos = p.position();
		if (lastPos != null && !dead) moved(p, pos.x - lastPos.x, pos.y - lastPos.y, pos.z - lastPos.z);
		lastPos = pos;

		if (now - lastSave >= SAVE_EVERY_MS) save(false);
	}

	/** One tick's movement, into the way the player moved; teleports (over 10 blocks) do not count. */
	private static void moved(Player p, double dx, double dy, double dz) {
		double flat = Math.hypot(dx, dz), full = Math.sqrt(dx * dx + dy * dy + dz * dz);
		if (full > 10 || full < 0.001) return;
		if (p.isPassenger()) ride += full;
		else if (p.isFallFlying()) elytra += full;
		else if (p.getAbilities().flying) fly += full;
		else if (p.isInWater() || p.isSwimming()) swim += full;
		else if (p.isSprinting()) sprint += flat;
		else walk += flat;
	}

	private static Place placeOf(Minecraft mc) {
		String kind, name, address = "";
		var server = mc.getCurrentServer();
		var single = mc.getSingleplayerServer();
		if (single != null) {
			kind = "world";
			name = single.getWorldData().getLevelName();
		} else if (server != null) {
			kind = "server";
			name = server.name;
			address = server.ip;
		} else return null;
		String key = kind + ":" + (kind.equals("server") ? address : name);
		Place place = places.get(key);
		if (place == null) places.put(key, place = new Place(kind, name, address));
		place.visits++;
		return place;
	}

	/** Called just before the local player hits `target`. */
	static void attacked(Entity target) {
		if (!(target instanceof LivingEntity le) || le.isDeadOrDying()) return;
		hit.putIfAbsent(target.getId(), new float[] { le.getHealth() });
		hitAt.put(target.getId(), System.currentTimeMillis());
	}

	/** Something we hit has died (ExtraModules.Stats decides that). */
	static void killed(LivingEntity entity) {
		if (entity instanceof Player) playerKills++;
		else if (entity instanceof Mob) mobKills++;
	}

	public static void mined() {
		blocksMined++;
	}

	public static void placed() {
		blocksPlaced++;
	}

	static void screenshot() {
		screenshots++;
	}

	static void clip() {
		clips++;
	}

	/** After each frame (ClipFrameMixin's spot): frames only count in a world and with the window in front. */
	public static void frame(Minecraft mc) {
		long now = System.nanoTime();
		if (mc.level == null || mc.player == null || !mc.isWindowActive()) {
			lastFrame = 0;
			return;
		}
		if (lastFrame != 0) {
			double ms = (now - lastFrame) / 1e6;
			// a stall of a second or more (loading, a breakpoint, a sleeping laptop) is not a frame
			if (ms > 0 && ms < 1000) {
				frames++;
				frameMsTotal += ms;
				frameTimes[(int) Math.min(frameTimes.length - 1, ms * 2)]++;
			}
		}
		lastFrame = now;
	}

	/** Average FPS and the 1% low (the average of the slowest hundredth of frames). */
	static double[] fps() {
		if (frames == 0 || frameMsTotal <= 0) return new double[] { 0, 0 };
		double avg = frames / (frameMsTotal / 1000);
		long want = Math.max(1, frames / 100), taken = 0;
		double ms = 0;
		for (int i = frameTimes.length - 1; i >= 0 && taken < want; i--) {
			long n = Math.min(frameTimes[i], want - taken);
			ms += n * (i + 0.5) / 2;
			taken += n;
		}
		return new double[] { avg, taken == 0 ? 0 : 1000 / (ms / taken) };
	}

	private static double round1(double v) {
		return Math.round(v * 10) / 10.0;
	}

	/** The summary as the launcher reads it (version 1). */
	static JsonObject json(boolean closed) {
		JsonObject o = new JsonObject();
		o.addProperty("v", 1);
		o.addProperty("startedAt", STARTED);
		o.addProperty("updatedAt", System.currentTimeMillis());
		o.addProperty("closed", closed);
		o.addProperty("playMs", playMs);
		JsonArray list = new JsonArray();
		for (Place p : places.values()) {
			JsonObject x = new JsonObject();
			x.addProperty("kind", p.kind);
			x.addProperty("name", p.name);
			if (!p.address.isEmpty()) x.addProperty("address", p.address);
			x.addProperty("ms", p.ms);
			x.addProperty("visits", p.visits);
			list.add(x);
		}
		o.add("places", list);
		o.addProperty("deaths", deaths);
		JsonObject kills = new JsonObject();
		kills.addProperty("players", playerKills);
		kills.addProperty("mobs", mobKills);
		o.add("kills", kills);
		JsonObject damage = new JsonObject();
		damage.addProperty("dealt", round1(damageDealt));
		damage.addProperty("taken", round1(damageTaken));
		o.add("damage", damage);
		JsonObject blocks = new JsonObject();
		blocks.addProperty("mined", blocksMined);
		blocks.addProperty("placed", blocksPlaced);
		o.add("blocks", blocks);
		JsonObject distance = new JsonObject();
		distance.addProperty("walk", round1(walk));
		distance.addProperty("sprint", round1(sprint));
		distance.addProperty("swim", round1(swim));
		distance.addProperty("fly", round1(fly));
		distance.addProperty("elytra", round1(elytra));
		distance.addProperty("ride", round1(ride));
		o.add("distance", distance);
		o.addProperty("messages", messages);
		o.addProperty("commands", commands);
		o.addProperty("screenshots", screenshots);
		o.addProperty("clips", clips);
		double[] fps = fps();
		JsonObject f = new JsonObject();
		f.addProperty("avg", Math.round(fps[0]));
		f.addProperty("low1", Math.round(fps[1]));
		f.addProperty("frames", frames);
		o.add("fps", f);
		o.addProperty("longestLifeMs", Math.max(longestLifeMs, lifeMs));
		return o;
	}

	static Path file() {
		return FabricLoader.getInstance().getConfigDir().resolve("slashclient-session.json");
	}

	/** Writes the file now; on the way out (closed) on this thread, otherwise on a thread of its own. */
	static void save(boolean closed) {
		lastSave = System.currentTimeMillis();
		String text;
		try {
			text = GSON.toJson(json(closed));
		} catch (RuntimeException e) {
			SlashHud.LOG.warn("SlashClient: session summary: {}", e.toString());
			return;
		}
		if (closed) write(text);
		else Thread.ofVirtual().start(() -> write(text));
	}

	private static synchronized void write(String text) {
		Path file = file(), tmp = file.resolveSibling(file.getFileName() + ".tmp");
		try {
			Files.createDirectories(file.getParent());
			Files.writeString(tmp, text);
			Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (Exception e) {
			try {
				Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
			} catch (Exception again) {
				SlashHud.LOG.warn("SlashClient: could not write the session summary: {}", again.toString());
			}
		}
	}

	/** For the game test: the file written now, as the launcher would read it. */
	public static String saveForTest() {
		write(GSON.toJson(json(false)));
		try {
			return Files.readString(file());
		} catch (Exception e) {
			return "";
		}
	}
}
