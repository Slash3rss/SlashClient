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
 * The menu figure's ground: the ring it wears lying under its feet (the picture laid flat and seen
 * a little from above: squashed, turning), and a short looping show of its movement effect (the figure
 * hops for a jump or a landing, runs for footprints, sparks and petals, shoots a streak, blows bubbles),
 * drawn flat in the GUI like FigureParticles (the game's own particle pictures; close to what the game
 * shows in MoveEffects, not the same). Units are blocks in the figure's space: the feet at 0, +z where it faces.
 */
public final class FigureMoves {
	private static final class P {
		float x, y, z, vx, vy, vz, gravity, drag, age, life, size;
		String[] frames;
		int color;
		/** Lying on the ground (a footprint, a shockwave): drawn squashed like the ring. */
		boolean flat;
	}

	/** How flat the ground looks from the figure's view (the ring's height to its width). */
	static final float SQUASH = 0.3f;
	private static final float RUN_SPEED = 1.3f;
	private static final int MAX = 200;

	private final List<P> live = new ArrayList<>();
	private final Random random = new Random();
	private float time, due, cycle;
	private long last;
	private boolean left;
	/** How high the figure is off the ground now (blocks): its hop. */
	private float lift;

	/** The effects the figure runs on the spot for (the rest it stands or hops for). */
	public static boolean runs(String kind) {
		return "move_steps".equals(kind) || "move_sprint".equals(kind) || "move_petals".equals(kind);
	}

	/** How high the figure is off the ground now, in blocks. */
	public float lift() {
		return lift;
	}

	/** Moves the show on (`kind` null: nothing, the figure stands); once a frame. */
	public void tick(String kind) {
		long now = System.nanoTime();
		float dt = last == 0 ? 0 : Math.min(0.1f, (now - last) / 1e9f);
		last = now;
		time += dt;
		for (int i = live.size() - 1; i >= 0; i--) {
			P p = live.get(i);
			p.age += dt;
			if (p.age >= p.life) {
				live.remove(i);
				continue;
			}
			float slow = Math.max(0, 1 - p.drag * dt);
			p.vx *= slow;
			p.vz *= slow;
			p.vy = p.vy * slow - p.gravity * dt;
			p.x += p.vx * dt;
			p.y = Math.max(p.flat ? 0.02f : -0.05f, p.y + p.vy * dt);
			p.z += p.vz * dt;
		}
		lift = 0;
		if (kind == null) {
			cycle = 0;
			return;
		}
		float before = cycle;
		cycle += dt;
		switch (kind) {
			case "move_steps" -> every(dt, 3.3f, () -> {
				left = !left;
				float x = left ? 0.13f : -0.13f;
				// a heel and the toes, left behind as the figure runs on
				flat(x, -0.06f, 0xFF9FE4FF, 0.16f, 1.4f);
				flat(x + 0.02f, 0.12f, 0xFFD8F6FF, 0.13f, 1.4f);
			});
			case "move_sprint" -> every(dt, 18, () -> {
				P p = add(frames("spark", 7, 0), 0xFFFFF6B0, 0.1f, spread(0.3f), 0.1f, -0.25f + spread(0.2f), spread(0.5f), 0.9f, -RUN_SPEED * 1.4f + spread(0.4f), 0.5f);
				p.gravity = 2.4f;
			});
			case "move_petals" -> every(dt, 7, () -> {
				P p = add(frames("cherry", random.nextInt(12), random.nextInt(12)), 0xFFFFFFFF, 0.13f, spread(0.4f), 0.3f + random.nextFloat() * 0.3f, -0.1f + spread(0.3f), spread(0.2f), -0.1f, -RUN_SPEED, 1.6f);
				p.gravity = 0.15f;
			});
			case "move_jump" -> {
				float period = 1.7f, hop = 0.55f;
				float t = cycle % period;
				if (t < hop) lift = 4 * 0.45f * (t / hop) * (1 - t / hop);
				if (crossed(before, cycle, period, 0)) {
					for (int i = 0; i < 12; i++) {
						double a = Math.PI * 2 * i / 12;
						P p = add(frames("generic", 7, 0), 0xFFF4F4F4, 0.13f, (float) Math.cos(a) * 0.3f, 0.05f, (float) Math.sin(a) * 0.3f,
							(float) Math.cos(a) * 1.4f, 0, (float) Math.sin(a) * 1.4f, 0.6f);
						p.drag = 3;
						p.flat = true;
					}
				}
			}
			case "move_landing" -> {
				float period = 2.4f, hop = 0.85f;
				float t = cycle % period;
				if (t < hop) lift = 4 * 1.1f * (t / hop) * (1 - t / hop);
				if (crossed(before, cycle, period, hop)) {
					// the shockwave over the ground, and a burst of sparks; another, smaller, a moment later
					for (int i = 0; i < 28; i++) {
						double a = Math.PI * 2 * i / 28;
						P p = add(frames("generic", 7, 0), 0xFFFFFFFF, 0.16f, (float) Math.cos(a) * 0.3f, 0.03f, (float) Math.sin(a) * 0.3f,
							(float) Math.cos(a) * 2.6f, 0, (float) Math.sin(a) * 2.6f, 0.7f);
						p.drag = 2.2f;
						p.flat = true;
					}
					sparkle(14, 1.4f);
				}
				if (crossed(before, cycle, period, hop + 0.2f)) sparkle(9, 1f);
			}
			case "move_arrows" -> {
				// a shot every so often: the streak flies off to the side, ahead of the figure
				float period = 1.5f;
				float t = cycle % period;
				if (t < 0.45f) every(dt, 70, () -> {
					float k = t / 0.45f;
					float x = -0.35f - k * 2.6f, y = 1.35f + k * 0.5f - k * k * 0.5f, z = 0.25f + k * 1.4f;
					add(new String[] {"glow"}, random.nextBoolean() ? 0xFFFFE27A : 0xFFFFFFFF, 0.08f, x, y, z, 0, 0, 0, 0.45f);
				});
			}
			case "move_bubbles" -> {
				float period = 2.2f;
				if (crossed(before, cycle, period, 0)) for (int i = 0; i < 18; i++) bubble(0.1f + random.nextFloat() * 0.9f);
				every(dt, 4, () -> bubble(0.3f + random.nextFloat() * 1.2f));
			}
			default -> {}
		}
	}

