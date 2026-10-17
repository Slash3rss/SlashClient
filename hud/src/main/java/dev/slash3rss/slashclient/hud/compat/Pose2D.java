//#if MC < 1.21.6
//$ package dev.slash3rss.slashclient.hud.compat;
//$
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import net.minecraft.client.gui.GuiGraphics;
//$
//$ /**
//$  * The GUI's 2D pose as newer versions have it (a Matrix3x2fStack), over the PoseStack 1.21.1–1.21.5
//$  * draws the GUI with; `g.pose()` in the shared code becomes `Pose2D.of(g)`.
//$  */
//$ public final class Pose2D {
//$ 	private final PoseStack pose;
//$
//$ 	private Pose2D(PoseStack pose) {
//$ 		this.pose = pose;
//$ 	}
//$
//$ 	public static Pose2D of(GuiGraphics graphics) {
//$ 		return new Pose2D(graphics.pose());
//$ 	}
//$
//$ 	public Pose2D pushMatrix() {
//$ 		pose.pushPose();
//$ 		return this;
//$ 	}
//$
//$ 	public Pose2D popMatrix() {
//$ 		pose.popPose();
//$ 		return this;
//$ 	}
//$
//$ 	public Pose2D translate(float x, float y) {
//$ 		pose.translate(x, y, 0f);
//$ 		return this;
//$ 	}
//$
//$ 	public Pose2D scale(float x, float y) {
//$ 		pose.scale(x, y, 1f);
//$ 		return this;
//$ 	}
//$
//$ 	/** Turns by `angle` radians. */
//$ 	public Pose2D rotate(float angle) {
//$ 		pose.mulPose(com.mojang.math.Axis.ZP.rotation(angle));
//$ 		return this;
//$ 	}
//$
//$ 	/** Where a point lands on screen (changes and returns `v`). */
//$ 	public org.joml.Vector2f transformPosition(org.joml.Vector2f v) {
//$ 		org.joml.Vector4f p = pose.last().pose().transform(new org.joml.Vector4f(v.x, v.y, 0f, 1f));
//$ 		return v.set(p.x, p.y);
//$ 	}
//$ }
//#endif
