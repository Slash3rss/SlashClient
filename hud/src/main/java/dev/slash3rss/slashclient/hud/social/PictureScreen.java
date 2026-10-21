package dev.slash3rss.slashclient.hud.social;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;

/** A picture from the chat over the whole screen, from whom it came; a click or Esc goes back. */
public class PictureScreen extends Screen {
	private final Screen parent;
	private final String imageId;
	private final String from;

	/** Set for a picture from a community's chat (not encrypted; fetched by its community). */
	private String communityId;

	public PictureScreen(Screen parent, String imageId, String from) {
		super(Component.translatable("slashclient-hud.picture.view"));
		this.parent = parent;
		this.imageId = imageId;
		this.from = from;
	}

	/** A picture from a community's chat. */
	public static PictureScreen forCommunity(Screen parent, String communityId, String imageId, String from) {
		PictureScreen s = new PictureScreen(parent, imageId, from);
		s.communityId = communityId;
		return s;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		ChatImages.Texture tex = communityId != null ? ChatImages.community(communityId, imageId) : ChatImages.chat(imageId);
		if (tex.ready()) {
			int[] size = ChatImages.fit(tex.w(), tex.h(), width - 40, height - 50);
			int x = (width - size[0]) / 2, y = (height - 14 - size[1]) / 2;
			Ui.round(g, x - 3, y - 3, size[0] + 6, size[1] + 6, 4, Ui.PANEL);
			g.blit(RenderPipelines.GUI_TEXTURED, tex.id(), x, y, 0, 0, size[0], size[1], tex.w(), tex.h(), tex.w(), tex.h(), 0xFFFFFFFF);
			Ui.centered(g, Ui.fit(Ui.tr("slashclient-hud.picture.from", from), width - 20), width / 2, y + size[1] + 8, Ui.TEXT_2);
		} else Ui.centered(g, Ui.tr(tex.failed() ? "slashclient-hud.picture.gone" : "slashclient-hud.picture.loading"), width / 2, height / 2, Ui.MUTED);
		super.extractRenderState(g, mx, my, delta);
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//#endif
		onClose();
		return true;
	}

	@Override
	public void onClose() {
		minecraft.setScreenAndShow(parent);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		g.fill(0, 0, width, height, 0xE00A0D14);
	}
}
