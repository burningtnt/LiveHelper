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

    private static final ScopedValue<ActiveInstance> CURRENT_INSTANCE = ScopedValue.newInstance();

    public static final class ActiveInstance {
        private final ScheduledActiveStream instance;
        private final ActiveStream.FrameRequest request;

        private ActiveInstance(ScheduledActiveStream instance, ActiveStream.FrameRequest request) {
            this.instance = instance;
            this.request = request;
        }

        public ActiveStream.Config config() {
            return instance.config();
        }

        public ActiveStream.FrameRequest request() {
            return request;
        }
    }

    /* package-private */ static void runWith(ScheduledActiveStream instance, ActiveStream.FrameRequest request, Runnable runnable) {
        ScopedValue.where(CURRENT_INSTANCE, new ActiveInstance(instance, request)).run(runnable);
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

        INSTANCES.add(new ScheduledActiveStream(config, stream, Minecraft.getInstance().mainRenderTarget.useStencil));
    }

    public static void deactivate(ActiveStream stream) {
        for (int i = 0; i < INSTANCES.size(); i++) {
            ScheduledActiveStream instance = INSTANCES.get(i);
            if (instance.stream() == stream) {
                INSTANCES.remove(i);
                instance.close();
                break;
            }
        }
        throw new IllegalArgumentException("ActiveStream " + stream + " hasn't been activated yet!");
    }

    @SubscribeEvent
    private static void tick(ClientTickEvent.Pre event) {
        for (int i = INSTANCES.size() - 1; i >= 0; i--) {
            ScheduledActiveStream stream = INSTANCES.get(i);
            if (stream.stopped()) {
                INSTANCES.remove(i);
                continue;
            }

            stream.tick();
        }
    }
}
