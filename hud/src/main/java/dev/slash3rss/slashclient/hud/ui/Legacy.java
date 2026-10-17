//#if MC < 1.20.2
//$ package dev.slash3rss.slashclient.hud.ui;
//$
//$ import com.mojang.blaze3d.systems.RenderSystem;
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import net.minecraft.client.gui.GuiGraphics;
//$ import net.minecraft.resources.ResourceLocation;
//$
//$ /**
//$  * Stand-ins for 1.20.1, which predates the GUI's 2D matrix stack, render pipelines, sprites
//$  * and input event records. The shared code is written against the newer API; the version
//$  * file points those names here (see versions/1.20.1.properties), so most of it builds unchanged.
//$  */
//$ public final class Legacy {
//$ 	private Legacy() {}
//$
//$ 	/** Takes the place of RenderPipelines.GUI_TEXTURED: 1.20.1 has one way to draw textures. */
//$ 	public static final Object GUI_TEXTURED = null;
//$
//$ 	/** Takes the place of Thread.ofVirtual().start (Java 21): a daemon thread. */
//$ 	public static Thread thread(Runnable task) {
//$ 		Thread t = new Thread(task, "SlashClient worker");
//$ 		t.setDaemon(true);
//$ 		t.start();
//$ 		return t;
//$ 	}
//$
//$ 	/** Inventory.setSelectedSlot (1.21.5+): the field itself in 1.20.1. */
//$ 	public static void select(net.minecraft.world.entity.player.Inventory inv, int slot) {
//$ 		inv.selected = slot;
//$ 	}
//$
//$ 	/** DynamicTexture with a debug name (1.21.5+): the name is not kept in 1.20.1. */
//$ 	public static final class NamedTexture extends net.minecraft.client.renderer.texture.DynamicTexture {
//$ 		public NamedTexture(java.util.function.Supplier<String> name, com.mojang.blaze3d.platform.NativeImage image) {
//$ 			super(image);
//$ 		}
//$ 	}
//$
//$ 	/** NativeImage.setPixel takes ARGB (1.21.2+); 1.20.1 stores ABGR. */
//$ 	public static void setPixel(com.mojang.blaze3d.platform.NativeImage image, int x, int y, int argb) {
//$ 		image.setPixelRGBA(x, y, argb & 0xFF00FF00 | (argb & 255) << 16 | (argb >> 16 & 255));
//$ 	}
//$
//$ 	// ---------- the 2D pose stack of 1.21.6+ on top of PoseStack ----------
//$
//$ 	public static Pose pose(GuiGraphics gui) {
//$ 		return new Pose(gui.pose());
//$ 	}
//$
//$ 	public static final class Pose {
//$ 		public final PoseStack stack;
//$
//$ 		Pose(PoseStack stack) {
//$ 			this.stack = stack;
//$ 		}
//$
//$ 		public void pushMatrix() {
//$ 			stack.pushPose();
//$ 		}
//$
//$ 		public void popMatrix() {
//$ 			stack.popPose();
//$ 		}
//$
//$ 		public void translate(float x, float y) {
//$ 			stack.translate(x, y, 0);
//$ 		}
//$
//$ 		public void scale(float x, float y) {
//$ 			stack.scale(x, y, 1);
//$ 		}
//$
//$ 		public org.joml.Vector2f transformPosition(org.joml.Vector2f v) {
//$ 			org.joml.Vector4f r = stack.last().pose().transform(new org.joml.Vector4f(v.x, v.y, 0, 1));
//$ 			return v.set(r.x, r.y);
//$ 		}
//$ 	}
//$
//$ 	// ---------- textures with a tint, as the newer blit takes it ----------
//$
//$ 	private static void tint(GuiGraphics gui, int color) {
//$ 		RenderSystem.enableBlend();
//$ 		gui.setColor((color >> 16 & 255) / 255f, (color >> 8 & 255) / 255f, (color & 255) / 255f, (color >>> 24) / 255f);
//$ 	}
//$
//$ 	private static void untint(GuiGraphics gui) {
//$ 		gui.setColor(1, 1, 1, 1);
//$ 		RenderSystem.disableBlend();
//$ 	}
//$
//$ 	/** blit(pipeline, texture, x, y, u, v, w, h, textureW, textureH) */
//$ 	public static void blit(GuiGraphics gui, Object pipeline, ResourceLocation id, int x, int y, float u, float v, int w, int h, int texW, int texH) {
//$ 		blit(gui, pipeline, id, x, y, u, v, w, h, w, h, texW, texH, 0xFFFFFFFF);
//$ 	}
//$
//$ 	/** blit(pipeline, texture, x, y, u, v, w, h, textureW, textureH, color) */
//$ 	public static void blit(GuiGraphics gui, Object pipeline, ResourceLocation id, int x, int y, float u, float v, int w, int h, int texW, int texH, int color) {
//$ 		blit(gui, pipeline, id, x, y, u, v, w, h, w, h, texW, texH, color);
//$ 	}
//$
//$ 	/** blit(pipeline, texture, x, y, u, v, w, h, regionW, regionH, textureW, textureH) */
//$ 	public static void blit(GuiGraphics gui, Object pipeline, ResourceLocation id, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH) {
//$ 		blit(gui, pipeline, id, x, y, u, v, w, h, regionW, regionH, texW, texH, 0xFFFFFFFF);
//$ 	}
//$
//$ 	/** blit(pipeline, texture, x, y, u, v, w, h, regionW, regionH, textureW, textureH, color) */
//$ 	public static void blit(GuiGraphics gui, Object pipeline, ResourceLocation id, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH, int color) {
//$ 		tint(gui, color);
//$ 		gui.blit(id, x, y, w, h, u, v, regionW, regionH, texW, texH);
//$ 		untint(gui);
//$ 	}
//$
//$ 	// ---------- sprites (1.20.2+): the hearts sit in gui/icons.png in 1.20.1 ----------
//$
//$ 	private static final ResourceLocation ICONS = new ResourceLocation("textures/gui/icons.png");
//$
//$ 	/** Where a heart sprite of the newer game sits in icons.png, or null. */
//$ 	private static int[] heartUv(ResourceLocation sprite) {
//$ 		switch (sprite.getPath()) {
//$ 			case "hud/heart/container": return new int[] { 16, 0 };
//$ 			case "hud/heart/container_blinking": return new int[] { 25, 0 };
//$ 			case "hud/heart/full": return new int[] { 52, 0 };
//$ 			case "hud/heart/half": return new int[] { 61, 0 };
//$ 			case "hud/heart/frozen_full": return new int[] { 178, 0 };
//$ 			case "hud/heart/frozen_half": return new int[] { 187, 0 };
//$ 			default: return null;
//$ 		}
//$ 	}
//$
//$ 	public static void blitSprite(GuiGraphics gui, Object pipeline, ResourceLocation sprite, int x, int y, int w, int h) {
//$ 		blitSprite(gui, pipeline, sprite, x, y, w, h, 0xFFFFFFFF);
//$ 	}
//$
//$ 	public static void blitSprite(GuiGraphics gui, Object pipeline, ResourceLocation sprite, int x, int y, int w, int h, int color) {
//$ 		int[] uv = heartUv(sprite);
//$ 		if (uv != null) blit(gui, pipeline, ICONS, x, y, uv[0], uv[1], w, h, 9, 9, 256, 256, color);
//$ 	}
//$
//$ 	/** A sprite of an atlas (the status effects' pictures). */
//$ 	public static void blitSprite(GuiGraphics gui, Object pipeline, net.minecraft.client.renderer.texture.TextureAtlasSprite sprite, int x, int y, int w, int h) {
//$ 		RenderSystem.enableBlend();
//$ 		gui.blit(x, y, 0, w, h, sprite);
//$ 		RenderSystem.disableBlend();
//$ 	}
//$
//$ 	// ---------- the title screen's panorama (Screen.renderPanorama from 1.20.2 on) ----------
//$
//$ 	private static net.minecraft.client.renderer.PanoramaRenderer panorama;
//$
//$ 	public static void panorama(GuiGraphics gui, float delta) {
//$ 		if (panorama == null) panorama = new net.minecraft.client.renderer.PanoramaRenderer(net.minecraft.client.gui.screens.TitleScreen.CUBE_MAP);
//$ 		panorama.render(delta, 1f);
//$ 	}
//$
//$ 	// ---------- fonts: 1.21.9+ names them with a FontDescription, 1.20.1 by id ----------
//$
//$ 	public static class FontDescription extends ResourceLocation {
//$ 		FontDescription(ResourceLocation id) {
//$ 			super(id.getNamespace(), id.getPath());
//$ 		}
//$
//$ 		public static final class Resource extends FontDescription {
//$ 			public Resource(ResourceLocation id) {
//$ 				super(id);
//$ 			}
//$ 		}
//$ 	}
//$
//$ 	// ---------- input events of 1.21.9+ ----------
//$
//$ 	public record MouseButtonInfo(int button, int modifiers) {}
//$
//$ 	public record MouseButtonEvent(double x, double y, int button) {
//$ 		public MouseButtonEvent(double x, double y, MouseButtonInfo info) {
//$ 			this(x, y, info.button());
//$ 		}
//$ 	}
//$
//$ 	public record KeyEvent(int key, int scancode, int modifiers) {}
//$ }
//#endif
