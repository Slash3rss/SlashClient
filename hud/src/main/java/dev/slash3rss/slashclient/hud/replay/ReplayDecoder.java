package dev.slash3rss.slashclient.hud.replay;

import com.mojang.blaze3d.platform.NativeImage;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Turns the replay's JPEG frames into pictures on two background threads, only the ones about to
 * be shown: the frame asked for and the next few in the direction of play. What is decoded waits in
 * a small cache (a picture of 1280×720 is 3.5 MB of native memory, at most ~14 are kept); the rest
 * stays compressed. Pictures are handed over and freed on the render thread only.
 */
final class ReplayDecoder implements AutoCloseable {
	/** Frames decoded ahead of the shown one (in steps of the playback's stride). */
	static final int AHEAD = 10;
	private static final AtomicInteger THREADS = new AtomicInteger();

	private final List<Clips.Frame> frames;
	private final ExecutorService pool = Executors.newFixedThreadPool(2, r -> {
		Thread t = new Thread(r, "SlashClient replay " + THREADS.incrementAndGet());
		t.setDaemon(true);
		t.setPriority(Thread.NORM_PRIORITY - 1);
		return t;
	});
	/** Decoded pictures by frame index; written by the workers under the lock, freed by the render thread. */
	private final Map<Integer, NativeImage> ready = new HashMap<>();
	private final Set<Integer> pending = ConcurrentHashMap.newKeySet();
	private volatile int center, stride = 1;
	private volatile boolean closed;
	/** For the test and the cost: frames decoded so far, and the time it took. */
	final AtomicInteger decoded = new AtomicInteger();
	volatile long decodeNanos;

	ReplayDecoder(List<Clips.Frame> frames) {
		this.frames = frames;
	}

	/**
	 * The picture of frame `i` if it is decoded (null: not yet, show the last one), and asks for the
	 * ones playback goes to next: `stride` frames apart (2 at double speed), backwards when negative.
	 * Render thread only.
	 */
	NativeImage get(int i, int stride) {
		this.center = i;
		this.stride = stride == 0 ? 1 : stride;
		want(i);
		for (int k = 1; k <= AHEAD; k++) want(i + k * this.stride);
		// one back for stepping with ←
		want(i - Integer.signum(this.stride));
		NativeImage image;
		synchronized (ready) {
			for (Iterator<Map.Entry<Integer, NativeImage>> it = ready.entrySet().iterator(); it.hasNext(); ) {
				var e = it.next();
				if (!near(e.getKey())) {
					e.getValue().close();
					it.remove();
				}
			}
			image = ready.get(i);
		}
		return image;
	}

	/** True when frame `j` is one the playback needs soon (around the shown one, ahead in its direction). */
	private boolean near(int j) {
		int c = center, s = stride;
		int lo = s > 0 ? c - 2 : c + AHEAD * s - 2;
		int hi = s > 0 ? c + AHEAD * s + 2 : c + 2;
		return j >= lo && j <= hi;
	}

	private void want(int j) {
		if (j < 0 || j >= frames.size() || closed) return;
		synchronized (ready) {
			if (ready.containsKey(j)) return;
		}
		if (!pending.add(j)) return;
		pool.execute(() -> {
			try {
				// scrubbed away while it waited: not needed any more
				if (closed || !near(j)) return;
				long started = System.nanoTime();
				NativeImage image = decode(frames.get(j));
				decodeNanos += System.nanoTime() - started;
				decoded.incrementAndGet();
				synchronized (ready) {
					if (closed || !near(j)) image.close();
					else ready.put(j, image);
				}
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient replay: {}", e.toString());
			} finally {
				pending.remove(j);
			}
		});
	}

	/** A JPEG frame as a picture of its size. */
	static NativeImage decode(Clips.Frame frame) throws java.io.IOException {
		BufferedImage rgb = ImageIO.read(new ByteArrayInputStream(frame.jpeg()));
		int w = Math.min(frame.width(), rgb.getWidth()), h = Math.min(frame.height(), rgb.getHeight());
		NativeImage image = new NativeImage(frame.width(), frame.height(), false);
		try {
			if (rgb.getType() == BufferedImage.TYPE_3BYTE_BGR && rgb.getRaster().getDataBuffer() instanceof DataBufferByte buffer) {
				// the usual case: read the bytes straight, no colour model per pixel
				byte[] bgr = buffer.getData();
				int rowBytes = rgb.getWidth() * 3;
				for (int y = 0; y < h; y++) {
					int at = y * rowBytes;
					for (int x = 0; x < w; x++, at += 3) {
						image.setPixel(x, y, 0xFF000000 | (bgr[at + 2] & 255) << 16 | (bgr[at + 1] & 255) << 8 | bgr[at] & 255);
					}
				}
			} else {
				int[] row = new int[w];
				for (int y = 0; y < h; y++) {
					rgb.getRGB(0, y, w, 1, row, 0, w);
					for (int x = 0; x < w; x++) image.setPixel(x, y, 0xFF000000 | row[x]);
				}
			}
		} catch (RuntimeException e) {
			image.close();
			throw e;
		}
		return image;
	}

	@Override
	public void close() {
		closed = true;
		pool.shutdownNow();
		synchronized (ready) {
			for (NativeImage image : ready.values()) image.close();
			ready.clear();
		}
	}
}
