package dev.slash3rss.slashclient.hud.replay;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Writes JPEG frames as an AVI with one Motion-JPEG video stream: a format every player opens
 * (VLC, the Windows and macOS players, browsers through a converter), written without any
 * library. Layout: RIFF AVI ( hdrl ( avih, strl ( strh, strf ) ), movi ( 00dc… ), idx1 ).
 */
final class AviWriter {
	private AviWriter() {}

	static void write(Path file, List<byte[]> frames, int width, int height, double fps) throws IOException {
		int n = frames.size();
		long moviData = 0;
		int biggest = 0;
		for (byte[] f : frames) {
			moviData += 8 + f.length + (f.length & 1);
			biggest = Math.max(biggest, f.length);
		}
		int strl = 4 + (8 + 56) + (8 + 40);
		int hdrl = 4 + (8 + 56) + (8 + strl);
		long movi = 4 + moviData;
		long idx1 = 16L * n;
		long riff = 4 + (8 + hdrl) + (8 + movi) + (8 + idx1);
		if (riff > 0xFFFFFFFFL) throw new IOException("clip too large");
		int rate = (int) Math.round(fps * 1000);

		try (OutputStream out = new BufferedOutputStream(Files.newOutputStream(file), 1 << 16)) {
			ByteBuffer b = ByteBuffer.allocate(8 + 4 + 8 + hdrl + 12).order(ByteOrder.LITTLE_ENDIAN);
			fourcc(b, "RIFF").putInt((int) riff);
			fourcc(b, "AVI ");
			fourcc(b, "LIST").putInt(hdrl);
			fourcc(b, "hdrl");
			fourcc(b, "avih").putInt(56);
			b.putInt((int) Math.round(1_000_000 / fps)); // microseconds per frame
			b.putInt((int) Math.min(Integer.MAX_VALUE, (long) biggest * Math.round(fps)));
			b.putInt(0);
			b.putInt(0x10); // has an index
			b.putInt(n);
			b.putInt(0);
			b.putInt(1); // streams
			b.putInt(biggest);
			b.putInt(width).putInt(height);
			b.putInt(0).putInt(0).putInt(0).putInt(0);
			fourcc(b, "LIST").putInt(strl);
			fourcc(b, "strl");
			fourcc(b, "strh").putInt(56);
			fourcc(b, "vids");
			fourcc(b, "MJPG");
			b.putInt(0); // flags
			b.putShort((short) 0).putShort((short) 0); // priority, language
			b.putInt(0); // initial frames
			b.putInt(1000).putInt(rate); // scale, rate: rate / scale = frames per second
			b.putInt(0).putInt(n); // start, length
			b.putInt(biggest);
			b.putInt(-1); // quality
			b.putInt(0); // sample size
			b.putShort((short) 0).putShort((short) 0).putShort((short) width).putShort((short) height);
			fourcc(b, "strf").putInt(40);
			b.putInt(40).putInt(width).putInt(height);
			b.putShort((short) 1).putShort((short) 24);
			fourcc(b, "MJPG");
			b.putInt(width * height * 3);
			b.putInt(0).putInt(0).putInt(0).putInt(0);
			fourcc(b, "LIST").putInt((int) movi);
			fourcc(b, "movi");
			out.write(b.array(), 0, b.position());

			ByteBuffer head = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
			for (byte[] f : frames) {
				head.clear();
				fourcc(head, "00dc").putInt(f.length);
				out.write(head.array());
				out.write(f);
				if ((f.length & 1) == 1) out.write(0);
			}

			ByteBuffer idx = ByteBuffer.allocate(8 + 16 * n).order(ByteOrder.LITTLE_ENDIAN);
			fourcc(idx, "idx1").putInt(16 * n);
			int offset = 4; // from the "movi" name
			for (byte[] f : frames) {
				fourcc(idx, "00dc").putInt(0x10).putInt(offset).putInt(f.length);
				offset += 8 + f.length + (f.length & 1);
			}
			out.write(idx.array());
		}
	}

	private static ByteBuffer fourcc(ByteBuffer b, String code) {
		return b.put(code.getBytes(StandardCharsets.US_ASCII));
	}
}
