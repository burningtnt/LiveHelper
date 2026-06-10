package net.burningtnt.livehelper.api;

import net.burningtnt.livehelper.MainScheduler;
import net.minecraft.client.Minecraft;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.WindowResizeEvent;
import org.lwjgl.glfw.GLFW;

import java.util.concurrent.TimeUnit;

/// Rendering a texture that is bigger than the FBO producing black
/// pixels on out-bounded areas.
///
/// Workaround: Increasing window size and resetting it.
@EventBusSubscriber(Dist.CLIENT)
public final class FrameBufferWorkaround {
    private static final int DELAY_MS = 500;

    private static int originalWidth, originalHeight;
    private static int maxWidth, maxHeight;

    private static boolean pending = false;
    private static int pendingWidth = -1, pendingHeight = -1;

    @SubscribeEvent
    private static void on(WindowResizeEvent event) {
        int width = event.getWindow().getWidth(), height = event.getWindow().getHeight();

        maxWidth = Math.max(maxWidth, width);
        maxHeight = Math.max(maxHeight, height);

        if (pending) {
            if (pendingWidth <= width && pendingHeight <= height) {
                pending = false;
                pendingWidth = pendingHeight = -1;

                long handle = event.getWindow().handle();
                MainScheduler.submitTask(
                        System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(DELAY_MS),
                        (_, _) -> GLFW.glfwSetWindowSize(handle, originalWidth, originalHeight)
                );
            }
        } else {
            originalWidth = width;
            originalHeight = height;
        }
    }

    public static void ensureSize(int width, int height) {
        if (width <= maxWidth && height <= maxHeight) {
            return;
        }
        if (pending && width <= pendingWidth && height <= pendingHeight) {
            return;
        }

        pending = true;
        pendingWidth = Math.max(pendingWidth, width);
        pendingHeight = Math.max(pendingHeight, height);

        GLFW.glfwSetWindowSize(Minecraft.getInstance().getWindow().handle(), width, height);
    }
}
