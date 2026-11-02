package dev.slash3rss.slashclient.hud.testing;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.world.XpCalcScreen;
import dev.slash3rss.slashclient.hud.world.XpMath;

import net.minecraft.client.Minecraft;
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.skyup.SkyXp;
import dev.slash3rss.slashclient.hud.skyup.SkyXpScreen;
//#endif

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
		c.skyXpGens = 8;
		c.skyXpUnbreakingLevel = 3;
		c.skyXpMuted = true;
		c.placement("skyxp").enabled = true;
		SkyXp.reset();
		var mc = Minecraft.getInstance();
		SkyXpScreen screen = new SkyXpScreen(null);
		mc.setScreenAndShow(screen);
		XpMath.Bottling b = XpMath.bottling(30, 52);
		return screen.command() + " | " + b.bottles() + " " + b.left() + " " + b.leftLevel().level() + "/" + b.leftLevel().into() + "/" + b.leftLevel().next() + " " + b.tax();
	}

	/** The mending assistant's safe and high numbers for 8 and 16 generators, Unbreaking III–VI, a 12 s clock; then 10 generators, Unbreaking II, 20 s. */
	public static String mending() {
		StringBuilder out = new StringBuilder();
		for (int gens : XpMath.GENERATORS) for (int u : XpMath.UNBREAKING) {
			XpMath.Mending m = XpMath.mending(gens, u, 12);
			out.append(m.safe()).append('/').append(m.high()).append(' ');
		}
		XpMath.Mending own = XpMath.mending(10, 2, 20);
		return out.append(own.low()).append('-').append(own.max()).toString();
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
