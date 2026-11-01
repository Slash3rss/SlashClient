package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.blaze3d.platform.InputConstants;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 26.3
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.slash3rss.slashclient.hud.camera.VncMouse;
import org.lwjgl.sdl.SDLMouse;
import org.spongepowered.asm.mixin.injection.At;
//#endif

/**
 * "Myszka przez VNC" (camera.VncMouse): the game taking the cursor only hides it and keeps it in the window,
 * instead of locking it – a locked cursor gets only movement, which a remote desktop does not send. Before
 * 26.3 the mouse goes through GLFW and this mixin is empty.
 */
@Mixin(InputConstants.class)
abstract class VncCursorMixin {
	//#if MC >= 26.3
	@WrapOperation(method = { "grabMouse", "releaseMouse" }, at = @At(value = "INVOKE", target = "Lorg/lwjgl/sdl/SDLMouse;SDL_SetWindowRelativeMouseMode(JZ)Z", remap = false))
	private static boolean slashclient$vncCursor(long window, boolean relative, Operation<Boolean> original) {
		if (relative && VncMouse.on()) {
			VncMouse.taken = true;
			SDLMouse.SDL_HideCursor();
			org.lwjgl.sdl.SDLVideo.SDL_SetWindowMouseGrab(window, true);
			return true;
		}
		if (!relative && VncMouse.taken) {
			// let go as it was taken (the mode may have been switched off since)
			VncMouse.taken = false;
			SDLMouse.SDL_ShowCursor();
			org.lwjgl.sdl.SDLVideo.SDL_SetWindowMouseGrab(window, false);
			return true;
		}
		return original.call(window, relative);
	}
	//#endif
}
