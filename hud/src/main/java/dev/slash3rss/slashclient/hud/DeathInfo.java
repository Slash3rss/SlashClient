package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.network.chat.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * The death screen tells more: under the cause of death a card with where it happened (the
 * coordinates and dimension; a click copies them) and how long the player had lived since the
 * last respawn, and a button that keeps the place as a lasting waypoint. The game's own buttons
 * (Respawn or Spectate, Title screen) move down to make room and work as before.
 */
public final class DeathInfo {
	private DeathInfo() {}

	/** Ticks lived since the last respawn (or joining the world); frozen while dead. */
	static long aliveTicks;
	private static boolean wasDead;
	/** The card and button on the open death screen (for the test). */
	static Card card;
	static SaveButton saveButton;
	/** The point kept from the death screen last, so a rebuilt screen does not offer it again. */
	private static Waypoints.Point lastSaved;

	static void tick(Minecraft mc) {
		if (mc.player == null || mc.level == null) {
			aliveTicks = 0;
			wasDead = false;
			return;
		}
		boolean dead = mc.player.isDeadOrDying();
		// back from the death screen: the count starts again
		if (!dead && wasDead) aliveTicks = 0;
		else if (!dead && !mc.isPaused()) aliveTicks++;
		wasDead = dead;
	}

	/** Called on every death screen's init (also after a resize). */
	static void attach(Minecraft mc, DeathScreen screen) {
		card = null;
		saveButton = null;
		if (SlashHud.config == null || !SlashHud.config.deathScreen || mc.player == null || mc.level == null) return;
		List<AbstractWidget> widgets = Screens.getWidgets(screen);
		List<AbstractWidget> own = new ArrayList<>(widgets);
		int[] at = DeathPoint.spot(mc);
		String dimension = Waypoints.dimension(mc);
		int w = 200, x = screen.width / 2 - w / 2;
		// under the game's score line (drawn at 100)
		int top = 114;
		card = new Card(x, top, w, 30, at, dimension, aliveTicks);
		widgets.add(card);
		int bottom = top + 30;
		if (SlashHud.config.waypoints) {
			saveButton = new SaveButton(x, bottom + 4, w, 20, at, dimension);
			widgets.add(saveButton);
			bottom += 24;
		}
		// the game's buttons below ours, still on the screen
		int first = own.stream().mapToInt(AbstractWidget::getY).min().orElse(bottom + 8);
		int last = own.stream().mapToInt(b -> b.getY() + b.getHeight()).max().orElse(first);
		int shift = Math.max(0, Math.min(bottom + 8 - first, screen.height - 4 - last));
		for (AbstractWidget b : own) b.setY(b.getY() + shift);
	}

	static String coords(int[] at) {
		return at[0] + " " + at[1] + " " + at[2];
	}

	/** "1 h 5 min", "3 min 12 s", "40 s". */
	static String duration(long ticks) {
		long s = ticks / 20, h = s / 3600, m = s / 60 % 60;
		if (h > 0) return h + " h " + m + " min";
		if (m > 0) return m + " min " + s % 60 + " s";
		return s % 60 + " s";
	}

	/**
	 * Keeps the place as a lasting waypoint named with the date: the death point there (when one
	 * was put) becomes it, so the list gets no second point at the same spot.
	 */
	static Waypoints.Point save(Minecraft mc, int[] at, String dimension) {
		// the death point of this death, if the tick has not put it yet
		DeathPoint.tick(mc);
		String date;
		try {
			date = LocalDateTime.now().format(DateTimeFormatter.ofPattern(Component.translatable("slashclient-hud.deathScreen.dateFormat").getString()));
		} catch (IllegalArgumentException e) {
			date = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
		}
		String name = Component.translatable("slashclient-hud.deathScreen.pointName", date).getString();
		if (name.length() > 32) name = name.substring(0, 32);
		for (Waypoints.Point p : Waypoints.points(mc)) {
			if (p.death && dimension.equals(p.dimension) && p.x == at[0] && p.y == at[1] && p.z == at[2]) {
				p.death = false;
				p.name = name;
				Waypoints.save();
				return p;
			}
		}
		Waypoints.Point p = new Waypoints.Point(name, at[0], at[1], at[2], dimension, DeathPoint.COLOR);
		Waypoints.here(mc).add(p);
		Waypoints.save();
		return p;
	}

	/** Where and how long: a click copies the coordinates. */
	static final class Card extends Button {
		final int[] at;
		final String dimension;
		final long lived;
		private long copiedAt;

