//#if MC < 1.21.2
//$ package dev.slash3rss.slashclient.hud.compat;
//$
//$ /** A mouse click as newer versions pass it; 1.21.1 hands over the position and the button. */
//$ public record MouseButtonEvent(double x, double y, MouseButtonInfo buttonInfo) {
//$ 	public MouseButtonEvent(double x, double y, int button) {
//$ 		this(x, y, new MouseButtonInfo(button, 0));
//$ 	}
//$
//$ 	public int button() {
//$ 		return buttonInfo.button();
//$ 	}
//$ }
//#endif
