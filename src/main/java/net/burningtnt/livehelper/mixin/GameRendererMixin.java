package net.burningtnt.livehelper.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import net.burningtnt.livehelper.api.ActiveStreamImpl;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.state.GameRenderState;
import net.minecraft.client.renderer.state.WindowRenderState;
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

    @Shadow
    @Final
    private Minecraft minecraft;

    @WrapWithCondition(
            method = "extract",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/client/renderer/GameRenderer;extractGui(Lnet/minecraft/client/DeltaTracker;ZZ)V"
            )
    )
    private boolean beforeExtractGUI(GameRenderer gameRenderer, DeltaTracker deltaTracker, boolean shouldRenderLevel, boolean resourcesLoaded) {
        ActiveStreamImpl.ActiveInstance instance = ActiveStreamImpl.getActive();
        if (instance == null) {
            return true;
        }

        this.gameRenderState.guiRenderState.reset();
        return false;
    }

    @WrapWithCondition(
            method = "renderLevel",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/client/renderer/GameRenderer;renderItemInHand(Lnet/minecraft/client/renderer/state/level/CameraRenderState;FLorg/joml/Matrix4fc;)V"
            )
    )
    private boolean beforeRenderHand(GameRenderer gameRenderer, CameraRenderState cameraState, float deltaPartialTick, Matrix4fc modelViewMatrix) {
        ActiveStreamImpl.ActiveInstance instance = ActiveStreamImpl.getActive();
        return instance == null;
    }

    @WrapMethod(method = "extractWindow")
    private void onExtractWindow(Operation<Void> original) {
        if (!ActiveStreamImpl.hasActive()) {
            original.call();
            return;
        }

        WindowRenderState windowState = this.gameRenderState.windowRenderState;

        ActiveStreamImpl.ActiveInstance instance = ActiveStreamImpl.getActive();
        if (instance == null) {
            original.call();
        } else {
            windowState.width = instance.config().width();
            windowState.height = instance.config().height();
            windowState.guiScale = this.minecraft.getWindow().getGuiScale();
            windowState.appropriateLineWidth = Math.max(2.5F, instance.config().width() / 1920.0F * 2.5F);
            windowState.isMinimized = false;
        }

        windowState.isResized = true;
    }
}
