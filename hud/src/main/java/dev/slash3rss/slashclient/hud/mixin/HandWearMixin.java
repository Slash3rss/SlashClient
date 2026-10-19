package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.slash3rss.slashclient.hud.LimbWear;
import net.minecraft.client.model.geom.ModelPart;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The hands' items (gloves, a ring, a watch) on our own arm wherever first person draws it ({@link LimbWear#firstPerson}). */
//#if MC >= 1.21.9
@Mixin(net.minecraft.client.renderer.entity.player.AvatarRenderer.class)
//#else
//$ @Mixin(net.minecraft.client.renderer.entity.player.PlayerRenderer.class)
//#endif
abstract class HandWearMixin {
	//#if MC >= 1.21.2
	@Inject(method = "renderHand", at = @At("TAIL"))
	private void slashclient$handWear(PoseStack pose, net.minecraft.client.renderer.SubmitNodeCollector out, int light, net.minecraft.resources.Identifier skin,
			ModelPart arm, boolean sleeve, CallbackInfo ci) {
		// only our own arm is drawn this way
		LimbWear.firstPerson(pose, out, light, arm, net.minecraft.client.Minecraft.getInstance().player);
	}
	//#else
	//$ @Inject(method = "renderHand", at = @At("TAIL"))
	//$ private void slashclient$handWear(PoseStack pose, net.minecraft.client.renderer.MultiBufferSource out, int light, net.minecraft.client.player.AbstractClientPlayer player,
	//$ 		ModelPart arm, ModelPart sleeve, CallbackInfo ci) {
	//$ 	LimbWear.firstPerson(pose, out, light, arm, player);
	//$ }
	//#endif
}
