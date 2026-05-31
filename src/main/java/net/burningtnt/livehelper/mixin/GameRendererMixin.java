package net.burningtnt.livehelper.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import net.burningtnt.livehelper.live.ActiveStreamRenderer;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.state.GameRenderState;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import org.joml.Matrix4fc;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(GameRenderer.class)
public class GameRendererMixin {
    @Shadow
    @Final
    private GameRenderState gameRenderState;

    @WrapWithCondition(
            method = "extract",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/client/renderer/GameRenderer;extractGui(Lnet/minecraft/client/DeltaTracker;ZZ)V"
            )
    )
    private boolean beforeExtractGUI(GameRenderer gameRenderer, DeltaTracker deltaTracker, boolean shouldRenderLevel, boolean resourcesLoaded) {
        ActiveStreamRenderer.ActiveInstance instance = ActiveStreamRenderer.getActive();
        if (instance != null && !instance.config().renderHUD()) {
            this.gameRenderState.guiRenderState.reset();
            return false;
        }

        return true;
    }

    @WrapWithCondition(
            method = "renderLevel",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/client/renderer/GameRenderer;renderItemInHand(Lnet/minecraft/client/renderer/state/level/CameraRenderState;FLorg/joml/Matrix4fc;)V"
            )
    )
    private boolean beforeRenderHand(GameRenderer gameRenderer, CameraRenderState cameraState, float deltaPartialTick, Matrix4fc modelViewMatrix) {
        ActiveStreamRenderer.ActiveInstance instance = ActiveStreamRenderer.getActive();
        return instance == null || instance.config().renderHand();
    }
}
