package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Supporters of the project: the logo by the name in each tier's colour (as the server sends it)
 * and the supporters' cosmetics (the two capes and the elytra) on our own player.
 */
public class GameSupporter implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			// the logo: the default pink, then the three default tiers' colours
			context.runOnClient(mc -> TestHooks.supporterRank("supporter", -1));
			context.runOnClient(mc -> TestHooks.supporterRank("Wspierający", 0xF472B6));
			context.runOnClient(mc -> TestHooks.supporterRank("Wspierający+", 0xA78BFA));
			context.runOnClient(mc -> TestHooks.supporterRank("Mecenas", 0xFBBF24));
			context.waitTicks(5);
			context.takeScreenshot("supporter-ranks");
			context.runOnClient(mc -> TestHooks.ownRank(null));
			for (String cape : new String[] {"supporter_heart", "supporter_patron"}) {
				context.runOnClient(mc -> TestHooks.cosmeticsSelf(cape, false));
				context.waitTicks(10);
				String texture = context.computeOnClient(mc -> TestHooks.capeTexture());
				if (!texture.equals("slashclient-hud:textures/cape/" + cape + ".png")) throw new AssertionError("Not the supporter's cape: " + texture);
				context.takeScreenshot("supporter-" + cape);
			}
			world.getServer().runCommand("item replace entity @a armor.chest with elytra");
			context.runOnClient(mc -> TestHooks.wear("elytra", "supporter_wings"));
			context.waitTicks(10);
			context.takeScreenshot("supporter-elytra");
			world.getServer().runCommand("item replace entity @a armor.chest with air");
			context.runOnClient(mc -> TestHooks.wear("elytra", null));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
