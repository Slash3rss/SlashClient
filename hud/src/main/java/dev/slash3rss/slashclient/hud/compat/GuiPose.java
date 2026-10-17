package dev.slash3rss.slashclient.hud.compat;

//#if MC < 1.21.6
//$ /**
//$  * Before 1.21.6 the GUI was drawn through a 3D PoseStack; this gives it the 2D calls of the later
//$  * Matrix3x2fStack (`g.pose()` is pointed here by versions/<mc>.properties).
//$  */
//$ public final class GuiPose {
//$ 	private final com.mojang.blaze3d.vertex.PoseStack pose;
//$
//$ 	private GuiPose(com.mojang.blaze3d.vertex.PoseStack pose) {
//$ 		this.pose = pose;
//$ 	}
//$
//$ 	public static GuiPose of(net.minecraft.client.gui.GuiGraphics graphics) {
//$ 		return new GuiPose(graphics.pose());
//$ 	}
//$
//$ 	public GuiPose pushMatrix() {
//$ 		pose.pushPose();
//$ 		return this;
//$ 	}
//$
//$ 	public GuiPose popMatrix() {
//$ 		pose.popPose();
//$ 		return this;
//$ 	}
//$
//$ 	public GuiPose translate(float x, float y) {
//$ 		pose.translate(x, y, 0);
//$ 		return this;
//$ 	}
//$
//$ 	public GuiPose scale(float x, float y) {
//$ 		pose.scale(x, y, 1);
//$ 		return this;
//$ 	}
//$
//$ 	public org.joml.Vector2f transformPosition(org.joml.Vector2f v) {
//$ 		org.joml.Vector3f p = pose.last().pose().transformPosition(new org.joml.Vector3f(v.x, v.y, 0));
//$ 		return v.set(p.x, p.y);
//$ 	}
//$ }
//#endif
