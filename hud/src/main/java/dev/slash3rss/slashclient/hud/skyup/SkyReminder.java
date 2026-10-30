// SkyUp's tasks are played on 26.3: its reminders are there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;

/**
 * SkyUp's reminders (the daily task, the daily bonus) as a banner of their own rather than the game's toast in the
 * corner: it slides down to the middle of the screen's top, a dark card in the reminder's own colour (the bonus gold,
 * the daily task green), the item it is about, a title and a line under it, and a thin bar running out while it is
 * shown; then it slides back up.
 */
public final class SkyReminder {
	private static final long IN = 350, SHOW = 7000, OUT = 300;
	/** Each reminder's colour: light and dark (the badge's gradient), so they are told apart at a glance. */
	public enum Look {
		BONUS(0xFFFFC94D, 0xFFB7791F), DAILY(0xFF4ADE80, 0xFF15803D),
		// the plan of the week's: events purple, fishing contests blue, the boss arena red
		EVENTS(0xFFC084FC, 0xFF7E22CE), FISHING(Ui.ACCENT_LIGHT, Ui.ACCENT_DARK), BOSS(0xFFF87171, 0xFFB91C1C);

		final int light, dark;

		Look(int light, int dark) {
			this.light = light;
			this.dark = dark;
		}
	}

	private static String title, text;
	private static ItemStack icon = ItemStack.EMPTY;
	private static Look look = Look.BONUS;
	private static long shown = -1;

	private SkyReminder() {}

	/** Shows the banner now (one shown already is replaced). */
	public static void show(Look look, String title, String text, ItemStack icon) {
		SkyReminder.look = look;
		SkyReminder.title = title;
		SkyReminder.text = text;
		SkyReminder.icon = icon;
		shown = System.currentTimeMillis();
	}

	/** Whether a banner is on screen (for the tests). */
	public static boolean showing() {
		return shown >= 0 && System.currentTimeMillis() - shown < IN + SHOW + OUT;
	}

	public static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		if (shown < 0) return;
		long age = System.currentTimeMillis() - shown;
		if (age >= IN + SHOW + OUT) {
			shown = -1;
			return;
		}
		// slides in and out, slowing down at the end of each move
		float in = ease(Math.min(1f, (float) age / IN));
		float out = age > IN + SHOW ? ease((float) (age - IN - SHOW) / OUT) : 0f;
		Component head = Ui.bold(title), line = Component.literal(text);
		int w = Math.max(180, Math.min(300, 48 + Math.max(Ui.width(head), Ui.width(line))));
		int h = 36;
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		// under the boss bars, which SkyUp uses on its dungeons and events
		int at = Math.max(30, sh / 9);
		int x = (sw - w) / 2, y = Math.round(-h - 4 + (at + h + 4) * (in - out));

		Ui.round(g, x, y, w, h, 7, Ui.PANEL);
		Ui.roundOutline(g, x, y, w, h, 7, look.light & 0x80FFFFFF);
		// the item on a badge in the reminder's colour
		Ui.roundGradient(g, x + 7, y + 7, 22, 22, 6, look.light, look.dark);
		if (!icon.isEmpty()) g.item(icon, x + 10, y + 10);
		int textW = w - 37 - 8;
		Ui.draw(g, Ui.fit(head, textW), x + 37, y + 8, look.light);
		Ui.draw(g, Ui.fit(line, textW), x + 37, y + 20, Ui.TEXT);
		// how long it is still shown
		float left = Math.max(0f, Math.min(1f, 1f - (float) (age - IN) / SHOW));
		g.fill(x + 8, y + h - 3, x + 8 + Math.round((w - 16) * left), y + h - 2, look.light);
	}

	private static float ease(float t) {
		float u = 1f - t;
		return 1f - u * u * u;
	}
}
//#endif
