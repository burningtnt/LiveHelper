package net.burningtnt.livehelper.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.sugar.Share;
import com.llamalad7.mixinextras.sugar.ref.LocalIntRef;
import com.mojang.blaze3d.textures.GpuTextureView;
import net.burningtnt.livehelper.api.SpoutRenderer;
import org.objectweb.asm.Opcodes;
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

    @Inject(method = "presentTexture", at = @At("HEAD"))
    private void beforePresentTexture(GpuTextureView textureView, CallbackInfo ci, @Share("fbo") LocalIntRef fbo) {
        fbo.set(SpoutRenderer.modifyTarget(this.drawFbo));
    }

    @ModifyExpressionValue(
            method = "presentTexture",
            at = @At(
                    value = "FIELD",
                    opcode = Opcodes.GETFIELD,
                    target = "Lcom/mojang/blaze3d/opengl/GlCommandEncoder;drawFbo:I"
            )
    )
    private int afterPresentTexture(int original, @Share("fbo") LocalIntRef fbo) {
        return fbo.get();
    }

    @Inject(method = "presentTexture", at = @At("TAIL"))
    private void afterPresentTexture(GpuTextureView textureView, CallbackInfo ci) {
        SpoutRenderer.afterPresentTexture(textureView);
    }
}