	private void every(float dt, float perSecond, Runnable make) {
		due += dt * perSecond;
		while (due >= 1) {
			due--;
			make.run();
		}
	}

	/** Whether the show's clock went past `at` (seconds into each `period`) this frame. */
	private static boolean crossed(float before, float now, float period, float at) {
		return Math.floor((before - at) / period) != Math.floor((now - at) / period) && now >= at;
	}

	private void sparkle(int n, float v) {
		for (int i = 0; i < n; i++) {
			double a = random.nextDouble() * Math.PI * 2;
			P p = add(frames("spark", 7, 0), 0xFFFFFFFF, 0.14f, 0, 0.15f, 0, (float) Math.cos(a) * v * 0.7f, 1.2f + random.nextFloat() * v, (float) Math.sin(a) * v * 0.7f, 0.9f);
			p.gravity = 2.5f;
		}
	}

	private void bubble(float y) {
		P p = add(new String[] {"bubble"}, 0xFFFFFFFF, 0.11f, spread(0.8f), y, spread(0.6f), spread(0.15f), 0.5f + random.nextFloat() * 0.4f, spread(0.15f), 1.2f);
		p.drag = 0.5f;
	}

	private void flat(float x, float z, int color, float size, float life) {
		P p = add(new String[] {"generic_6"}, color, size, x, 0.02f, z, 0, 0, -RUN_SPEED, life);
		p.flat = true;
	}

