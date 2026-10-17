package dev.slash3rss.slashclient.hud;

//#if MC < 1.21.9
//$ /**
//$  * Before 1.21.9 the game handed mouse and key input to screens as plain numbers; these stand
//$  * in for its later event records (net.minecraft.client.input), so the screens read the same.
//$  * The version files point that package here.
//$  */
//$ public final class OldInput {
//$ 	private OldInput() {}
//$
//$ 	public record MouseButtonInfo(int button, int modifiers) {}
//$
//$ 	public record MouseButtonEvent(double x, double y, MouseButtonInfo buttonInfo) {
//$ 		public MouseButtonEvent(double x, double y, int button) {
//$ 			this(x, y, new MouseButtonInfo(button, 0));
//$ 		}
//$
//$ 		public int button() {
//$ 			return buttonInfo.button();
//$ 		}
//$ 	}
//$
//$ 	public record KeyEvent(int key, int scancode, int modifiers) {}
//$ }
//#endif
