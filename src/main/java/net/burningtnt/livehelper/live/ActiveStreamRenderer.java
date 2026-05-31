package net.burningtnt.livehelper.live;

import net.minecraft.client.Minecraft;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;

import java.util.ArrayList;
import java.util.List;

@EventBusSubscriber
public final class ActiveStreamRenderer {
    private ActiveStreamRenderer() {
    }

    /* package-private */ static final ScopedValue<ActiveInstance> CURRENT_INSTANCE = ScopedValue.newInstance();

    public static final class ActiveInstance {
        private final ScheduledActiveStream instance;
        private final ActiveStream.RenderRequest request;

        /* package-private */ ActiveInstance(ScheduledActiveStream instance, ActiveStream.RenderRequest request) {
            this.instance = instance;
            this.request = request;
        }

        public void sendFrame(int glFrameBuffer, int width, int height) {
            instance.sender().sendFrameBufferObject(glFrameBuffer, width, height);
        }

        public ActiveStream.Config config() {
            return instance.config();
        }

        public ActiveStream.RenderRequest request() {
            return request;
        }
    }

    public static boolean hasActive() {
        return !INSTANCES.isEmpty();
    }

    public static ActiveInstance getActive() {
        return CURRENT_INSTANCE.isBound() ? CURRENT_INSTANCE.get() : null;
    }

    private static final List<ScheduledActiveStream> INSTANCES = new ArrayList<>();

    public static void activate(ActiveStream.Config config, ActiveStream stream) {
        if (CURRENT_INSTANCE.isBound()) {
            throw new IllegalStateException("Cannot activate a new stream when rendering frames.");
        }
        for (ScheduledActiveStream instance : INSTANCES) {
            if (instance.stream() == stream) {
                throw new IllegalArgumentException("ActiveStream " + stream + " has already been activated!");
            }
        }

        // SAFETY: CURRENT_INSTANCE is unset, so mainRenderTarget is the vanilla instance.
        INSTANCES.add(new ScheduledActiveStream(config, stream, Minecraft.getInstance().mainRenderTarget.useStencil));
    }

    public static void deactivate(ActiveStream stream) {
        if (CURRENT_INSTANCE.isBound()) {
            throw new IllegalStateException("Cannot activate a new stream when rendering frames.");
        }

        for (int i = 0; i < INSTANCES.size(); i++) {
            ScheduledActiveStream instance = INSTANCES.get(i);
            if (instance.stream() == stream) {
                INSTANCES.remove(i);
                instance.close();
                break;
            }
        }
        throw new IllegalArgumentException("ActiveStream " + stream + " hasn't already been activated!");
    }

    @SubscribeEvent
    private static void tick(ClientTickEvent.Pre event) {
        for (ScheduledActiveStream instance : INSTANCES) {
            instance.tick();
        }
    }
}