		Card(int x, int y, int w, int h, int[] at, String dimension, long lived) {
			super(x, y, w, h, Component.empty(), b -> ((Card) b).copy(), DEFAULT_NARRATION);
			this.at = at;
			this.dimension = dimension;
			this.lived = lived;
			setMessage(place());
		}

		Component place() {
			return Ui.text(coords(at) + "  ·  " + WorldMapScreen.dimensionName(Minecraft.getInstance()));
		}

		Component survived() {
			return Ui.tr("slashclient-hud.deathScreen.survived", duration(lived));
		}

		void copy() {
			Minecraft.getInstance().keyboardHandler.setClipboard(coords(at));
			copiedAt = System.currentTimeMillis();
		}

		boolean copied() {
			return copiedAt > 0 && System.currentTimeMillis() - copiedAt < 1500;
		}

		@Override
		protected void extractContents(GuiGraphicsExtractor g, int mx, int my, float delta) {
			int x = getX(), y = getY(), w = getWidth(), h = getHeight();
			float t = Ui.hover("deathcard", isHoveredOrFocused());
			Ui.round(g, x, y, w, h, 5, Ui.blend(0xC0111622, 0xE01C2435, t));
			Ui.roundOutline(g, x, y, w, h, 5, Ui.blend(Ui.BORDER, 0x40FFFFFF, t));
			boolean copied = copied();
			Component top = copied ? Ui.tr("slashclient-hud.deathScreen.copied") : place();
			int topColor = copied ? Ui.GREEN : Ui.blend(Ui.TEXT, 0xFFFFFFFF, t);
			Component fitted = Ui.fit(top, w - 34);
			Ui.icon(g, copied ? "check" : "m-coords", x + 7, y + 5, 8, copied ? Ui.GREEN : DeathPoint.COLOR);
			Ui.draw(g, fitted, x + 19, y + 5, topColor);
			Ui.icon(g, "m-clock", x + 7, y + 17, 8, Ui.TEXT_2);
			Ui.draw(g, Ui.fit(survived(), w - 26), x + 19, y + 17, Ui.TEXT_2);
			// it can be copied: the copy sign shows on hover
			if (!copied) Ui.icon(g, "copy", x + w - 15, y + 5, 8, Ui.blend(0x00FFFFFF, Ui.TEXT_2, t));
		}
	}

	/** "Set waypoint": once pressed it says so and stays off. */
	static final class SaveButton extends Button {
		final int[] at;
		final String dimension;
		Waypoints.Point saved;

		SaveButton(int x, int y, int w, int h, int[] at, String dimension) {
			super(x, y, w, h, Ui.tr("slashclient-hud.deathScreen.save"), b -> ((SaveButton) b).press(), DEFAULT_NARRATION);
			this.at = at;
			this.dimension = dimension;
			// the screen built again (a resized window) still knows it was kept
			Waypoints.Point last = lastSaved;
			if (last != null && last.x == at[0] && last.y == at[1] && last.z == at[2] && dimension.equals(last.dimension)) done(last);
		}

		void press() {
			if (saved != null) return;
			done(lastSaved = save(Minecraft.getInstance(), at, dimension));
		}

		private void done(Waypoints.Point p) {
			saved = p;
			setMessage(Ui.tr("slashclient-hud.deathScreen.saved", p.name));
			active = false;
		}

		@Override
		protected void extractContents(GuiGraphicsExtractor g, int mx, int my, float delta) {
			int x = getX(), y = getY(), w = getWidth(), h = getHeight();
			if (saved != null) {
				Ui.round(g, x, y, w, h, 4, 0xC0111622);
				Ui.roundOutline(g, x, y, w, h, 4, 0x604ADE80);
				Component label = Ui.fit(getMessage(), w - 26);
				int left = x + (w - Ui.width(label) - 13) / 2;
				Ui.icon(g, "check", left, y + (h - 8) / 2, 8, Ui.GREEN);
				Ui.draw(g, label, left + 13, y + (h - 8) / 2, Ui.GREEN);
				return;
			}
			float t = Ui.hover("deathsave", isHoveredOrFocused());
			Ui.accent(g, x, y, w, h, 4, t);
			Component label = getMessage();
			int left = x + (w - Ui.width(label) - 14) / 2;
			Ui.icon(g, "m-waypoints", left, y + (h - 9) / 2, 9, 0xFFFFFFFF);
			Ui.draw(g, label, left + 14, y + (h - 8) / 2, 0xFFFFFFFF);
		}
	}
}
