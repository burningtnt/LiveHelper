package net.burningtnt.livehelper.mixin;

import net.burningtnt.livehelper.api.ActiveStreamImpl;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.SkyRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(SkyRenderer.class)
public class SkyRendererMixin {
    @Inject(method = "shouldRenderDarkDisc", at = @At("HEAD"), cancellable = true)
    private void beforeShouldRenderDarkDisc(float deltaPartialTick, ClientLevel level, CallbackInfoReturnable<Boolean> cir) {
        ActiveStreamImpl.ActiveInstance active = ActiveStreamImpl.getActive();
        if (active != null) {
            cir.setReturnValue(false);
        }
    }
}
