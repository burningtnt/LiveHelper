package net.burningtnt.livehelper.mixin;

import com.mojang.blaze3d.textures.GpuTextureView;
import net.burningtnt.livehelper.LiveHelper;
import net.burningtnt.livehelper.live.ActiveStreamRenderer;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(targets = "com.mojang.blaze3d.opengl.GlCommandEncoder")
public class GlCommandEncoderMixin {
    @Shadow
    @Final
    private int drawFbo;

    @Inject(method = "presentTexture", at = @At("TAIL"))
    private void afterPresentTexture(GpuTextureView textureView, CallbackInfo ci) {
        ActiveStreamRenderer.ActiveInstance active = ActiveStreamRenderer.getActive();
        if (active != null) {
            active.sendFrame(this.drawFbo, textureView.getWidth(0), textureView.getHeight(0));
        }
    }
}
