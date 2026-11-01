package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.compat.AtlasFit;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * A pack too big for the graphics card's atlas (a Raspberry Pi takes 4096 pixels): with a card limit
 * of 2048 set for the test, the test mod's twenty 512×512 item textures do not fit, get halved and the
 * pack stays; the game's own small textures are left as they are, and with the card's real limit
 * everything is back at full size.
 */
public class GameAtlasFit implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 1.21.11
		try {
			reload(context, 2048);
			String small = context.computeOnClient(mc -> sizes());
			if (!small.equals("256x256 16x16")) throw new AssertionError("The big textures were not halved to fit 2048: " + small);
		} finally {
			reload(context, 0);
		}
		String full = context.computeOnClient(mc -> sizes());
		if (!full.equals("512x512 16x16")) throw new AssertionError("The textures with the card's own limit: " + full);
		//#endif
	}

	//#if MC >= 1.21.11
	/** The test pack's first big texture and the game's diamond in the items atlas, as "WxH WxH". */
	private static String sizes() {
		var atlas = (net.minecraft.client.renderer.texture.TextureAtlas) net.minecraft.client.Minecraft.getInstance().getTextureManager()
			.getTexture(net.minecraft.client.renderer.texture.TextureAtlas.LOCATION_ITEMS);
		var big = atlas.getSprite(net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud-test", "item/atlas_fit_0")).contents();
		var diamond = atlas.getSprite(net.minecraft.resources.Identifier.withDefaultNamespace("item/diamond")).contents();
		return big.width() + "x" + big.height() + " " + diamond.width() + "x" + diamond.height();
	}

	/** The resources loaded again with this atlas limit (0: the card's own), waited for to the end. */
	private static void reload(ClientGameTestContext context, int limit) {
		java.util.concurrent.CompletableFuture<?>[] reload = new java.util.concurrent.CompletableFuture<?>[1];
		context.runOnClient(mc -> {
			AtlasFit.limitForTest = limit;
			reload[0] = mc.reloadResourcePacks();
		});
		context.waitFor(mc -> reload[0].isDone(), 1200);
		context.waitTicks(2);
		//#if MC >= 26.2
		context.waitFor(mc -> mc.gui.overlay() == null, 1200);
		//#else
		//$ context.waitFor(mc -> mc.getOverlay() == null, 1200);
		//#endif
		context.waitTicks(5);
	}
	//#endif
}
