package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.audio.SoundBuffer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.AbstractSoundInstance;
import net.minecraft.client.resources.sounds.Sound;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.client.sounds.SoundManager;
import net.minecraft.client.sounds.WeighedSoundEvents;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.valueproviders.ConstantFloat;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

/**
 * The player's own sounds: .ogg, .mp3 and .wav files put in config/slashclient-hud/sounds, picked like any other
 * notice sound ("file:<name>"). Each is decoded once (on the first play, off the game's thread) and handed to the
 * game's sound engine under a name of ours (SoundBufferMixin), so the game's volume sliders work on it as on the rest.
 * Only for this player: nothing is sent anywhere.
 */
public final class SoundFiles {
	private SoundFiles() {}

	/** What a picked file is stored as in the settings: this, then its file name. */
	public static final String PREFIX = "file:";
	/** Bigger files are not offered: a notice is a short sound, not a song. */
	public static final long MAX_BYTES = 1024 * 1024;
	/** And what plays is cut after this long, whatever the file holds. */
	private static final int MAX_SECONDS = 30;
	private static final String[] EXTENSIONS = { ".ogg", ".mp3", ".wav" };

	/** The game's name of a file's sound → the file's name. */
	private static final Map<String, String> IDS = new ConcurrentHashMap<>();
	/** A file's decoded sound, with the size and time of the file it came from (a changed file is decoded again). */
	private record Decoded(long size, long modified, CompletableFuture<SoundBuffer> buffer) {}
	private static final Map<String, Decoded> DECODED = new ConcurrentHashMap<>();

	public static Path folder() {
		return FabricLoader.getInstance().getConfigDir().resolve("slashclient-hud").resolve("sounds");
	}

	/** The folder, made if needed (for the "open the folder" button). */
	public static Path folderMade() {
		Path dir = folder();
		try {
			Files.createDirectories(dir);
		} catch (IOException ignored) {
			// opening it will say what is wrong
		}
		return dir;
	}

	/** The files offered now, as settings values ("file:dzwonek.mp3"), by name. */
	public static List<String> offered() {
		List<String> out = new ArrayList<>();
		Path dir = folder();
		if (!Files.isDirectory(dir)) return out;
		try (Stream<Path> files = Files.list(dir)) {
			files.filter(SoundFiles::usable).map(p -> PREFIX + p.getFileName()).sorted(String.CASE_INSENSITIVE_ORDER).forEach(out::add);
		} catch (IOException ignored) {
			// an unreadable folder offers nothing
		}
		return out;
	}

	private static boolean usable(Path p) {
		String name = p.getFileName().toString().toLowerCase(Locale.ROOT);
		boolean known = false;
		for (String e : EXTENSIONS) known |= name.endsWith(e);
		try {
			return known && Files.isRegularFile(p) && Files.size(p) <= MAX_BYTES;
		} catch (IOException e) {
			return false;
		}
	}

	/** A settings value's name as shown: the file's name without its extension. */
	public static String label(String value) {
		String name = value.substring(PREFIX.length());
		int dot = name.lastIndexOf('.');
		return dot > 0 ? name.substring(0, dot) : name;
	}

	/**
	 * Plays a picked file at `volume` (0–1, already with the all-sounds slider); false when the file is gone, too big or
	 * not something we read, so the caller rings its usual sound instead.
	 */
	public static boolean play(String value, float pitch, float volume) {
		if (!value.startsWith(PREFIX)) return false;
		String name = value.substring(PREFIX.length());
		// only a plain name inside the folder, never a path out of it
		if (name.isEmpty() || name.contains("/") || name.contains("\\") || name.contains("..")) return false;
		Path file = folder().resolve(name);
		if (!usable(file)) return false;
		String id = Integer.toHexString(name.toLowerCase(Locale.ROOT).hashCode()) + Integer.toHexString(name.length());
		IDS.put(id, name);
		Minecraft.getInstance().getSoundManager().play(new FileSound(Identifier.fromNamespaceAndPath(SlashHud.ID, "custom/" + id), pitch, volume));
		return true;
	}

