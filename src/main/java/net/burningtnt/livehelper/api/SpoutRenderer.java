package net.burningtnt.livehelper.api;

import com.mojang.blaze3d.opengl.DirectStateAccess;
import com.mojang.blaze3d.systems.GpuDevice;
import com.mojang.blaze3d.systems.GpuDeviceBackend;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.GpuTextureView;
import net.burningtnt.livehelper.util.spout.SpoutSender;
import net.minecraft.client.Minecraft;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import org.jetbrains.annotations.ApiStatus;

import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;

@EventBusSubscriber(Dist.CLIENT)
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

    private static int fbo;

    @SubscribeEvent
    private static void on(FMLClientSetupEvent event) {
        Minecraft.getInstance().execute(() -> {
            try {
                Class<?> clazz = Class.forName("com.mojang.blaze3d.opengl.GlDevice");
                GpuDeviceBackend backend = (GpuDeviceBackend) MethodHandles.privateLookupIn(GpuDevice.class, MethodHandles.lookup())
                        .findVarHandle(GpuDevice.class, "backend", GpuDeviceBackend.class)
                        .withInvokeBehavior()
                        .get(RenderSystem.getDevice());

                DirectStateAccess access = (DirectStateAccess) MethodHandles.privateLookupIn(clazz, MethodHandles.lookup())
                        .findVarHandle(clazz, "directStateAccess", DirectStateAccess.class)
                        .withInvokeBehavior()
                        .get(backend);

                fbo = (int) MethodHandles.privateLookupIn(DirectStateAccess.class, MethodHandles.lookup())
                        .findVirtual(DirectStateAccess.class, "createFrameBufferObject", MethodType.methodType(int.class))
                        .invokeExact(access);
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
        });
    }

    public static int modifyTarget(int glFrameBuffer) {
        return ACTIVATED_SENDER.isBound() ? fbo : glFrameBuffer;
    }

    public static void afterPresentTexture(GpuTextureView textureView) {
        if (ACTIVATED_SENDER.isBound()) {
            ACTIVATED_SENDER.get().sendFrameBufferObject(fbo, textureView.getWidth(0), textureView.getHeight(0));
        }
    }
}
