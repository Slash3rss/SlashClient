//#if MC < 1.21.2
//$ package dev.slash3rss.slashclient.hud.compat;
//$
//$ /** A key press as newer versions pass it; 1.21.1 hands over the key code, scan code and modifiers. */
//$ public record KeyEvent(int key, int scancode, int modifiers) {
//$ 	public boolean hasShiftDown() {
//$ 		return (modifiers & org.lwjgl.glfw.GLFW.GLFW_MOD_SHIFT) != 0;
//$ 	}
//$
//$ 	public boolean hasControlDown() {
//$ 		return (modifiers & org.lwjgl.glfw.GLFW.GLFW_MOD_CONTROL) != 0;
//$ 	}
//$ }
//#endif
