package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 26.3
import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import dev.slash3rss.slashclient.hud.camera.VncMouse;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif

/**
 * "Myszka przez VNC" (camera.VncMouse): with the cursor taken by the game, its turn comes from where the
 * cursor moved, not from the mouse's own movement a remote desktop does not send, and at the window's edges
 * the camera keeps turning. Before 26.3 the mouse goes through GLFW and this mixin is empty.
 */
@Mixin(MouseHandler.class)
abstract class VncMouseMixin {
	//#if MC >= 26.3
	@Shadow
	@Final
	private Minecraft minecraft;
	@Shadow
	private double xpos;
	@Shadow
	private double ypos;
	@Shadow
	private double accumulatedDX;
	@Shadow
	private double accumulatedDY;
	@Shadow
	private boolean mouseGrabbed;
	@Unique
	private long slashclient$edgeAt;

	@WrapMethod(method = "onMove")
	private void slashclient$vncMove(long window, double x, double y, double dx, double dy, Operation<Void> original) {
		// the turn from the cursor's own place (a remote desktop moves it, the movement it does not send)
		if (VncMouse.on() && mouseGrabbed) original.call(window, x, y, x - xpos, y - ypos);
		else original.call(window, x, y, dx, dy);
	}

	@Inject(method = "handleAccumulatedMovement", at = @At("HEAD"))
	private void slashclient$vncEdges(CallbackInfo ci) {
		long now = System.nanoTime();
		double seconds = slashclient$edgeAt == 0 ? 0 : Math.min(0.1, (now - slashclient$edgeAt) / 1e9);
		slashclient$edgeAt = now;
		if (!VncMouse.on() || !mouseGrabbed || !minecraft.isWindowActive()) return;
		var w = minecraft.getWindow();
		double[] turn = VncMouse.edgeTurn(xpos, ypos, w.getScreenWidth(), w.getScreenHeight(), seconds, VncMouse.edgeSpeedNow());
		accumulatedDX += turn[0];
		accumulatedDY += turn[1];
	}
	//#endif
}
