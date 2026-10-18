package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** The helpers in a world: the TNT timer, damage numbers, the nick hider and drop protection. */
public class GameAids implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			// lit TNT in front of us: its seconds above it
			world.getServer().runCommand("execute as @p at @s run summon tnt ^ ^ ^5 {fuse:80}");
			context.waitTicks(10);
			String label = context.computeOnClient(mc -> TestHooks.tntLabel());
			if (!label.endsWith(" s")) throw new AssertionError("No timer above the TNT: " + label);
			context.takeScreenshot("aids-tnt");
			world.getServer().runCommand("kill @e[type=tnt]");
			// a zombie hit: the damage rises from it
			world.getServer().runCommand("execute as @p at @s run summon zombie ^ ^ ^4 {NoAI:1b}");
			context.waitTicks(10);
			world.getServer().runCommand("damage @e[type=zombie,limit=1] 5");
			context.waitTicks(3);
			if (context.computeOnClient(mc -> TestHooks.damagePops()) < 1) throw new AssertionError("No damage number for the hit");
			context.takeScreenshot("aids-damage");
			world.getServer().runCommand("kill @e[type=zombie]");
			// our nick written as "Ty" (the test plays in Polish or English: either word)
			String hidden = context.computeOnClient(mc -> TestHooks.hiddenNick(true));
			String shown = context.computeOnClient(mc -> TestHooks.hiddenNick(false));
			if (!hidden.matches("<(Ty|You)> hej") || shown.equals(hidden)) throw new AssertionError("Nick not hidden: " + hidden + " / " + shown);
			// a sword needs a second Q, dirt does not
			String guarded = context.computeOnClient(mc -> TestHooks.dropGuarded());
			if (!guarded.equals("true,false")) throw new AssertionError("Drop protection picked wrong items: " + guarded);
			// a scrollbar follows the mouse: dragged 70 of 133 px of track, then clicked at its very end
			String bar = context.computeOnClient(mc -> TestHooks.scrollbarDrag());
			String[] parts = bar.split(",");
			if (!parts[0].equals("true") || Integer.parseInt(parts[1]) < 150 || Integer.parseInt(parts[2]) < 390) throw new AssertionError("The scrollbar does not follow the mouse: " + bar);
			// SlashClient's keys in its own window
			context.runOnClient(mc -> TestHooks.audit(true));
			int keys = context.computeOnClient(mc -> TestHooks.openKeybinds());
			if (keys < 5) throw new AssertionError("The keys window lists only " + keys + " keys");
			context.waitTicks(5);
			context.takeScreenshot("aids-keybinds");
			context.runOnClient(mc -> TestHooks.reportAudit());
			context.runOnClient(mc -> TestHooks.audit(false));
			context.setScreen(() -> null);
		}
	}
}
