package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.skyup.SkyAtlasTestHooks;
//#endif

/**
 * The fish atlas: a page of the fisherman's "Moje okazy" read (fish with their records and fun facts,
 * one not caught, the other items aside), a catch from the chat added, what the server is sent, and
 * the atlas' screen.
 */
public class GameSkyAtlas implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 26.3
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (var world = context.worldBuilder().create()) {
			context.waitTicks(40);
			// in a world: how each fish looks is kept (Amur's own model)
			String page = context.computeOnClient(mc -> SkyAtlasTestHooks.readPage());
			if (!page.equals("Amur biały 5 39200/45000 fact look | Boleń 1 1830/0 | Certa 0 0/0 | Sum 1 12400/150000 fact look |"))
				throw new AssertionError("The atlas from the window and a catch: " + page);
			// what the shared atlas (admin panel) is sent: summaries, then new catches in parts under 16 KB
			String upload = context.computeOnClient(mc -> SkyAtlasTestHooks.uploadParts());
			if (!upload.equals("1 amurbialy,bolen,sum catches=3 amur=5/39200/fact | ok sent=300 upTo=399"))
				throw new AssertionError("The atlas' upload: " + upload);
			context.runOnClient(mc -> SkyAtlasTestHooks.readPage());
			// the GUI dump shows the item's model and the server's data too
			String dump = context.computeOnClient(mc -> SkyAtlasTestHooks.dumpData());
			if (!dump.contains("minecraft:custom_model_data") || !dump.contains("1001") || !dump.contains("amur_bialy") || dump.contains("minecraft:lore"))
				throw new AssertionError("The dump's item data: " + dump);
			// a species never seen has its real look all the same, from its model number
			String unseen = context.computeOnClient(mc -> SkyAtlasTestHooks.unseenLook());
			if (!unseen.equals("minecraft:cod [10167.0]"))
				throw new AssertionError("A species not caught yet: " + unseen);
			// the album of cards, then a card opened: its catches, the record one in gold
			context.runOnClient(mc -> SkyAtlasTestHooks.open(null));
			context.waitTicks(10);
			context.takeScreenshot("skyatlas-album");
			// opened as the player opens it: the cards are dealt one after another
			context.runOnClient(mc -> SkyAtlasTestHooks.openMoving());
			context.waitTicks(2);
			context.takeScreenshot("skyatlas-dealing");
			// the species caught are new to the album: turned over with sparkles, then face up for good
			context.waitTicks(17);
			context.takeScreenshot("skyatlas-reveal");
			context.waitTicks(50);
			String revealed = context.computeOnClient(mc -> SkyAtlasTestHooks.revealed());
			if (!revealed.equals("Amur biały=true Boleń=true Sum=false"))
				throw new AssertionError("New species turned over: " + revealed);
			context.runOnClient(mc -> SkyAtlasTestHooks.open("Amur biały"));
			context.waitTicks(10);
			context.takeScreenshot("skyatlas-species");
			context.setScreen(() -> null);
		}
		//#endif
	}
}
