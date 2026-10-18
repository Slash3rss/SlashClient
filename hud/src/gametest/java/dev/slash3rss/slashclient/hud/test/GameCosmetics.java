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
			// an animated cape: its frames take turns
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("aurora", false));
			context.waitTicks(2);
			String first = context.computeOnClient(mc -> TestHooks.capeTexture());
			if (!first.matches("slashclient-hud:textures/cape/aurora_[0-7]\\.png")) throw new AssertionError("Not a frame of the animated cape: " + first);
			context.waitTicks(4);
			if (first.equals(context.computeOnClient(mc -> TestHooks.capeTexture()))) throw new AssertionError("The animated cape does not move: " + first);
			context.takeScreenshot("cosmetics-animated");
			// an elytra of its own, over the cape's picture
			world.getServer().runCommand("item replace entity @a armor.chest with elytra");
			context.runOnClient(mc -> TestHooks.wear("elytra", "neon"));
			context.waitTicks(10);
			context.takeScreenshot("cosmetics-own-elytra");
			world.getServer().runCommand("item replace entity @a armor.chest with air");
			context.runOnClient(mc -> TestHooks.wear("elytra", null));
			// wings take the cape's place; a pet at the shoulder; an aura while standing still
			context.runOnClient(mc -> TestHooks.wear("wings", "angel"));
			context.runOnClient(mc -> TestHooks.wear("pet", "allay"));
			context.runOnClient(mc -> TestHooks.wear("aura", "souls"));
			context.waitTicks(30);
			if (!context.computeOnClient(mc -> TestHooks.capeTexture()).equals("none")) throw new AssertionError("The cape shows under the wings");
			context.takeScreenshot("cosmetics-wings-back");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("aurora", true));
			context.waitTicks(10);
			context.takeScreenshot("cosmetics-wings-front");
			for (String pet : new String[] {"vex", "bat", "parrot", "bee"}) {
				context.runOnClient(mc -> TestHooks.wear("pet", pet));
				context.runOnClient(mc -> TestHooks.wear("wings", pet.equals("bat") ? "demon" : pet.equals("bee") ? "butterfly" : "dragon"));
				context.waitTicks(5);
				context.takeScreenshot("cosmetics-pet-" + pet);
			}
			// the newer ones: two pets with new wings, a new aura, and a new animated cape
			for (String pet : new String[] {"blaze", "phantom"}) {
				context.runOnClient(mc -> TestHooks.wear("pet", pet));
				context.runOnClient(mc -> TestHooks.wear("wings", pet.equals("blaze") ? "prism" : "batwing"));
				context.waitTicks(5);
				context.takeScreenshot("cosmetics-pet-" + pet);
			}
			context.runOnClient(mc -> TestHooks.wear("wings", "frost"));
			context.runOnClient(mc -> TestHooks.wear("aura", "sculk"));
			context.waitTicks(30);
			context.takeScreenshot("cosmetics-new-aura");
			context.runOnClient(mc -> TestHooks.wear("wings", null));
			context.runOnClient(mc -> TestHooks.wear("pet", null));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("matrix", false));
			context.waitTicks(2);
			String matrix = context.computeOnClient(mc -> TestHooks.capeTexture());
			if (!matrix.matches("slashclient-hud:textures/cape/matrix_[0-7][.]png")) throw new AssertionError("Not a frame of the matrix cape: " + matrix);
			context.takeScreenshot("cosmetics-new-cape");
			// the 0.9.2 ones: three pets with new wings, new auras, and a new animated cape
			for (String pet : new String[] {"axolotl", "frog", "fox"}) {
				context.runOnClient(mc -> TestHooks.wear("pet", pet));
				context.runOnClient(mc -> TestHooks.wear("wings", pet.equals("axolotl") ? "fairy" : pet.equals("frog") ? "bone" : "gilded"));
				context.runOnClient(mc -> TestHooks.wear("aura", pet.equals("axolotl") ? "spores" : pet.equals("frog") ? "tears" : "nautilus"));
				context.waitTicks(30);
				context.takeScreenshot("cosmetics-pet-" + pet);
			}
			context.runOnClient(mc -> TestHooks.wear("wings", null));
			context.runOnClient(mc -> TestHooks.wear("pet", null));
			context.runOnClient(mc -> TestHooks.wear("aura", "fireflies"));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("vortex", false));
			context.waitTicks(30);
			String vortex = context.computeOnClient(mc -> TestHooks.capeTexture());
			if (!vortex.matches("slashclient-hud:textures/cape/vortex_[0-7][.]png")) throw new AssertionError("Not a frame of the vortex cape: " + vortex);
			context.takeScreenshot("cosmetics-new-cape-vortex");
			context.runOnClient(mc -> TestHooks.wear("aura", "souls"));
			// the main menu's figure wears them too: the cape or the wings behind it, the pet by it
			context.runOnClient(mc -> { TestHooks.wearOwn("cape", "aurora"); TestHooks.wearOwn("pet", "parrot"); });
			context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
			context.waitTicks(10);
			context.takeScreenshot("cosmetics-menu-figure-cape");
			context.runOnClient(mc -> { TestHooks.wearOwn("wings", "dragon"); TestHooks.wearOwn("pet", "bee"); });
			context.waitTicks(5);
			context.takeScreenshot("cosmetics-menu-figure-wings");
			context.runOnClient(mc -> { TestHooks.wearOwn("wings", null); TestHooks.wearOwn("pet", null); TestHooks.wearOwn("cape", null); });
			context.setScreen(() -> null);
			// the menu in the game, on two slots
			context.runOnClient(mc -> TestHooks.audit(true));
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("cape"));
			context.waitTicks(5);
			context.takeScreenshot("cosmetics-menu-capes");
			// more capes than fit: the grid scrolls to the last ones
			context.runOnClient(mc -> TestHooks.scrollCosmetics());
			context.waitTicks(3);
			context.takeScreenshot("cosmetics-menu-capes-end");
			context.runOnClient(mc -> TestHooks.cosmeticsMenu("pet"));
			context.waitTicks(5);
			context.takeScreenshot("cosmetics-menu-pets");
			context.runOnClient(mc -> TestHooks.reportAudit());
			context.runOnClient(mc -> TestHooks.audit(false));
			context.setScreen(() -> null);
			context.runOnClient(mc -> { TestHooks.wear("wings", null); TestHooks.wear("pet", null); TestHooks.wear("aura", null); });
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
