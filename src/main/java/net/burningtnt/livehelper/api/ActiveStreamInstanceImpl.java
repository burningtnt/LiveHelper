package net.burningtnt.livehelper.api;

import com.mojang.blaze3d.pipeline.MainTarget;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.systems.RenderSystem;
import net.burningtnt.livehelper.MainScheduler;
import net.burningtnt.livehelper.api.render.TextureMixer;
import net.burningtnt.livehelper.util.AngleConvert;
import net.burningtnt.livehelper.util.spout.SpoutSender;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.util.profiling.Profiler;
import net.minecraft.util.profiling.ProfilerFiller;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.client.ClientHooks;
import org.jetbrains.annotations.Nullable;
import org.joml.Matrix4f;
import org.joml.Matrix4fc;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.lang.invoke.VarHandle;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/* package-private */ final class ActiveStreamInstanceImpl {
    private static final Logger LOGGER = LoggerFactory.getLogger(ActiveStreamInstanceImpl.class);

    private static final MethodHandle SET_ROTATION, SET_POSITION, PREPARE_CULL_FRUSTUM, GET_VIEW_ROTATION_MATRIX, SETUP_PERSPECTIVE;
    private static final VarHandle INITIALIZED, DEPTH_FAR, FOV, HUD_FOV, CACHED_VIEW_ROT_MATRIX;

    static {
        try {
            MethodHandles.Lookup lookup = MethodHandles.privateLookupIn(Camera.class, MethodHandles.lookup());

            INITIALIZED = lookup.findVarHandle(Camera.class, "initialized", boolean.class);
            SET_POSITION = lookup.findVirtual(Camera.class, "setPosition", MethodType.methodType(void.class, double.class, double.class, double.class));
            SET_ROTATION = lookup.findVirtual(Camera.class, "setRotation", MethodType.methodType(void.class, float.class, float.class, float.class));
            CACHED_VIEW_ROT_MATRIX = lookup.findVarHandle(Camera.class, "cachedViewRotMatrix", Matrix4f.class);
            PREPARE_CULL_FRUSTUM = lookup.findVirtual(Camera.class, "prepareCullFrustum", MethodType.methodType(void.class, Matrix4fc.class, Matrix4f.class, Vec3.class));
            GET_VIEW_ROTATION_MATRIX = lookup.findVirtual(Camera.class, "getViewRotationMatrix", MethodType.methodType(Matrix4f.class, Matrix4f.class));
            SETUP_PERSPECTIVE = lookup.findVirtual(Camera.class, "setupPerspective", MethodType.methodType(void.class, float.class, float.class, float.class, float.class, float.class));
            DEPTH_FAR = lookup.findVarHandle(Camera.class, "depthFar", float.class);
            FOV = lookup.findVarHandle(Camera.class, "fov", float.class);
            HUD_FOV = lookup.findVarHandle(Camera.class, "hudFov", float.class);
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private final ActiveStream.Config config;
    private final ActiveStream stream;
    private final Camera camera;
    private final MainTarget[] renderTargets;
    private final ExecutorService executor;
    private final SpoutSender sender;
    private final long startNs = System.nanoTime();

    private final TextureMixer renderer;
    private long futureNs;
    private Future<@Nullable List<ActiveStream.RenderStep>> future;
    private long lastPerformanceWarning = -1;
    private boolean stopped;

    public ActiveStreamInstanceImpl(ActiveStream.Config config, ActiveStream stream, boolean useStencil) {
        this.config = config;
        this.stream = stream;
        this.camera = new Camera();
        this.renderTargets = new MainTarget[ActiveStream.RenderStep.MAX_BUFFER];
        this.renderTargets[0] = new MainTarget(config.width(), config.height(), useStencil);
        this.executor = Executors.newSingleThreadExecutor(Thread.ofPlatform().name("LiveHelper Camera Worker for " + config.name()).daemon().factory());
        this.sender = new SpoutSender(config.name());
        this.renderer = new TextureMixer(config.width(), config.height());

        requestFrame(0);

        MainScheduler.submitTask(System.nanoTime(), new MainScheduler.ExecutableTask() {
            @Override
            public void run(boolean isOutOfMemoryRecovery, long taskNs) {
                if (stopped) {
                    return;
                }

                long frameNs = Math.max(TimeUnit.MILLISECONDS.toNanos(5), TimeUnit.SECONDS.toNanos(1) / config.fps());
                long nextFrameNs = Math.max(taskNs + frameNs, System.nanoTime());

                switch (future.state()) {
                    case SUCCESS -> {
                        List<ActiveStream.RenderStep> steps = future.resultNow();
                        requestFrame(nextFrameNs - startNs);
                        if (steps != null) {
                            executeSteps(isOutOfMemoryRecovery, steps);
                        }
                    }
                    case RUNNING -> {
                        if (taskNs - futureNs >= 2 * frameNs && System.currentTimeMillis() - lastPerformanceWarning >= TimeUnit.SECONDS.toMillis(5)) {
                            LOGGER.warn("Camera {} can't keep up! Your program is too slow!", config.name());
                            lastPerformanceWarning = System.currentTimeMillis();
                        }
                    }
                    case CANCELLED -> {
                        ActiveStream.deactivate(stream);
                    }
                    case FAILED -> {
                        LOGGER.error("Camera {} frame computing failed.", config.name(), future.exceptionNow());
                        ActiveStream.deactivate(stream);
                    }
                }

                if (!stopped) {
                    MainScheduler.submitTask(nextFrameNs, this);
                }
            }
        });
    }

    private void requestFrame(long durationNs) {
        futureNs = System.nanoTime();
        future = executor.submit(() -> stream.computeFrame(durationNs));
    }

    private void executeSteps(boolean isOutOfMemoryRecovery, List<ActiveStream.RenderStep> steps) {
        for (int i = 0; i < steps.size(); i++) {
            switch (steps.get(i)) {
                case ActiveStream.RenderStep.Render(ActiveStream.FrameRequest request, int target) -> {
                    render(request, ensureTarget(target), isOutOfMemoryRecovery);
                }
                case ActiveStream.RenderStep.Mix(int left, int right, int target, float progress) -> {
                    MainTarget leftTarget = ensureTarget(left), rightTarget = ensureTarget(right), targetTarget = ensureTarget(target);
                    progress = Float.isNaN(progress) ? 0.5f : Math.clamp(progress, 0f, 1f);

                    renderer.mix(leftTarget.getColorTextureView(), rightTarget.getColorTextureView(), progress, targetTarget.getColorTextureView());
                }
                case ActiveStream.RenderStep.Display(int target) -> {
                    SpoutRenderer.blitSend(sender, Objects.requireNonNull(ensureTarget(target).getColorTextureView()));

                    if (i != steps.size() - 1) {
                        throw new IllegalArgumentException("RenderStep.Display must be the last node.");
                    }
                    return;
                }
            }
        }

        throw new IllegalArgumentException("RenderStep must be finished by a RenderStep.Display");
    }

    private MainTarget ensureTarget(int index) {
        if (index < 0 || index >= renderTargets.length) {
            throw new IllegalArgumentException("Unknown target: " + index);
        }

        MainTarget target = renderTargets[index];
        if (target == null) {
            MainTarget first = renderTargets[0];
            target = renderTargets[index] = new MainTarget(first.width, first.height, first.useStencil);
        }
        return target;
    }

    private void render(ActiveStream.FrameRequest frame, MainTarget renderTarget, boolean isOutOfMemoryRecovery) {
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.level == null || minecraft.player == null) {
            return;
        }

        RenderTarget previousRenderTarget = minecraft.mainRenderTarget;
        Camera previousCamera = minecraft.gameRenderer.mainCamera;
        boolean previousHideGui = minecraft.options.hideGui;
        try {
            setupInternal(frame, renderTarget);
            ActiveStreamImpl.runWith(
                    this, frame,
                    () -> renderInternal(renderTarget, isOutOfMemoryRecovery)
            );
        } finally {
            minecraft.mainRenderTarget = previousRenderTarget;
            minecraft.gameRenderer.mainCamera = previousCamera;
            minecraft.options.hideGui = previousHideGui;
        }
    }

    private void setupInternal(ActiveStream.FrameRequest frame, MainTarget renderTarget) {
        Minecraft minecraft = Minecraft.getInstance();
        minecraft.mainRenderTarget = renderTarget;
        minecraft.gameRenderer.mainCamera = camera;
        minecraft.options.hideGui = true;

        Vector3f angles = AngleConvert.convert(new Quaternionf(frame.qx(), frame.qy(), frame.qz(), frame.qw()), new Vector3f());
        camera.setLevel(minecraft.level);
        camera.setEntity(Objects.requireNonNull(minecraft.player));

        Matrix4f projection = new Matrix4f();
        projection.perspective(
                (float) (frame.fov() * Math.PI / 180.0),
                config.width() / (float) config.height(),
                0.05F, config.renderDistance() * 16,
                RenderSystem.getDevice().isZZeroToOne()
        );

        try {
            DEPTH_FAR.set(camera, config.renderDistance() * 64);
            FOV.set(camera, frame.fov());
            HUD_FOV.set(camera, frame.fov());
            SET_POSITION.invokeExact(camera, frame.x(), frame.y(), frame.z());
            SET_ROTATION.invokeExact(camera, angles.y, angles.z, angles.z);
            INITIALIZED.set(camera, true);
            PREPARE_CULL_FRUSTUM.invokeExact(
                    camera,
                    (Matrix4fc) (Matrix4f) GET_VIEW_ROTATION_MATRIX.invokeExact(camera, (Matrix4f) CACHED_VIEW_ROT_MATRIX.get(camera)),
                    projection,
                    camera.position()
            );
            SETUP_PERSPECTIVE.invokeExact(camera, 0.05F, (float) DEPTH_FAR.get(camera), (float) FOV.get(camera), (float) config.width(), (float) config.height());
        } catch (RuntimeException | Error e) {
            throw e;
        } catch (Throwable e) {
            throw new RuntimeException(e);
        }
    }

    private void renderInternal(MainTarget renderTarget, boolean isOutOfMemoryRecovery) {
        Minecraft minecraft = Minecraft.getInstance();
        GameRenderer gameRenderer = minecraft.gameRenderer;
        DeltaTracker deltaTracker = minecraft.getDeltaTracker();
        ProfilerFiller profiler = Profiler.get();

        profiler.push("spout");

        profiler.push("update");
        boolean resourcesLoaded = minecraft.isGameLoadFinished();
        boolean shouldRenderLevel = resourcesLoaded && !isOutOfMemoryRecovery && minecraft.level != null;
        if (shouldRenderLevel) {
            minecraft.levelRenderer.update(camera);
        }
        profiler.popPush("extract");
        gameRenderer.getGameRenderState().framerateLimit = config.fps();
        gameRenderer.extract(deltaTracker, !isOutOfMemoryRecovery);

        profiler.popPush("gpuAsync");
        RenderSystem.executePendingTasks();
        profiler.pop();

        ClientHooks.fireRenderFramePre(deltaTracker);
        gameRenderer.render(deltaTracker, !isOutOfMemoryRecovery);
        ClientHooks.fireRenderFramePost(deltaTracker);

        profiler.push("send");
        renderTarget.blitToScreen();
        profiler.pop();
        profiler.pop();
    }

    public void tick() {
        if (stopped) {
            throw new IllegalStateException(this + "has been stopped!");
        }

        Entity entity = camera.entity();
        if (entity != null) {
            camera.attributeProbe().tick(entity.level(), entity.position());
        } else {
            camera.attributeProbe().reset();
        }
    }

    public void close() {
        stopped = true;

        renderer.close();
        for (MainTarget target : renderTargets) {
            if (target != null) {
                target.destroyBuffers();
            }
        }
        sender.close();
        executor.shutdownNow();
        future.cancel(true);
    }

    public ActiveStream.Config config() {
        return config;
    }

    public ActiveStream stream() {
        return stream;
    }
}