	/** For SoundBufferMixin: the sound of one of our files, or null when `path` is not one ("sounds/custom/<id>.ogg"). */
	public static CompletableFuture<SoundBuffer> buffer(Identifier path) {
		if (!SlashHud.ID.equals(path.getNamespace()) || !path.getPath().startsWith("sounds/custom/")) return null;
		String id = path.getPath().substring("sounds/custom/".length()).replace(".ogg", "");
		String name = IDS.get(id);
		engineAsked++;
		if (name == null) return CompletableFuture.failedFuture(new IOException("unknown sound " + id));
		Path file = folder().resolve(name);
		long size, modified;
		try {
			size = Files.size(file);
			modified = Files.getLastModifiedTime(file).toMillis();
		} catch (IOException e) {
			return CompletableFuture.failedFuture(e);
		}
		Decoded d = DECODED.get(name);
		if (d != null && d.size() == size && d.modified() == modified && !d.buffer().isCompletedExceptionally()) return d.buffer();
		if (d != null) d.buffer().thenAccept(SoundBuffer::discardAlBuffer);
		CompletableFuture<SoundBuffer> decoding = CompletableFuture.supplyAsync(() -> {
			try {
				return decode(file);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: cannot play the sound file {}: {}", name, e.toString());
				throw new java.util.concurrent.CompletionException(e);
			}
		});
		DECODED.put(name, new Decoded(size, modified, decoding));
		return decoding;
	}

	/** The game's sound engine started again (another device): our sounds are uploaded to it anew. */
	public static void clear() {
		for (Decoded d : DECODED.values()) d.buffer().thenAccept(SoundBuffer::discardAlBuffer);
		DECODED.clear();
	}

	// ---------- reading the files ----------

	/** How many times the game's sound engine asked for one of our files (for the in-game test). */
	public static volatile int engineAsked;

	/** How many bytes of sound the last file decoded to (for the in-game test). */
	public static volatile int lastDecodedBytes = -1;

	/** A file's sound as the engine plays it (also for the in-game test). */
	public static SoundBuffer decode(Path file) throws Exception {
		String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
		try (InputStream in = new BufferedInputStream(Files.newInputStream(file))) {
			if (name.endsWith(".ogg")) return ogg(in);
			if (name.endsWith(".mp3")) return mp3(in);
			return wav(in);
		}
	}

	/** Through the game's own reader of its sounds. */
	private static SoundBuffer ogg(InputStream in) throws IOException {
		//#if MC >= 1.20.5
		try (var stream = new net.minecraft.client.sounds.JOrbisAudioStream(in)) {
			return cut(stream.readAll(), stream.getFormat());
		}
		//#endif
		//#if MC < 1.20.5
		//$ try (var stream = new com.mojang.blaze3d.audio.OggAudioStream(in)) {
		//$ 	return cut(stream.readAll(), stream.getFormat());
		//$ }
		//#endif
	}

	/** Java's own reader, turned into 16-bit sound the engine plays (at most two channels). */
	private static SoundBuffer wav(InputStream in) throws Exception {
		try (AudioInputStream source = AudioSystem.getAudioInputStream(in)) {
			AudioFormat from = source.getFormat();
			AudioFormat to = new AudioFormat(AudioFormat.Encoding.PCM_SIGNED, from.getSampleRate(), 16, Math.min(2, from.getChannels()),
				Math.min(2, from.getChannels()) * 2, from.getSampleRate(), false);
			try (AudioInputStream pcm = AudioSystem.getAudioInputStream(to, source)) {
				int most = (int) (to.getSampleRate() * to.getFrameSize() * MAX_SECONDS);
				byte[] bytes = pcm.readNBytes(most);
				lastDecodedBytes = bytes.length;
				return new SoundBuffer(direct(bytes, bytes.length), to);
			}
		}
	}