	private P add(String[] frames, int color, float size, float x, float y, float z, float vx, float vy, float vz, float life) {
		P p = new P();
		p.frames = frames;
		p.color = color;
		p.size = size;
		p.x = x;
		p.y = y;
		p.z = z;
		p.vx = vx;
		p.vy = vy;
		p.vz = vz;
		p.life = life * (0.85f + random.nextFloat() * 0.3f);
		if (live.size() < MAX) live.add(p);
		return p;
	}

	private float spread(float by) {
		return (random.nextFloat() - 0.5f) * by;
	}

	private static String[] frames(String name, int from, int to) {
		String[] out = new String[Math.abs(to - from) + 1];
		for (int i = 0; i < out.length; i++) out[i] = name + "_" + (from + (to > from ? i : -i));
		return out;
	}

	public void clear() {
		live.clear();
		cycle = 0;
		lift = 0;
	}

	private static final Map<String, Boolean> EXISTS = new HashMap<>();

	private static boolean exists(String name) {
		return EXISTS.computeIfAbsent(name, n -> Minecraft.getInstance().getResourceManager().getResource(particle(n)).isPresent());
	}

	private static Identifier particle(String name) {
		return Identifier.fromNamespaceAndPath("minecraft", "textures/particle/" + name + ".png");
	}

	/**
	 * The ring under the feet at (cx, feetY), `scale` pixels a block, the figure turned by `yaw`
	 * degrees (the ring turns on in the world's sense whatever way the figure faces).
	 */
	public static void drawRing(GuiGraphicsExtractor g, String ring, float cx, float feetY, float scale, float yaw) {
		if (ring == null) return;
		float r = dev.slash3rss.slashclient.hud.RingEffects.SIZE * dev.slash3rss.slashclient.hud.RingEffects.pulse() * scale / 2;
		g.pose().pushMatrix();
		g.pose().translate(cx, feetY);
		g.pose().scale(r / 32f, r / 32f * SQUASH);
		g.pose().rotate((float) Math.toRadians(dev.slash3rss.slashclient.hud.RingEffects.spin() + yaw));
		// the picture's left square (64×64 of 128×64)
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, dev.slash3rss.slashclient.hud.RingEffects.texture(ring), -32, -32, 0, 0, 64, 64, 64, 64, 128, 64, 0xFFFFFFFF);
		g.pose().popMatrix();
	}

	/** Draws the show's particles behind the figure (`front` false) or in front of it, as FigureParticles.draw. */
	public void draw(GuiGraphicsExtractor g, float cx, float feetY, float scale, float yaw, boolean front) {
		double rad = Math.toRadians(yaw);
		float cos = (float) Math.cos(rad), sin = (float) Math.sin(rad);
		for (P p : live) {
			float sx = p.x * cos + p.z * sin;
			float depth = -p.x * sin + p.z * cos;
			if (depth > 0 != front) continue;
			int n = p.frames.length;
			String name = p.frames[Math.min(n - 1, (int) (p.age / p.life * n))];
			if (!exists(name)) name = "generic_0";
			int size = Math.max(2, Math.round(p.size * scale));
			float alpha = Math.min(1f, (p.life - p.age) / 0.35f) * Math.min(1f, p.age / 0.08f);
			int a = Math.round(alpha * ((p.color >>> 24) & 0xFF));
			if (a <= 4) continue;
			int color = (a << 24) | (p.color & 0xFFFFFF);
			// on the ground it moves up and down the screen by its depth, as the ring's far side does
			float y = feetY - p.y * scale - (p.flat ? -depth * scale * SQUASH : 0);
			int x = Math.round(cx + sx * scale - size / 2f);
			if (p.flat) {
				g.pose().pushMatrix();
				g.pose().translate(x + size / 2f, y);
				g.pose().scale(1, SQUASH);
				g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, particle(name), -size / 2, -size / 2, 0, 0, size, size, 1, 1, 1, 1, color);
				g.pose().popMatrix();
			} else {
				g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, particle(name), x, Math.round(y - size / 2f), 0, 0, size, size, 1, 1, 1, 1, color);
			}
		}
	}
}
