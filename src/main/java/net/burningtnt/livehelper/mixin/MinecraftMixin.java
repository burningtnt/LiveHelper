package net.burningtnt.livehelper.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import net.burningtnt.livehelper.MainScheduler;
import net.burningtnt.livehelper.live.ActiveStream;
import net.burningtnt.livehelper.live.ActiveStreamRenderer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.lang.ref.Reference;
import java.util.List;

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
        MainScheduler.ofFrame(() -> ActiveStreamRenderer.hasActive() ? 15 : this.gameRenderer.getGameRenderState().framerateLimit)
                .schedule((isOutOfMemoryRecovery, _) -> runTick(!isOutOfMemoryRecovery));

        Thread.ofPlatform().daemon().name("LiveHelper Debugger Evaluation").start(() -> {
            while (true) {
                Reference.reachabilityFence(null);
            }
        });

        ActiveStreamRenderer.activate(
                new ActiveStream.Config("ABOVE", 854, 480, 30, 2),
                _ -> {
                    LocalPlayer player = Minecraft.getInstance().player;
                    if (player == null) {
                        return null;
                    }

                    Vec3 position = player.position();
                    Quaternionf rotation = new Quaternionf()
                            .rotateX(-(float) (0.5 * Math.PI));

                    return List.of(
                            new ActiveStream.RenderStep.Render(
                                    new ActiveStream.FrameRequest(
                                            position.x + 16, position.y + 10, position.z + 16,
                                            rotation.x, rotation.y, rotation.z, rotation.w,
                                            80,
                                            false, false
                                    ),
                                    0
                            ),
                            new ActiveStream.RenderStep.Display(0)
                    );
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
}
