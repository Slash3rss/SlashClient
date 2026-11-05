package dev.slash3rss.slashclient.hud.map;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * The full map kept on disk, so it is there again the next time the player joins the same server or world: a folder
 * per world (WaypointKeys.terrainKey) under .minecraft/slashclient/maps, a file per layer (each dimension, its caves
 * apart) with the chunks as drawn, their biomes and, for a dimension, the trail walked. Read in the background when
 * the world is joined (what is seen meanwhile stays newer), written in the background every few minutes, when the
 * player leaves the world and when the game closes. A file that cannot be read is put aside (".bad"), never deleted.
 */
public final class MapStore {
	private MapStore() {}

	private static final Path DIR = FabricLoader.getInstance().getGameDir().resolve("slashclient").resolve("maps");
	private static final int MAGIC = 0x53434D31, VERSION = 1;
	/** Written every this many ticks while something changed (5 minutes). */
	private static final int EVERY = 6000;
	private static final ExecutorService IO = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "SlashClient map store");
		t.setDaemon(true);
		return t;
	});

	/** A layer as read from its file: chunks with the file's own biome numbers, its biome ids and its trail. */
	private record Loaded(LinkedHashMap<Long, MinimapTerrain.Chunk> chunks, List<String> biomes, List<int[]> trail) {}

	/** A layer to write, copied on the game's thread. */
	private record Snapshot(String layer, List<Map.Entry<Long, MinimapTerrain.Chunk>> chunks, List<String> biomes, List<int[]> trail) {}

	private static final Set<String> dirty = new HashSet<>();
	private static String world = "";
	private static CompletableFuture<Map<String, Loaded>> loading;
	private static int ticks;

	private static boolean on() {
		return SlashHud.config == null || SlashHud.config.mapSave;
	}

	/** A layer (or a dimension's trail) changed: written with the next save. */
	static void changed(String layer) {
		dirty.add(layer);
	}

	/** A world joined: its map read from disk in the background. */
	static void enter(String key) {
		world = key;
		dirty.clear();
		loading = null;
		if (!on() || key.isEmpty()) return;
		Path folder = folder(key);
		loading = CompletableFuture.supplyAsync(() -> load(folder), IO);
	}

	/** The world left: what changed written (after what was being read is merged, so nothing is lost). */
	static void leave(String key) {
		if (key.isEmpty() || !key.equals(world)) return;
		finishLoading(true);
		save(false);
	}

	/**
	 * Each tick: what was read merged in once it is there, and a save now and then; out of a world (in the menus,
	 * after leaving one) what changed is written at once, in the background (not while leaving: that waits for the server).
	 */
	public static void tick(Minecraft mc) {
		if (mc.level == null) {
			save(false);
			return;
		}
		finishLoading(false);
		if (++ticks % EVERY == 0) save(false);
	}

	/** Leaving a server or closing the game: written now, waiting for it. */
	public static void flush() {
		finishLoading(true);
		save(true);
	}

	private static void finishLoading(boolean wait) {
		if (loading == null || !wait && !loading.isDone()) return;
		Map<String, Loaded> read;
		try {
			read = loading.join();
		} catch (RuntimeException e) {
			read = Map.of();
		}
		loading = null;
		for (var e : read.entrySet()) {
			Loaded l = e.getValue();
			// the file's biome numbers to this world's
			short[] to = new short[l.biomes().size() + 1];
			for (int i = 0; i < l.biomes().size(); i++) to[i + 1] = MapBiomes.number(l.biomes().get(i));
			for (MinimapTerrain.Chunk c : l.chunks().values()) {
				short[] b = c.biomes();
				for (int i = 0; i < b.length; i++) b[i] = b[i] > 0 && b[i] < to.length ? to[b[i]] : 0;
			}
			if (!l.chunks().isEmpty()) MinimapTerrain.merge(e.getKey(), l.chunks());
		}
	}

	private static void save(boolean wait) {
		// never over a file whose chunks are not merged in yet: they would be lost
		if (!on() || world.isEmpty() || dirty.isEmpty() || loading != null) return;
		List<String> biomes = MapBiomes.ids();
		List<Snapshot> out = new ArrayList<>();
		for (String layer : dirty) {
			var chunks = MinimapTerrain.explored.get(layer);
			List<Map.Entry<Long, MinimapTerrain.Chunk>> copy = new ArrayList<>();
			if (chunks != null) for (var e : chunks.entrySet()) copy.add(Map.entry(e.getKey(), new MinimapTerrain.Chunk(e.getValue().cols().clone(), e.getValue().biomes().clone())));
			// the trail is only the last few minutes, so it is no longer kept: an empty one, still read by older mods
			out.add(new Snapshot(layer, copy, biomes, List.of()));
		}
		dirty.clear();
		Path folder = folder(world);
		String key = world;
		var job = CompletableFuture.runAsync(() -> write(folder, key, out), IO);
		if (wait) job.join();
	}

	/** The world's folder: its key made safe for a file name, and a hash so two keys never share one. */
	static Path folder(String key) {
		String safe = key.replaceAll("[^A-Za-z0-9._-]", "_");
		if (safe.length() > 60) safe = safe.substring(0, 60);
		return DIR.resolve(safe + "-" + Integer.toHexString(key.hashCode()));
	}

	private static String file(String layer) {
		return layer.replaceAll("[^A-Za-z0-9._-]", "_") + ".scmap";
	}

	private static void write(Path folder, String key, List<Snapshot> layers) {
		try {
			Files.createDirectories(folder);
			Files.writeString(folder.resolve("world.txt"), key);
			for (Snapshot s : layers) {
				Path target = folder.resolve(file(s.layer())), tmp = folder.resolve(file(s.layer()) + ".tmp");
				try (DataOutputStream out = new DataOutputStream(new GZIPOutputStream(new BufferedOutputStream(Files.newOutputStream(tmp))))) {
					out.writeInt(MAGIC);
					out.writeInt(VERSION);
					out.writeUTF(s.layer());
					out.writeInt(s.biomes().size());
					for (String b : s.biomes()) out.writeUTF(b);
					out.writeInt(s.chunks().size());
					for (var e : s.chunks()) {
						out.writeLong(e.getKey());
						for (int c : e.getValue().cols()) out.writeInt(c);
						for (short b : e.getValue().biomes()) out.writeShort(b);
					}
					out.writeInt(s.trail().size());
					for (int[] p : s.trail()) {
						out.writeInt(p[0]);
						out.writeInt(p[1]);
					}
				}
				Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			}
		} catch (IOException | RuntimeException e) {
			SlashHud.LOG.warn("SlashClient: could not save the map", e);
		}
	}

	private static Map<String, Loaded> load(Path folder) {
		Map<String, Loaded> out = new HashMap<>();
		if (!Files.isDirectory(folder)) return out;
		try (var files = Files.list(folder)) {
			for (Path f : files.filter(p -> p.toString().endsWith(".scmap")).toList()) {
				try (DataInputStream in = new DataInputStream(new GZIPInputStream(new BufferedInputStream(Files.newInputStream(f))))) {
					if (in.readInt() != MAGIC || in.readInt() != VERSION) throw new IOException("not a map file");
					String layer = in.readUTF();
					int nb = in.readInt();
					List<String> biomes = new ArrayList<>();
					for (int i = 0; i < nb; i++) biomes.add(in.readUTF());
					int n = Math.min(in.readInt(), MinimapTerrain.EXPLORED);
					LinkedHashMap<Long, MinimapTerrain.Chunk> chunks = new LinkedHashMap<>();
					for (int i = 0; i < n; i++) {
						long k = in.readLong();
						int[] cols = new int[256];
						for (int j = 0; j < 256; j++) cols[j] = in.readInt();
						short[] b = new short[16];
						for (int j = 0; j < 16; j++) b[j] = in.readShort();
						chunks.put(k, new MinimapTerrain.Chunk(cols, b));
					}
					int nt = Math.min(in.readInt(), 4000);
					List<int[]> trail = new ArrayList<>();
					for (int i = 0; i < nt; i++) trail.add(new int[] { in.readInt(), in.readInt() });
					out.put(layer, new Loaded(chunks, biomes, trail));
				} catch (IOException | RuntimeException e) {
					SlashHud.LOG.warn("SlashClient: could not read the map file " + f + ", put aside", e);
					try {
						Files.move(f, f.resolveSibling(f.getFileName() + ".bad"), StandardCopyOption.REPLACE_EXISTING);
					} catch (IOException ignored) {}
				}
			}
		} catch (IOException e) {
			SlashHud.LOG.warn("SlashClient: could not read the map", e);
		}
		return out;
	}

	/** For the test: the world's map forgotten in memory and read again from disk (waiting for it). */
	public static void reloadForTest() {
		flush();
		String key = world;
		MinimapTerrain.explored.clear();
		MinimapTerrain.merge(MinimapTerrain.layer(Minecraft.getInstance()), new LinkedHashMap<>());
		enter(key);
		finishLoading(true);
	}

	/** For the test: the folder the world's map is in. */
	public static Path folderForTest() {
		return folder(world);
	}
}
