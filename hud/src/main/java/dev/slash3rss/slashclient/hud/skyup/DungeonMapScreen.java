package dev.slash3rss.slashclient.hud.skyup;

import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * The dungeon map over the whole screen (M, or the key set for it): all that was seen, as large
 * as fits, with the loot counted over the whole dungeon above it. Dragging moves it, the wheel
 * zooms, a right click shows all of it again; the same key, Escape or ✕ closes it.
 */
public class DungeonMapScreen extends Screen {
	private static NativeImage picture;
	private static DynamicTexture texture;
	private static Identifier textureId;
	private final KeyMapping key;

	public DungeonMapScreen(KeyMapping key) {
		super(Component.translatable("key.slashclient-hud.dungeonMap"));
		this.key = key;
	}

	/** A picture of this size to draw into, made anew when the size changes. */
	private static void ensure(int w, int h) {
		if (picture != null && picture.getWidth() == w && picture.getHeight() == h) return;
		Minecraft mc = Minecraft.getInstance();
		if (texture != null) texture.close();
		picture = new NativeImage(w, h, true);
		texture = new DynamicTexture(() -> "SlashClient dungeon map, full screen", picture);
		textureId = Identifier.fromNamespaceAndPath(SlashHud.ID, "dungeon_map_full");
		mc.getTextureManager().register(textureId, texture);
	}

	/** Closer than the whole map (1 = all of it fits), and the map point in the middle (NaN: the middle of what was seen). */
	private float zoom = 1f, centerX = Float.NaN, centerZ = Float.NaN;
	/** The map area on screen and the view drawn in it, from the last frame (for the mouse). */
	private int ox, oy, aw, ah;
	private float vx, vz, scale;
	private int frame;
	private String lastView = "";

	private static final int CLOSE = 14;

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		Minecraft mc = Minecraft.getInstance();
		int[] seen = DungeonMap.seen();
		if (seen == null || mc.player == null) {
			onClose();
			return;
		}
		// the top bar: the dungeon and its loot, all of it, on its own strip (the HUD's top modules stay under it)
		g.fill(0, 0, width, 22, 0xE00A0D14);
		Component title = Ui.text(DungeonMap.titleText());
		Ui.draw(g, title, 10, 8, 0xFFFFFFFF);
		int at = 12 + Ui.width(title) + 12;
		for (int cat = 0; cat < DungeonRooms.LOOT.length; cat++) {
			if (!DungeonRooms.shown(cat)) continue;
			int[] n = DungeonRooms.countAll(cat);
			if (n[1] == 0) continue;
			ItemStack icon = Ui.stack(DungeonRooms.LOOT_ICONS[cat]);
			if (icon != null) g.item(icon, at, 4);
			String s = n[0] + "/" + n[1];
			Ui.draw(g, Ui.text(s), at + 19, 8, n[0] == n[1] ? 0xFF86EFAC : 0xFFFFFFFF);
			at += 19 + Ui.width(Ui.text(s)) + 12;
		}
		// close
		int cx = width - CLOSE - 6, cy = 4;
		boolean over = Ui.inside(mx, my, cx, cy, CLOSE, CLOSE);
		g.fill(cx, cy, cx + CLOSE, cy + CLOSE, over ? 0xFFDC2626 : 0xC0374151);
		Ui.draw(g, Component.literal("✕"), cx + (CLOSE - Ui.width(Component.literal("✕"))) / 2 + 1, cy + 3, 0xFFFFFFFF);

		// the map area: all of it below the bar; the view in it from the zoom and the middle point
		ox = 10;
		oy = 24;
		aw = width - 20;
		ah = height - oy - 18;
		if (Float.isNaN(centerX)) {
			centerX = seen[0] + seen[2] / 2f;
			centerZ = seen[1] + seen[3] / 2f;
		}
		float fit = Math.min((float) aw / seen[2], (float) ah / seen[3]);
		scale = fit * zoom;
		vx = centerX - aw / 2f / scale;
		vz = centerZ - ah / 2f / scale;
		// drawn at most 480 pixels across, stretched to the area; again when the view moves, and twice a second
		int pw = Math.min(aw, 480), ph = Math.max(1, Math.round((float) ah * pw / aw));
		ensure(pw, ph);
		String view = pw + "," + ph + "," + vx + "," + vz + "," + scale;
		if (!view.equals(lastView) || frame++ % 10 == 0) {
			lastView = view;
			DungeonMap.paint(picture, pw, ph, vx, vz, scale * pw / aw, false);
			texture.upload();
		}
		g.fill(ox - 2, oy - 2, ox + aw + 2, oy + ah + 2, 0xC0000000);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, textureId, ox, oy, 0, 0, aw, ah, pw, ph, pw, ph, 0xFFFFFFFF);
		final int w = aw, h = ah;
		DungeonMap.drawOver(g, mc, ox, oy, vx, vz, scale, (x, z) -> x >= 0 && z >= 0 && x < w && z < h);
		// how to use it
		Component help = Ui.tr("slashclient-hud.dungeon.fullHelp");
		Ui.draw(g, help, (width - Ui.width(help)) / 2, height - 13, 0xFFAAAAAA);
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		if (Ui.inside(e.x(), e.y(), width - CLOSE - 6, 4, CLOSE, CLOSE)) {
			onClose();
			return true;
		}
		// right click: back to the whole map
		if (e.button() == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_RIGHT) {
			zoom = 1f;
			centerX = centerZ = Float.NaN;
			return true;
		}
		//#if MC >= 1.21.9
		return super.mouseClicked(e, doubleClick);
		//#else
		//$ return super.mouseClicked(e.x(), e.y(), e.button());
		//#endif
	}

	/** Dragging moves the map with the mouse. */
	@Override
	//#if MC >= 1.21.9
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
	//#else
	//$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (scale <= 0) return false;
		centerX -= (float) dx / scale;
		centerZ -= (float) dy / scale;
		return true;
	}

	/** The wheel zooms in and out around the point under the mouse. */
	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//$ 	double h = 0;
	//#endif
		if (scale <= 0 || v == 0) return false;
		float px = vx + (float) (x - ox) / scale, pz = vz + (float) (y - oy) / scale;
		float next = Math.max(1f, Math.min(10f, zoom * (v > 0 ? 1.25f : 0.8f)));
		float nextScale = scale / zoom * next;
		zoom = next;
		// the point under the mouse stays under it
		centerX = px - (float) (x - ox - aw / 2.0) / nextScale;
		centerZ = pz - (float) (y - oy - ah / 2.0) / nextScale;
		return true;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		if (key.matches(e)) {
			onClose();
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
		//#endif
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// as dark as the world map's: the HUD's modules under it (FPS, the small dungeon map) do not show through
		g.fill(0, 0, width, height, 0xE0000000);
	}
}
