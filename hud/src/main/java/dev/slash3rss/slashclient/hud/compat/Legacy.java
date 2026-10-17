//#if MC < 1.21.2
//$ package dev.slash3rss.slashclient.hud.compat;
//$
//$ import com.mojang.blaze3d.systems.RenderSystem;
//$ import net.minecraft.client.gui.GuiGraphics;
//$ import net.minecraft.resources.ResourceLocation;
//$
//$ /**
//$  * Minecraft 1.21.1 under the names the shared code uses (applied by versions/1.21.1.properties):
//$  * the GUI draws textures without render pipelines and takes colours from the shader.
//$  */
//$ public final class Legacy {
//$ 	private Legacy() {}
//$
//$ 	/** The colour every texture drawn next is multiplied by (white = as it is). */
//$ 	private static void tint(int color) {
//$ 		RenderSystem.enableBlend();
//$ 		RenderSystem.defaultBlendFunc();
//$ 		RenderSystem.setShaderColor((color >> 16 & 255) / 255f, (color >> 8 & 255) / 255f, (color & 255) / 255f, (color >>> 24) / 255f);
//$ 	}
//$
//$ 	private static void untint() {
//$ 		RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
//$ 	}
//$
//$ 	/** blit(pipeline, id, x, y, u, v, w, h, texW, texH) */
//$ 	public static void blit(GuiGraphics gfx, Object pipeline, ResourceLocation id, int x, int y, float u, float v, int w, int h, int texW, int texH) {
//$ 		blit(gfx, pipeline, id, x, y, u, v, w, h, w, h, texW, texH, 0xFFFFFFFF);
//$ 	}
//$
//$ 	/** blit(pipeline, id, x, y, u, v, w, h, texW, texH, color) */
//$ 	public static void blit(GuiGraphics gfx, Object pipeline, ResourceLocation id, int x, int y, float u, float v, int w, int h, int texW, int texH, int color) {
//$ 		blit(gfx, pipeline, id, x, y, u, v, w, h, w, h, texW, texH, color);
//$ 	}
//$
//$ 	/** blit(pipeline, id, x, y, u, v, w, h, uw, vh, texW, texH) */
//$ 	public static void blit(GuiGraphics gfx, Object pipeline, ResourceLocation id, int x, int y, float u, float v, int w, int h, int uw, int vh, int texW, int texH) {
//$ 		blit(gfx, pipeline, id, x, y, u, v, w, h, uw, vh, texW, texH, 0xFFFFFFFF);
//$ 	}
//$
//$ 	/** blit(pipeline, id, x, y, u, v, w, h, uw, vh, texW, texH, color): a part of a texture, stretched to w×h. */
//$ 	public static void blit(GuiGraphics gfx, Object pipeline, ResourceLocation id, int x, int y, float u, float v, int w, int h, int uw, int vh, int texW, int texH, int color) {
//$ 		tint(color);
//$ 		gfx.blit(id, x, y, w, h, u, v, uw, vh, texW, texH);
//$ 		untint();
//$ 	}
//$
//$ 	public static void blitSprite(GuiGraphics gfx, Object pipeline, ResourceLocation sprite, int x, int y, int w, int h) {
//$ 		blitSprite(gfx, pipeline, sprite, x, y, w, h, 0xFFFFFFFF);
//$ 	}
//$
//$ 	public static void blitSprite(GuiGraphics gfx, Object pipeline, ResourceLocation sprite, int x, int y, int w, int h, int color) {
//$ 		tint(color);
//$ 		gfx.blitSprite(sprite, x, y, w, h);
//$ 		untint();
//$ 	}
//$
//$ 	/** A status effect's picture (1.21.1 keeps them in their own atlas, not in the GUI sprites). */
//$ 	public static void effect(GuiGraphics gfx, net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect, int x, int y, int size) {
//$ 		var sprite = net.minecraft.client.Minecraft.getInstance().getMobEffectTextures().get(effect);
//$ 		gfx.blit(x, y, 0, size, size, sprite);
//$ 	}
//$
//$ 	public static void setSelectedSlot(net.minecraft.world.entity.player.Inventory inv, int slot) {
//$ 		inv.selected = slot;
//$ 	}
//$
//$ 	/** A pixel as 0xAARRGGBB (1.21.1 keeps them as 0xAABBGGRR). */
//$ 	public static int getPixel(com.mojang.blaze3d.platform.NativeImage image, int x, int y) {
//$ 		int abgr = image.getPixelRGBA(x, y);
//$ 		return abgr & 0xFF00FF00 | (abgr & 0xFF) << 16 | abgr >> 16 & 0xFF;
//$ 	}
//$
//$ 	public static void setPixel(com.mojang.blaze3d.platform.NativeImage image, int x, int y, int argb) {
//$ 		image.setPixelRGBA(x, y, argb & 0xFF00FF00 | (argb & 0xFF) << 16 | argb >> 16 & 0xFF);
//$ 	}
//$
//$ 	/** The frame as a picture, shrunk `scale` times, handed over at once (1.21.1 reads it synchronously). */
//$ 	public static void takeScreenshot(com.mojang.blaze3d.pipeline.RenderTarget target, int scale, java.util.function.Consumer<com.mojang.blaze3d.platform.NativeImage> done) {
//$ 		// (the space keeps versions/1.21.1.properties from turning this call into this method)
//$ 		com.mojang.blaze3d.platform.NativeImage full = net.minecraft.client.Screenshot .takeScreenshot(target);
//$ 		if (scale <= 1) {
//$ 			done.accept(full);
//$ 			return;
//$ 		}
//$ 		int w = Math.max(1, full.getWidth() / scale), h = Math.max(1, full.getHeight() / scale);
//$ 		com.mojang.blaze3d.platform.NativeImage small = new com.mojang.blaze3d.platform.NativeImage(w, h, false);
//$ 		for (int y = 0; y < h; y++) {
//$ 			for (int x = 0; x < w; x++) small.setPixelRGBA(x, y, full.getPixelRGBA(x * scale, y * scale));
//$ 		}
//$ 		full.close();
//$ 		done.accept(small);
//$ 	}
//$
//$ 	public static net.minecraft.network.chat.Component disconnectButtonLabel(boolean local) {
//$ 		return local ? net.minecraft.network.chat.Component.translatable("menu.returnToMenu") : net.minecraft.network.chat.CommonComponents.GUI_DISCONNECT;
//$ 	}
//$
//$ 	/** Leaves the world or server as 1.21.1's pause menu does, ending on the title or server list. */
//$ 	public static void disconnectFromWorld(net.minecraft.client.Minecraft mc) {
//$ 		boolean local = mc.isLocalServer();
//$ 		var server = mc.getCurrentServer();
//$ 		disconnectFromWorld(mc, net.minecraft.network.chat.Component.translatable(local ? "menu.savingLevel" : "disconnect.quitting"));
//$ 		var title = new net.minecraft.client.gui.screens.TitleScreen();
//$ 		if (local) mc.setScreen(title);
//$ 		else if (server != null && server.isRealm()) mc.setScreen(new com.mojang.realmsclient.RealmsMainScreen(title));
//$ 		else mc.setScreen(new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(title));
//$ 	}
//$
//$ 	/** Leaves the world or server with `message` on screen meanwhile. */
//$ 	public static void disconnectFromWorld(net.minecraft.client.Minecraft mc, net.minecraft.network.chat.Component message) {
//$ 		if (mc.level != null) mc.level.disconnect();
//$ 		mc.disconnect(new net.minecraft.client.gui.screens.GenericMessageScreen(message));
//$ 	}
//$ }
//#endif
