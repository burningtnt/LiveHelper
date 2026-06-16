package net.burningtnt.livehelper.api;

import com.mojang.blaze3d.GLFWErrorCapture;
import com.mojang.blaze3d.GLFWErrorScope;
import com.mojang.blaze3d.opengl.GlConst;
import com.mojang.blaze3d.opengl.GlTexture;
import com.mojang.blaze3d.textures.GpuTextureView;
import net.burningtnt.livehelper.util.spout.SpoutSender;
import net.minecraft.client.Minecraft;
import org.jetbrains.annotations.ApiStatus;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.invoke.MethodHandles;
import java.lang.invoke.VarHandle;

@ApiStatus.Internal
public final class SpoutRenderer {
    private static final Logger LOGGER = LoggerFactory.getLogger(SpoutRenderer.class);

    private SpoutRenderer() {
    }

    private static final VarHandle TEXTURE_ID;

    static {
        try {
            TEXTURE_ID = MethodHandles.privateLookupIn(GlTexture.class, MethodHandles.lookup())
                    .findVarHandle(GlTexture.class, "id", int.class)
                    .withInvokeExactBehavior();
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private static long window;
    private static int width, height;

    public static void blitSend(SpoutSender sender, GpuTextureView textureView) {
        int w = textureView.getWidth(0), h = textureView.getHeight(0);
        ensureSize(w, h);

        long previous = Minecraft.getInstance().getWindow().handle();
        GLFW.glfwMakeContextCurrent(window);
        try {
            sender.sendTexture(
                    (int) TEXTURE_ID.get((GlTexture) textureView.texture()), GlConst.GL_TEXTURE_2D,
                    w, h, 0
            );
        } finally {
            GLFW.glfwMakeContextCurrent(previous);
        }
    }

    private static void ensureSize(int w, int h) {
        if (window == 0) {
            GLFWErrorCapture errors = new GLFWErrorCapture();
            try (GLFWErrorScope _ = new GLFWErrorScope(errors)) {
                window = GLFW.glfwCreateWindow(w, h, "LiveHelper Pseudo Window", 0, Minecraft.getInstance().getWindow().handle());
            }
            for (GLFWErrorCapture.Error error : errors) {
                LOGGER.error("GLFW error collected during GL backend initialization: {}", error);
            }
            if (window == 0) {
                throw new IllegalStateException("Cannot create a second window.");
            }
            width = w;
            height = h;
            GLFW.glfwIconifyWindow(window);
            GLFW.glfwSetWindowCloseCallback(window, _ -> {
                GLFW.glfwDestroyWindow(window);
                window = width = height = 0;
            });
        } else if (w > width || h > height) {
            width = Math.max(w, width);
            height = Math.max(h, height);
            GLFW.glfwSetWindowSize(window, width, height);
            GLFW.glfwIconifyWindow(window);
        }
    }
}
