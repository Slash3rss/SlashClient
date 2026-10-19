package dev.slash3rss.slashclient.hud.ui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Auras and trails as the figure in the menus shows them: the game's own particle pictures drawn
 * flat in the GUI around it (out of a world there is nowhere to make real particles). Each one
 * lives in the figure's space (blocks, the feet at 0, +z where the figure faces) and is laid under
 * the figure or over it by how near it is. Close to what the game shows (CosmeticEffects), not the same.
 */
public final class FigureParticles {
	/** How a kind looks: its pictures (played in turn when `animate`, else one at random), tint, size in blocks. */
	private record Style(String[] frames, int color, float size, boolean animate) {}

	private static final class P {
		float x, y, z, vx, vy, vz, gravity, age, life;
		Style style;
		int frame, color;
		boolean blink;
	}

	/** How fast the figure "runs" on the spot: its trail is left behind at this speed (blocks a second). */
	private static final float RUN_SPEED = 1.3f;
	private static final int MAX = 220;

	private final List<P> live = new ArrayList<>();
	private final Random random = new Random();
	private float auraDue, trailDue, rocketDue, time, dt;
	private long last;

	private static String[] frames(String name, int from, int to) {
		String[] out = new String[Math.abs(to - from) + 1];
		for (int i = 0; i < out.length; i++) out[i] = name + "_" + (from + (to > from ? i : -i));
		return out;
	}

	private static Style style(String frame, int color, float size) {
		return new Style(new String[] {frame}, color, size, false);
	}

	private static final Style GENERIC = new Style(frames("generic", 7, 0), 0xFFFFFFFF, 0.16f, true);

	/** Moves the particles on and makes new ones for what is worn (null for none); once a frame. */
	public void tick(String aura, String trail, boolean running) {
		long now = System.nanoTime();
		float dt = last == 0 ? 0 : Math.min(0.1f, (now - last) / 1e9f);
		last = now;
		this.dt = dt;
		time += dt;
		for (int i = live.size() - 1; i >= 0; i--) {
			P p = live.get(i);
			p.age += dt;
			if (p.age >= p.life) {
				live.remove(i);
				continue;
			}
			p.vy -= p.gravity * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.z += p.vz * dt;
		}
		if (aura != null && !running) {
			auraDue += dt * 14;
			while (auraDue >= 1) {
				auraDue--;
				aura(aura);
			}
		} else auraDue = 0;
		if (trail != null && running) {
			trailDue += dt * 22;
			while (trailDue >= 1) {
				trailDue--;
				trail(trail);
			}
		} else trailDue = 0;
	}

	private static final Style ROCKET_FLAME = style("flame", 0xFFFFFFFF, 0.07f);

	/** The rocket boots' little flames, puffed down from under both heels (once a frame, after `tick`). */
	public void rocket(boolean on) {
		if (!on) {
			rocketDue = 0;
			return;
		}
		rocketDue += dt * 30;
		while (rocketDue >= 1) {
			rocketDue--;
			float side = random.nextBoolean() ? 0.12f : -0.12f;
			add(ROCKET_FLAME, side + spread(0.06f), 0.08f, -0.17f + spread(0.04f), spread(0.1f), -0.45f, -0.1f, 0.3f);
		}
	}

	public void clear() {
		live.clear();
	}

	private float spread(float by) {
		return (random.nextFloat() - 0.5f) * by;
	}

	private P add(Style style, float x, float y, float z, float vx, float vy, float vz, float life) {
		P p = new P();
		p.style = style;
		p.x = x;
		p.y = y;
		p.z = z;
		p.vx = vx;
		p.vy = vy;
		p.vz = vz;
		p.life = life * (0.8f + random.nextFloat() * 0.4f);
		p.color = style.color();
		p.frame = random.nextInt(style.frames().length);
		if (live.size() < MAX) live.add(p);
		return p;
	}

