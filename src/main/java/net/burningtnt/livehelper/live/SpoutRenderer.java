package net.burningtnt.livehelper.live;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.GpuTextureView;
import net.burningtnt.livehelper.spout.SpoutSender;

public final class SpoutRenderer {
    private SpoutRenderer() {
    }

    private static final ScopedValue<SpoutSender> ACTIVATED_SENDER = ScopedValue.newInstance();

    public static void sendTexture(SpoutSender sender, GpuTextureView textureView) {
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
