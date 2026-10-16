package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.social.Social;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/** The launcher's accounts; a click makes the game play as that one, without a restart. */
public class AccountsScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private volatile List<Social.Account> accounts;
	private volatile String status = "";
	private volatile String switching;

	public AccountsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.accounts"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		if (accounts != null) return;
		Thread.ofVirtual().start(() -> {
			try {
				accounts = Social.accounts();
			} catch (Exception e) {
				accounts = List.of();
				status = Component.translatable(Social.available() ? "slashclient-hud.accounts.failed" : "slashclient-hud.friends.noLauncher").getString();
			}
		});
	}

	private void pick(Social.Account a) {
		if (a.current() || switching != null) return;
		switching = a.id();
		status = Component.translatable("slashclient-hud.accounts.switching", a.name()).getString();
		Thread.ofVirtual().start(() -> {
			try {
				Social.useAccount(a.id());
				minecraft.execute(() -> minecraft.setScreenAndShow(parent));
			} catch (Exception e) {
				status = Component.translatable("slashclient-hud.accounts.failed").getString() + ": " + e.getMessage();
				switching = null;
			}
		});
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		hits.clear();
		List<Social.Account> list = accounts;
		int pw = Math.min(width - 24, 260), rows = list == null ? 1 : Math.max(1, list.size());
		int ph = Math.min(height - 24, 52 + rows * 26 + (status.isEmpty() ? 0 : 14));
		int px = (width - pw) / 2, py = (height - ph) / 2;
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("accounts", px, py, pw, ph);
		Ui.draw(g, Ui.trBold("slashclient-hud.accounts"), px + 14, py + 12, Ui.TEXT);
		Ui.button(g, "acc:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		int y = py + 36;
		if (list == null) Ui.draw(g, Ui.tr("slashclient-hud.friends.connecting"), px + 14, y + 4, Ui.MUTED);
		else for (Social.Account a : list) {
			if (y + 24 > py + ph - 6) break;
			boolean over = Ui.inside(mx, my, px + 10, y, pw - 20, 22);
			float t = Ui.hover("acc:" + a.id(), over && !a.current());
			Ui.round(g, px + 10, y, pw - 20, 22, 4, a.current() ? 0xFF1C2B4A : Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
			Ui.icon(g, "user", px + 18, y + 6, 10, a.current() ? Ui.ACCENT_LIGHT : Ui.MUTED);
			Ui.draw(g, Ui.fit(Ui.bold(a.name()), pw - 130), px + 34, y + 7, Ui.TEXT);
			Component tag = Ui.tr(a.current() ? "slashclient-hud.accounts.current" : "msa".equals(a.type()) ? "slashclient-hud.accounts.microsoft" : "slashclient-hud.accounts.offline");
			Ui.draw(g, tag, px + pw - 18 - Ui.width(tag), y + 7, a.current() ? Ui.GREEN : Ui.MUTED);
			hits.add(new Hit(px + 10, y, pw - 20, 22, () -> pick(a)));
			y += 26;
		}
		if (!status.isEmpty()) Ui.draw(g, Ui.fit(Ui.text(status), pw - 28), px + 14, py + ph - 16, Ui.TEXT_2);
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (super.mouseClicked(e, doubleClick)) return true;
		for (Hit h : List.copyOf(hits)) {
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}

	@Override
	public void onClose() {
		minecraft.setScreenAndShow(parent);
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		extractPanorama(g, delta);
		g.fill(0, 0, width, height, 0xA00A0D14);
	}
}
