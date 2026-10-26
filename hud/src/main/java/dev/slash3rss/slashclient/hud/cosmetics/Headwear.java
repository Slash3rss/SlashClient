package dev.slash3rss.slashclient.hud.cosmetics;

import com.google.gson.JsonObject;

import java.util.List;
import java.util.UUID;

/**
 * The face ("face": glasses, masks, goggles) and ears ("ears": ears and horns) slots: clothing
 * items ({@link Clothing}) on the head with a few rules of their own, the same as the launcher's
 * and the website's (src/shared/headwear.ts): boxes that a worn hat would go through hide, and
 * ears twitch now and then.
 */
public final class Headwear {
	private Headwear() {}

	/** How often ears twitch (seconds), and how long a twitch takes. */
	static final float EVERY = 4.2f, LENGTH = 0.45f;

	/** A box's wiggle: about x or z, up to `amp` radians, `phase` seconds later than the others. */
	record Twitch(boolean axisX, float amp, float phase) {
		static Twitch of(JsonObject o) {
			return new Twitch("x".equals(o.get("axis").getAsString()), (float) Math.toRadians(o.get("amp").getAsFloat()), o.get("phase").getAsFloat());
		}

		/** How far it is turned at `t` seconds: still most of the time, then a quick wiggle that dies down. */
		float angle(float t) {
			float local = (((t + phase) % EVERY) + EVERY) % EVERY;
			if (local >= LENGTH) return 0;
			float k = local / LENGTH;
			return amp * (float) Math.sin(k * Math.PI * 4) * (1 - k);
		}
	}

	/** Whether a box shows with this hat on (null: no hat); a hat not on its list would go through it. */
	static boolean shownWith(List<String> hats, String hat) {
		return hat == null || hats == null || hats.contains(hat);
	}

	/** Every player's ears twitch at their own moments: a shift of the clock by who they are. */
	public static float offset(UUID id) {
		return id == null ? 0 : Math.floorMod(id.hashCode(), 1000) / 1000f * EVERY;
	}
}
