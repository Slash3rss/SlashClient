package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Several ranks per player: the logo by the name in the colour of the rank the player picked, as the
 * server sends it (any rank, also one made in the admin panel), on the nametag (F5), the tab list
 * and in the chat; and a rank unknown to this HUD without a colour falls back to the white logo.
 */
public class GameRanks implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			// an objective on the list: the tab list shows in singleplayer too
			world.getServer().runCommand("scoreboard objectives add ranks dummy");
			world.getServer().runCommand("scoreboard objectives setdisplay list ranks");
			context.runOnClient(mc -> TestHooks.thirdPerson(true));
			// the shown rank as the player picks it: a first rank in its own colour, then ones from the panel
			String[][] picks = {
				{"partner (bez koloru, stary serwer)", "partner", "-1"},
				{"VIP (z panelu)", "vip", "0x14B8A6"},
				{"Tester (z panelu)", "tester", "0xA855F7"},
				{"Support (kolor zmieniony w panelu)", "support", "0x0EA5E9"},
				{"nieznana bez koloru", "nowa", "-1"},
			};
			for (String[] p : picks) {
				int color = Integer.decode(p[2]);
				context.runOnClient(mc -> TestHooks.chosenRank(p[0], p[1], color));
			}
			for (String shot : new String[] {"tester", "vip"}) {
				int color = shot.equals("vip") ? 0x14B8A6 : 0xA855F7;
				context.runOnClient(mc -> TestHooks.chosenRank("wybrana: " + shot, shot, color));
				context.getInput().holdKey(o -> o.keyPlayerList);
				context.waitTicks(20);
				context.takeScreenshot("ranks-chosen-" + shot);
				context.getInput().releaseKey(o -> o.keyPlayerList);
			}
			context.runOnClient(mc -> TestHooks.chosenRank("bez odznaki", null, -1));
			context.runOnClient(mc -> TestHooks.thirdPerson(false));
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
