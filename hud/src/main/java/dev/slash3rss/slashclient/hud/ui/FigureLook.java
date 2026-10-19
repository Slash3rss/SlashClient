package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.Cosmetics;

import java.util.Map;
import java.util.UUID;

/**
 * What the menu figure ({@link SkinPreview}) does besides looking at the mouse, set by the screen
 * that shows it: turned (to show its back), running on the spot (to show a trail), wearing a set
 * of the screen's (the cosmetics menu's, with the item under the mouse tried on).
 */
public final class FigureLook {
	/** The whole figure's extra turn in degrees (180: its back; the figure eases towards it). */
	public float turn;
	/** Running on the spot: the limbs swing and a trail is left behind. */
	public boolean running;
	/** What it wears, slot → id; null: what the account wears (Cosmetics). A missing slot or "" is nothing. */
	public Map<String, String> wearing;
	/** The elytra slot shown on the back instead of the cape and the wings. */
	public boolean elytra;
	/** Holding the worn shield (left hand) and weapon (right hand), on their slots' tabs. */
	public boolean held;

	final FigureParticles particles = new FigureParticles();
	/** The turn so far, eased towards `turn`. */
	float turned;

	/** Turns to `degrees` the short way round (the turn so far may be several rounds off after dragging). */
	public void turnTo(float degrees) {
		turn = degrees;
		while (turned - degrees > 180) turned -= 360;
		while (degrees - turned > 180) turned += 360;
	}

	String worn(UUID self, String slot) {
		if (wearing == null) return Cosmetics.worn(self, slot);
		String id = wearing.get(slot);
		return id == null || id.isEmpty() ? null : id;
	}

	/** Eases the turn on; returns how much the head may still follow the mouse (none from the side or the back). */
	float step() {
		turned += (turn - turned) * 0.18f;
		if (Math.abs(turn - turned) < 0.05f) turned = turn;
		return (float) Math.max(0, Math.cos(Math.toRadians(turned)));
	}

	/** The running swing now (−1…1), 0 when standing. */
	float swing(float time) {
		return running ? (float) Math.sin(time * 11f) : 0f;
	}

	/** Moves the particles of what is worn on (aura standing, trail running); once a frame. */
	void tickParticles(UUID self) {
		particles.tick(worn(self, "aura"), worn(self, "trail"), running);
	}
}
