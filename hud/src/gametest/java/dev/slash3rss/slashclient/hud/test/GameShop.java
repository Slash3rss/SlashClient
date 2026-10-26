package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * The Sparks shop in the cosmetics menu (no launcher: a made-up catalog and purchase): the balance,
 * the shop's capes and wings with their prices and locks (one of each already bought), a price's
 * tooltip, the "buy it?" box opened by a click with enough Sparks and without, a purchase (the
 * Sparks taken, the item ours and worn, its toast), the 'wallet' event updating the balance, and the
 * toasts of achievements that pay Sparks: alone, with a cape, quiet ones and their summary. In
 * Polish, then the menu and the box again in English.
 */
public class GameShop implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		language(context, "pl_pl");
		context.getInput().setCursorPos(4, 4);
		context.runOnClient(mc -> TestHooks.shopMenu("cape", 1250));
		context.runOnClient(mc -> TestHooks.scrollCosmetics());
		context.getInput().setCursorPos(4, 4);
		context.waitTicks(10);
		context.takeScreenshot("shop-cape");
		// a price's tooltip: the name, the price and how to buy
		hover(context, "thunder");
		context.takeScreenshot("shop-cape-tooltip");
		// a SkyUp.pl cape earned with an achievement: a lock, and the achievement in its tooltip
		hover(context, "skyup_noc");
		context.takeScreenshot("shop-cape-skyup-locked");
		context.getInput().setCursorPos(4, 4);
		context.runOnClient(mc -> TestHooks.cosmeticsSlot("wings"));
		context.runOnClient(mc -> TestHooks.scrollCosmetics());
		context.waitTicks(5);
		context.takeScreenshot("shop-wings");

		// a click on a shop item opens the box (enough Sparks); an owned one is worn as usual, no box
		click(context, "emberstar", "cape");
		if (!state(context, "emberstar").startsWith("1250|true|false")) throw new AssertionError("A click on a shop item did not open the box: " + state(context, "emberstar"));
		context.getInput().setCursorPos(4, 4);
		context.waitTicks(5);
		context.takeScreenshot("shop-buy");
		// Escape closes only the box
		context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_ESCAPE);
		context.waitTicks(2);
		if (!state(context, "emberstar").startsWith("1250|false|false")) throw new AssertionError("Escape did not close the box: " + state(context, "emberstar"));
		if (!context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc) instanceof dev.slash3rss.slashclient.hud.cosmetics.CosmeticsScreen))
			throw new AssertionError("Escape on the box closed the menu");
		if (context.computeOnClient(mc -> TestHooks.shopOffer("coral"))) throw new AssertionError("An owned item offered for sale");

		// not enough Sparks: how many are missing, Buy greyed out
		context.runOnClient(mc -> TestHooks.shopMenu("wings", 300));
		context.runOnClient(mc -> TestHooks.scrollCosmetics());
		context.waitTicks(3);
		if (!context.computeOnClient(mc -> TestHooks.shopOffer("emberwings"))) throw new AssertionError("No box for the ember wings");
		context.getInput().setCursorPos(4, 4);
		context.waitTicks(5);
		context.takeScreenshot("shop-buy-short");

		// bought: 600 of 1250 taken, the cape ours and worn, "Bought" toast
		context.runOnClient(mc -> TestHooks.cleanScreen());
		context.runOnClient(mc -> TestHooks.shopMenu("cape", 1250));
		context.runOnClient(mc -> TestHooks.scrollCosmetics());
		context.waitTicks(3);
		context.runOnClient(mc -> TestHooks.shopOffer("emberstar"));
		context.getInput().setCursorPos(4, 4);
		int before = toasts(context);
		context.runOnClient(mc -> TestHooks.shopConfirm());
		context.waitTicks(20);
		String bought = state(context, "emberstar");
		if (!bought.equals("650|false|true|emberstar")) throw new AssertionError("Not bought and worn: " + bought);
		if (toasts(context) != before + 1) throw new AssertionError("No toast for the purchase");
		context.takeScreenshot("shop-bought");
		// the toast covers the balance: without it, 650 left
		context.runOnClient(mc -> TestHooks.cleanScreen());
		context.waitTicks(3);
		context.takeScreenshot("shop-bought-balance");
		// the server's 'wallet' event: the balance shown follows
		context.runOnClient(mc -> {
			try {
				TestHooks.walletEvent(2000, 1350);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
		context.waitTicks(3);
		if (!state(context, "emberstar").startsWith("2000|")) throw new AssertionError("The wallet event did not update the balance: " + state(context, "emberstar"));
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.cleanScreen());

		// achievement toasts with the Sparks they paid
		event(context, () -> TestHooks.achievementSparksToast(false, false));
		context.waitTicks(20);
		context.takeScreenshot("shop-toast-achievement");
		context.runOnClient(mc -> TestHooks.cleanScreen());
		event(context, () -> TestHooks.achievementSparksToast(true, false));
		context.waitTicks(20);
		context.takeScreenshot("shop-toast-achievement-cape");
		context.runOnClient(mc -> TestHooks.cleanScreen());
		// several at once: the single ones are quiet, one summary toast for them all
		before = toasts(context);
		for (int i = 0; i < 3; i++) event(context, () -> TestHooks.achievementSparksToast(false, true));
		if (toasts(context) != before) throw new AssertionError("A quiet achievement made a toast");
		event(context, () -> TestHooks.achievementsSummaryToast(5, 320));
		if (toasts(context) != before + 1) throw new AssertionError("No summary toast");
		context.waitTicks(20);
		context.takeScreenshot("shop-toast-summary");
		context.runOnClient(mc -> TestHooks.cleanScreen());
		// a daily challenge, a weekly one and the bonus for all of a day: a toast each
		before = toasts(context);
		event(context, () -> TestHooks.challengeToast(false));
		event(context, () -> TestHooks.challengeToast(true));
		event(context, () -> TestHooks.challengesBonusToast(30));
		if (toasts(context) != before + 3) throw new AssertionError("Challenge toasts: " + (toasts(context) - before));
		context.waitTicks(20);
		context.takeScreenshot("shop-toast-challenges");
		context.runOnClient(mc -> TestHooks.cleanScreen());

		// in English: the menu, a box and the summary
		language(context, "en_us");
		context.runOnClient(mc -> TestHooks.shopMenu("cape", 1250));
		context.runOnClient(mc -> TestHooks.scrollCosmetics());
		context.getInput().setCursorPos(4, 4);
		context.waitTicks(10);
		context.takeScreenshot("shop-cape-en");
		context.runOnClient(mc -> TestHooks.shopOffer("cosmos"));
		context.waitTicks(5);
		context.takeScreenshot("shop-buy-en");
		context.runOnClient(mc -> TestHooks.shopMenu("wings", 300));
		context.runOnClient(mc -> TestHooks.scrollCosmetics());
		context.waitTicks(3);
		context.runOnClient(mc -> TestHooks.shopOffer("emberwings"));
		context.waitTicks(5);
		context.takeScreenshot("shop-buy-short-en");
		context.setScreen(() -> null);
		event(context, () -> TestHooks.achievementsSummaryToast(5, 320));
		event(context, () -> TestHooks.achievementSparksToast(true, false));
		event(context, () -> TestHooks.challengeToast(false));
		context.waitTicks(20);
		context.takeScreenshot("shop-toasts-en");
		context.runOnClient(mc -> TestHooks.cleanScreen());
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private interface Event {
		void run() throws Exception;
	}

	private static void event(ClientGameTestContext context, Event e) {
		context.runOnClient(mc -> {
			try {
				e.run();
			} catch (Exception ex) {
				throw new RuntimeException(ex);
			}
		});
	}

	private static void language(ClientGameTestContext context, String code) {
		var done = context.computeOnClient(mc -> TestHooks.language(code));
		// the texts are reloaded behind the loading screen, which then fades out
		context.waitFor(mc -> done.isDone(), 1200);
		context.waitTicks(60);
	}

	private static String state(ClientGameTestContext context, String id) {
		return context.computeOnClient(mc -> TestHooks.shopState(id));
	}

	private static int toasts(ClientGameTestContext context) {
		return context.computeOnClient(mc -> Social.toastsForTest());
	}

	private static void hover(ClientGameTestContext context, String id) {
		double[] at = context.computeOnClient(mc -> TestHooks.shopTile(id));
		if (at == null) throw new AssertionError("No tile for " + id);
		context.getInput().setCursorPos(at[0], at[1]);
		context.waitTicks(8);
	}

	/** A real click on an item's tile (on its slot's tab). */
	private static void click(ClientGameTestContext context, String id, String slot) {
		context.runOnClient(mc -> TestHooks.cosmeticsSlot(slot));
		context.waitTick();
		context.runOnClient(mc -> TestHooks.scrollCosmetics());
		context.waitTicks(3);
		// more items after it (the SkyUp capes): up a row at a time until its tile is drawn
		// (then one more, so its row is not half under the tabs)
		if (context.computeOnClient(mc -> TestHooks.shopTile(id)) == null) {
			for (int i = 0; i < 20 && context.computeOnClient(mc -> TestHooks.shopTile(id)) == null; i++) {
				context.runOnClient(mc -> TestHooks.scrollCosmeticsBy(-40));
				context.waitTicks(2);
			}
			context.runOnClient(mc -> TestHooks.scrollCosmeticsBy(-60));
			context.waitTicks(2);
		}
		hover(context, id);
		context.getInput().holdMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTick();
		context.getInput().releaseMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTicks(2);
	}
}
