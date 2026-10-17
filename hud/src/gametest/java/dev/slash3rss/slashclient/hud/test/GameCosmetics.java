package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** A SlashClient cape on our own player (cape and elytra), an emote by the name, and the emote wheel. */
public class GameCosmetics implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", false));
			context.waitTicks(10);
			String texture = context.computeOnClient(mc -> TestHooks.capeTexture());
			if (!texture.equals("slashclient-hud:textures/cape/galaxy.png")) throw new AssertionError("The cape is not ours: " + texture);
			context.takeScreenshot("cosmetics-cape");
			world.getServer().runCommand("item replace entity @a armor.chest with elytra");
			context.waitTicks(10);
			context.takeScreenshot("cosmetics-elytra");
			// the SlashClient cape: the logo on the cape, the logo's cut as a chevron on the elytra
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("slash", false));
			context.waitTicks(10);
			context.takeScreenshot("cosmetics-logo-elytra");
			world.getServer().runCommand("item replace entity @a armor.chest with air");
			context.waitTicks(10);
			context.takeScreenshot("cosmetics-logo-cape");
			// an emote by the name, looking at the player's face
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("slash", true));
			context.runOnClient(mc -> TestHooks.emoteSelf("heart"));
			context.waitTicks(5);
			context.takeScreenshot("cosmetics-emote");
			context.runOnClient(mc -> TestHooks.firstPerson());
			context.runOnClient(mc -> TestHooks.audit(true));
			context.runOnClient(mc -> TestHooks.emoteWheel());
			context.waitTicks(5);
			context.takeScreenshot("cosmetics-wheel");
			context.runOnClient(mc -> TestHooks.reportAudit());
			context.runOnClient(mc -> TestHooks.audit(false));
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.runOnClient(mc -> TestHooks.firstPerson());
		}
	}
}
