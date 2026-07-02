package net.burningtnt.livehelper.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import net.burningtnt.livehelper.MainScheduler;
import net.burningtnt.livehelper.api.ActiveStreamImpl;
import net.burningtnt.livehelper.server.UIOperationRequest;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.concurrent.TimeUnit;

@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
    @Shadow
    protected abstract void runTick(boolean advanceGameTime);

    @Shadow
    @Final
    public GameRenderer gameRenderer;

    @WrapWithCondition(
            method = "renderFrame",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/client/FramerateLimiter;limitDisplayFPS(I)V"
            )
    )
    private boolean shouldLimitDisplayFPS(int framerateLimit) {
        return false;
    }

    @Inject(method = "run", at = @At("HEAD"))
    private void beforeRun(CallbackInfo ci) {
        MainScheduler.submitTask(System.nanoTime(), new MainScheduler.ExecutableTask() {
            @Override
            public void run(boolean isOutOfMemoryRecovery, long startNs) {
                runTick(!isOutOfMemoryRecovery);

                int frameRate = ActiveStreamImpl.hasActive() ? 15 : MinecraftMixin.this.gameRenderer.getGameRenderState().framerateLimit;
                if (frameRate < 260) {
                    MainScheduler.submitTask(startNs + TimeUnit.SECONDS.toNanos(1) / frameRate, this);
                } else {
                    MainScheduler.submitTask(System.nanoTime(), this);
                }
            }
        });
    }

    @Redirect(
            method = "run",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/client/Minecraft;runTick(Z)V"
            )
    )
    private void onTick(Minecraft instance, boolean advanceGameTime) {
        MainScheduler.tick(!advanceGameTime);
    }

    @Inject(method = "pauseGame", at = @At("HEAD"), cancellable = true)
    private void beforePauseGame(boolean suppressPauseMenuIfWeReallyArePausing, CallbackInfo ci) {
        if (UIOperationRequest.onEscape()) {
            ci.cancel();
        }
    }
}
