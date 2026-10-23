package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Undo and redo in the HUD editor, for one opening of it. A step is whatever changed between two
 * moments the editor checks: a click or a drag let go, a pause in typing. Before each step the
 * whole settings are kept as the file holds them (they are small), and put back on undo, so every
 * kind of change is covered alike: modules moved, scaled, switched on or off, their settings, the
 * game's own parts and the crosshair painted.
 */
final class EditHistory {
	/** How many steps back the editor remembers. */
	static final int LIMIT = 50;

	/** The settings at one moment: the HUD's own and the game's options the editor changes too. */
	private record State(String config, boolean toggleSprint, boolean toggleCrouch, double chatScale, double chatBackground) {
		static State now() {
			Options o = Minecraft.getInstance().options;
			return new State(SlashHud.config.snapshot(), o.toggleSprint().get(), o.toggleCrouch().get(), o.chatScale().get(), o.textBackgroundOpacity().get());
		}

		void apply() {
			Minecraft mc = Minecraft.getInstance();
			SlashHud.config.restore(config);
			Options o = mc.options;
			if (o.toggleSprint().get() != toggleSprint || o.toggleCrouch().get() != toggleCrouch) {
				o.toggleSprint().set(toggleSprint);
				o.toggleCrouch().set(toggleCrouch);
				o.save();
			}
			ChatLook.restore(mc, chatScale, chatBackground);
			ChatTabs.changed();
			SlashHud.config.save();
		}
	}

	private final Deque<State> undo = new ArrayDeque<>();
	private final Deque<State> redo = new ArrayDeque<>();
	/** The settings as of the last step; null until the editor has drawn its first frame. */
	private State base;

	/** Forgets every step: what is there now is where undo stops. */
	void reset() {
		undo.clear();
		redo.clear();
		base = State.now();
	}

	/** Anything changed since the last step becomes a new one (and what was undone cannot come back). */
	boolean commit() {
		if (base == null) return false;
		State now = State.now();
		if (now.equals(base)) return false;
		undo.push(base);
		while (undo.size() > LIMIT) undo.removeLast();
		redo.clear();
		base = now;
		return true;
	}

	boolean undo() {
		commit();
		if (undo.isEmpty()) return false;
		redo.push(base);
		undo.pop().apply();
		// read back as it is now: what restoring fills in by itself is not a change of the player's
		base = State.now();
		return true;
	}

	boolean redo() {
		commit();
		if (redo.isEmpty()) return false;
		undo.push(base);
		redo.pop().apply();
		base = State.now();
		return true;
	}

	boolean canUndo() {
		return !undo.isEmpty();
	}

	boolean canRedo() {
		return !redo.isEmpty();
	}

	/** For the in-game test: "steps back, steps forward". */
	String sizes() {
		return undo.size() + " " + redo.size();
	}
}