	/** JLayer's decoder, frame by frame, until the end or MAX_SECONDS. */
	private static SoundBuffer mp3(InputStream in) throws Exception {
		javazoom.jl.decoder.Bitstream bits = new javazoom.jl.decoder.Bitstream(in);
		javazoom.jl.decoder.Decoder decoder = new javazoom.jl.decoder.Decoder();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		int rate = 0, channels = 0;
		try {
			javazoom.jl.decoder.Header header;
			while ((header = bits.readFrame()) != null) {
				javazoom.jl.decoder.SampleBuffer samples = (javazoom.jl.decoder.SampleBuffer) decoder.decodeFrame(header, bits);
				rate = samples.getSampleFrequency();
				channels = samples.getChannelCount();
				short[] pcm = samples.getBuffer();
				for (int i = 0; i < samples.getBufferLength(); i++) {
					out.write(pcm[i] & 0xFF);
					out.write((pcm[i] >> 8) & 0xFF);
				}
				bits.closeFrame();
				if (rate > 0 && out.size() >= rate * channels * 2L * MAX_SECONDS) break;
			}
		} finally {
			bits.close();
		}
		if (rate == 0 || channels == 0) throw new IOException("no sound in the MP3 file");
		AudioFormat format = new AudioFormat(rate, 16, channels, true, false);
		byte[] bytes = out.toByteArray();
		lastDecodedBytes = bytes.length;
		return new SoundBuffer(direct(bytes, bytes.length), format);
	}

	/** The engine's sound, at most MAX_SECONDS of it. */
	private static SoundBuffer cut(ByteBuffer all, AudioFormat format) {
		int most = (int) (format.getSampleRate() * format.getFrameSize() * MAX_SECONDS);
		if (all.remaining() > most) all.limit(all.position() + most - most % format.getFrameSize());
		lastDecodedBytes = all.remaining();
		return new SoundBuffer(all, format);
	}

	private static ByteBuffer direct(byte[] bytes, int length) {
		ByteBuffer buffer = ByteBuffer.allocateDirect(length).order(ByteOrder.nativeOrder());
		buffer.put(bytes, 0, length).flip();
		return buffer;
	}

	// ---------- the sound as the game plays it ----------

	/** One play of a file: like the game's interface sounds (heard the same everywhere, under the "Interface" slider). */
	private static final class FileSound extends AbstractSoundInstance {
		private final Identifier id;

		FileSound(Identifier id, float pitch, float volume) {
			//#if MC >= 1.21.6
			super(id, SoundSource.UI, SoundInstance.createUnseededRandom());
			//#endif
			//#if MC < 1.21.6
			//$ super(id, SoundSource.MASTER, SoundInstance.createUnseededRandom());
			//#endif
			this.id = id;
			this.volume = volume;
			this.pitch = pitch;
			this.relative = true;
			this.attenuation = SoundInstance.Attenuation.NONE;
		}

		/** Our own sound, not one the game knows from its sounds.json. */
		private Sound own() {
			//#if MC >= 1.21
			return new Sound(id, ConstantFloat.of(1f), ConstantFloat.of(1f), 1, Sound.Type.FILE, false, false, 16);
			//#endif
			//#if MC < 1.21
			//$ return new Sound(id.toString(), ConstantFloat.of(1f), ConstantFloat.of(1f), 1, Sound.Type.FILE, false, false, 16);
			//#endif
		}

		//#if MC >= 26.3
		@Override
		public WeighedSoundEvents getOrResolve(SoundManager manager) {
			if (soundEvent == null) {
				soundEvent = new WeighedSoundEvents(id, null);
				sound = own();
			}
			return soundEvent;
		}
		//#endif
		//#if MC < 26.3
		//$ @Override
		//$ public WeighedSoundEvents resolve(SoundManager manager) {
		//$ 	sound = own();
		//$ 	return new WeighedSoundEvents(id, null);
		//$ }
		//#endif
	}
}