	/** A puff where the feet just were: it stays behind as the figure runs on. */
	private void trail(String kind) {
		float x = spread(0.35f), y = 0.1f + random.nextFloat() * 0.2f, z = -0.2f + spread(0.2f);
		float back = -RUN_SPEED;
		switch (kind) {
			case "hearts" -> add(style("heart", 0xFFFFFFFF, 0.22f), x, y + 0.3f, z, 0, 0.15f, back, 0.9f);
			case "sparks" -> add(style("glow", 0xFFFFF6B0, 0.1f), x, y, z, spread(0.6f), 0.5f, back + spread(0.6f), 0.5f);
			case "snow" -> add(new Style(frames("generic", 3, 0), 0xFFF4FAFF, 0.1f, true), x, y + 0.3f, z, spread(0.2f), -0.25f, back, 1.0f);
			// a note's colour goes round the colour wheel
			case "notes" -> add(style("note", net.minecraft.util.Mth.hsvToRgb((time * 0.5f) % 1f, 0.75f, 1f) | 0xFF000000, 0.2f), x, y + 0.4f, z, 0, 0.3f, back, 0.9f);
			case "flames" -> add(style("flame", 0xFFFFFFFF, 0.14f), x, y, z, 0, 0.2f, back, 0.7f);
			case "clouds" -> add(GENERIC_BIG, x, y, z, spread(0.2f), 0.2f, back, 0.9f);
			case "stars" -> add(new Style(frames("spark", 7, 0), 0xFFFFFFFF, 0.14f, true), x, y + 0.1f, z, spread(0.5f), 0.6f, back + spread(0.4f), 0.9f);
			case "bubbles" -> add(style("bubble", 0xFFFFFFFF, 0.12f), x, y + 0.2f, z, spread(0.2f), 0.4f, back, 0.8f);
			case "emerald" -> add(style("glint", 0xFFFFFFFF, 0.16f), x, y + 0.2f, z, 0, 0.1f, back, 0.9f);
			case "soulfire" -> add(style("soul_fire_flame", 0xFFFFFFFF, 0.14f), x, y, z, 0, 0.2f, back, 0.7f);
			case "crits" -> add(style("critical_hit", 0xFFFFFFFF, 0.14f), x, y + 0.2f, z, spread(1.2f), 0.9f, back + spread(1.0f), 0.6f).gravity = 2.2f;
			case "witch" -> add(new Style(frames("spell", 7, 0), 0xFFA040D8, 0.14f, true), x, y + 0.2f, z, 0, 0.3f, back, 0.9f);
			case "ink" -> add(new Style(frames("generic", 7, 0), 0xFF15151C, 0.2f, true), x, y, z, 0, 0.05f, back, 0.9f);
			case "ash" -> add(new Style(frames("generic", 2, 0), 0xFFCFCFCF, 0.08f, true), x, y + 0.3f, z, spread(0.2f), -0.1f, back, 1.2f);
			default -> add(GENERIC, x, y, z, 0, 0.1f, back, 0.8f);
		}
	}

	private static final Style GENERIC_BIG = new Style(frames("generic", 7, 0), 0xFFFFFFFF, 0.3f, true);

