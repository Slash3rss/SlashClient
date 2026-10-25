package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;

/** For the game test of the XP calculators (GameXpCalc): the sums, the windows, the SkyUp countdown. */
public final class XpTestHooks {
	private XpTestHooks() {}

	/** The sums as the website's: "total(30) toNext(30) level(1500)". */
	public static String sums() {
		XpMath.Level l = XpMath.level(1500);
		return XpMath.total(30) + " " + XpMath.toNext(30) + " " + XpMath.total(16) + " " + XpMath.total(31) + " " + l.level() + "/" + l.into() + "/" + l.next();
	}

	public static void open() {
		var mc = Minecraft.getInstance();
		XpCalcScreen screen = new XpCalcScreen(null);
		mc.setScreenAndShow(screen);
		screen.typeForTest("30", "1500", "10", "30");
	}

	/** What the layout audit found ("" when everything fits). */
	public static String problems() {
		return String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS);
	}

	//#if MC >= 26.3
	/** SkyUp's calculator as the website opens it: level 30, 52 XP a bottle, 12 s, from the level. */
	public static String openSky() {
		HudConfig c = SlashHud.config;
		c.skyXpLevel = 30;
		c.skyXpBottle = 52;
		c.skyXpInterval = 12;
		c.skyXpFromLevel = true;
		c.skyXpGenerators = "8x";
		c.skyXpUnbreaking = "III";
		c.skyXpMuted = true;
		c.placement("skyxp").enabled = true;
		SkyXp.reset();
		var mc = Minecraft.getInstance();
		SkyXpScreen screen = new SkyXpScreen(null);
		mc.setScreenAndShow(screen);
		XpMath.Bottling b = XpMath.bottling(30, 52);
		return screen.command() + " | " + b.bottles() + " " + b.left() + " " + b.leftLevel().level() + "/" + b.leftLevel().into() + "/" + b.leftLevel().next() + " " + b.tax();
	}

	/** The countdown started as the calculator's Start would, a session of `seconds` with a clock of `clock`. */
	public static void startSky(long seconds, int clock) {
		SkyXp.start(seconds, clock);
	}

	public static String sky() {
		return SkyXp.debug() + " shown " + new SkyXp.Module().visible(Minecraft.getInstance());
	}

	public static void stopSky() {
		SkyXp.reset();
	}
	//#endif
}
