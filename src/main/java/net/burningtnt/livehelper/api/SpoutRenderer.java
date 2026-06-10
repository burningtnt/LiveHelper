package net.burningtnt.livehelper.api;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.GpuTextureView;
import net.burningtnt.livehelper.util.spout.SpoutSender;
import org.jetbrains.annotations.ApiStatus;

@ApiStatus.Internal
public final class SpoutRenderer {
    private SpoutRenderer() {
    }

    private static final ScopedValue<SpoutSender> ACTIVATED_SENDER = ScopedValue.newInstance();

    public static void blitSend(SpoutSender sender, GpuTextureView textureView) {
        ScopedValue.where(ACTIVATED_SENDER, sender).run(() -> {
            RenderSystem.getDevice().createCommandEncoder().presentTexture(textureView);
        });
    }

    public static void afterPresentTexture(int glFrameBuffer, int width, int height) {
        if (ACTIVATED_SENDER.isBound()) {
            ACTIVATED_SENDER.get().sendFrameBufferObject(glFrameBuffer, width, height);
        }
    }
}
