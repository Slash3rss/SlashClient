package dev.slash3rss.slashclient.hud.servers;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * The editor's "Share" page, under the codes: the switch that gives the server the game is on a
 * HUD layout of its own, and the servers that have one, each with a × that forgets it. The page
 * scrolls when the window is low.
 */
public final class ServerLayoutsPanel {
	private ServerLayoutsPanel() {}

	/** A clickable place, handed to the editor. */
	public interface Hits {
		void add(int x, int y, int w, int h, Runnable action);
	}

	/** For the test: the middle of the switch and of the first ×, as last drawn. */
	public static double[] switchCenter, firstDelete;

	/** Draws the section from `y` down; returns the y under it. `changed` runs after the HUD got another layout. */
	public static int draw(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, Hits hits, Runnable changed) {
		Minecraft mc = Minecraft.getInstance();
		g.fill(x, y, x + w, y + 1, Ui.BORDER);
		y += 7;
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.servers.title"), w), x, y, Ui.TEXT);
		y = Ui.wrapped(g, Ui.tr("slashclient-hud.servers.help"), x, y + 13, w, Ui.TEXT_2) + 3;

		String here = ServerLayouts.address(mc);
		switchCenter = null;
		if (here == null) {
			y = Ui.wrapped(g, Ui.tr("slashclient-hud.servers.offline"), x, y, w, Ui.MUTED) + 3;
		} else {
			boolean on = here.equals(ServerLayouts.active());
			Ui.round(g, x, y, w, 22, 4, Ui.CARD);
			Ui.roundOutline(g, x, y, w, 22, 4, on ? 0xAA3B82F6 : Ui.BORDER);
			Ui.icon(g, "server", x + 7, y + 6, 10, on ? Ui.ACCENT_LIGHT : Ui.TEXT_2);
			Component label = Ui.tr("slashclient-hud.servers.here", here);
			Ui.draw(g, Ui.fit(label, w - 54), x + 22, y + 7, Ui.TEXT);
			Ui.toggle(g, "serverLayout", x + w - 28, y + 6, on);
			switchCenter = new double[] { x + w - 18, y + 11 };
			hits.add(x, y, w, 22, () -> {
				if (on) ServerLayouts.delete(here);
				else ServerLayouts.saveFor(here);
				changed.run();
			});
			y += 25;
			if (on) y = Ui.wrapped(g, Ui.tr("slashclient-hud.servers.editing"), x, y, w, Ui.ACCENT_LIGHT) + 2;
		}

		List<String> servers = ServerLayouts.servers();
		firstDelete = null;
		if (servers.isEmpty()) {
			Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.servers.none"), w), x, y + 2, Ui.MUTED);
			return y + 12;
		}
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.servers.saved", servers.size()), w), x, y + 2, Ui.TEXT_2);
		y += 14;
		for (String server : servers) {
			boolean active = server.equals(ServerLayouts.active());
			Ui.round(g, x, y, w, 16, 3, Ui.CARD);
			Ui.icon(g, "server", x + 5, y + 4, 8, active ? Ui.ACCENT_LIGHT : Ui.MUTED);
			Component name = Ui.text(server);
			if (active) name = name.copy().append(Ui.tr("slashclient-hud.servers.on").copy().withStyle(st -> st.withColor(Ui.ACCENT_LIGHT)));
			Ui.draw(g, Ui.fit(name, w - 40), x + 18, y + 4, Ui.TEXT);
			Ui.button(g, "serverDelete:" + server, x + w - 18, y + 1, 16, 14, "close", Component.empty(), false, mx, my);
			if (firstDelete == null) firstDelete = new double[] { x + w - 10, y + 8 };
			hits.add(x + w - 18, y + 1, 16, 14, () -> {
				ServerLayouts.delete(server);
				changed.run();
			});
			y += 18;
		}
		return y;
	}
}