	/** One more in the ring circling the body. */
	private void aura(String kind) {
		double a = time * 1.6 + random.nextDouble() * 1.2;
		float r = 0.7f;
		float x = (float) Math.cos(a) * r, z = (float) Math.sin(a) * r;
		float y = 0.2f + random.nextFloat() * 1.6f;
		switch (kind) {
			// both fly from the ring towards the middle of the body
			case "enchant" -> {
				Style letter = style("sga_" + (char) ('a' + random.nextInt(26)), 0xFFFFFFFF, 0.1f);
				add(letter, x * 1.25f, y + 0.4f, z * 1.25f, -x * 1.25f, (1.2f - y - 0.4f), -z * 1.25f, 1.0f).life = 1.0f;
			}
			case "portal" -> add(new Style(frames("generic", 7, 0), 0xFFB050F0, 0.12f, true), x * 1.25f, y, z * 1.25f, -x * 1.2f, (0.8f - y) * 0.9f, -z * 1.2f, 1.0f);
			case "cherry" -> {
				P p = add(new Style(frames("cherry", 0, 11), 0xFFFFFFFF, 0.14f, false), x, 2.2f, z, spread(0.3f), -0.35f, spread(0.3f), 2.4f);
				p.gravity = 0.05f;
			}
			case "souls" -> add(new Style(frames("soul", 0, 10), 0xFFFFFFFF, 0.22f, true), x, 0.1f + random.nextFloat() * 0.4f, z, 0, 0.45f, 0, 1.4f);
			case "glow" -> add(style("glow", 0xFF45E8C8, 0.12f), x, y, z, 0, 0.25f, 0, 1.4f);
			case "magic" -> add(style("enchanted_hit", 0xFFFFFFFF, 0.14f), x, y, z, 0, 0.6f, 0, 0.8f);
			case "amber" -> add(style("glow", 0xFFFFA82A, 0.12f), x, y, z, 0, 0.5f, 0, 1.0f);
			case "sculk" -> add(new Style(frames("sculk_soul", 0, 10), 0xFFFFFFFF, 0.22f, true), x, 0.1f + random.nextFloat() * 0.4f, z, 0, 0.5f, 0, 1.3f);
			case "spores" -> add(new Style(frames("generic", 2, 0), 0xFF7FB045, 0.08f, true), x * 1.2f, y + 0.3f, z * 1.2f, spread(0.1f), -0.15f, spread(0.1f), 2.0f);
			case "nautilus" -> add(style("nautilus", 0xFFFFFFFF, 0.14f), x * 1.25f, y, z * 1.25f, -x * 1.25f, (1.0f - y), -z * 1.25f, 1.0f).life = 1.0f;
			case "tears" -> add(style("drip_hang", 0xFF8A2BE2, 0.12f), x, 1.9f, z, 0, -0.2f, 0, 1.0f).gravity = 2.5f;
			case "fireflies" -> {
				P p = add(style(exists("firefly") ? "firefly" : "glow", exists("firefly") ? 0xFFFFFFFF : 0xFFF2F25A, 0.1f), x * 1.3f, y, z * 1.3f, spread(0.4f), spread(0.3f), spread(0.4f), 2.4f);
				p.blink = true;
			}
			case "royal" -> {
				int c = random.nextBoolean() ? 0xFF9BE35A : 0xFFF5D84A;
				add(new Style(frames("glitter", 7, 0), c, 0.14f, true), x, y, z, 0, 0.35f, 0, 1.2f);
				if (random.nextInt(3) == 0) add(new Style(frames("glitter", 7, 0), 0xFFFFFFFF, 0.12f, true), -x, y, -z, 0, 0.12f, 0, 1.6f);
			}
			default -> add(GENERIC, x, y, z, 0, 0.3f, 0, 1.0f);
		}
	}

	private static final Map<String, Boolean> EXISTS = new HashMap<>();

	/** Whether the game has this particle picture (a few came with newer versions). */
	private static boolean exists(String name) {
		return EXISTS.computeIfAbsent(name, n -> Minecraft.getInstance().getResourceManager().getResource(texture(n)).isPresent());
	}

	private static Identifier texture(String name) {
		return Identifier.fromNamespaceAndPath("minecraft", "textures/particle/" + name + ".png");
	}

	/**
	 * Draws the particles behind the figure (`front` false) or in front of it, the figure turned by
	 * `yaw` degrees with its feet at (cx, feetY) and `scale` pixels a block.
	 */
	public void draw(GuiGraphicsExtractor g, float cx, float feetY, float scale, float yaw, boolean front) {
		double rad = Math.toRadians(yaw);
		float cos = (float) Math.cos(rad), sin = (float) Math.sin(rad);
		for (P p : live) {
			// turned with the figure: x to the right on screen, depth towards the viewer
			float sx = p.x * cos + p.z * sin;
			float depth = -p.x * sin + p.z * cos;
			if (depth > 0 != front) continue;
			Style s = p.style;
			int n = s.frames().length;
			int frame = s.animate() ? Math.min(n - 1, (int) (p.age / p.life * n)) : p.frame;
			String name = s.frames()[frame];
			if (!exists(name)) name = "generic_0";
			int size = Math.max(2, Math.round(s.size() * scale));
			// fading out near the end; fireflies blink
			float alpha = Math.min(1f, (p.life - p.age) / 0.35f) * Math.min(1f, p.age / 0.1f);
			if (p.blink) alpha *= 0.35f + 0.65f * (float) Math.abs(Math.sin(p.age * 3 + p.life * 7));
			int a = Math.round(alpha * ((p.color >>> 24) & 0xFF));
			if (a <= 4) continue;
			int x = Math.round(cx + sx * scale - size / 2f), y = Math.round(feetY - p.y * scale - size / 2f);
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, texture(name), x, y, 0, 0, size, size, 1, 1, 1, 1, (a << 24) | (p.color & 0xFFFFFF));
		}
	}
}
