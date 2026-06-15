package net.burningtnt.livehelper.api;

import net.minecraft.client.Minecraft;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import org.jetbrains.annotations.ApiStatus;

import java.util.ArrayList;
import java.util.List;

@ApiStatus.Internal
@EventBusSubscriber(Dist.CLIENT)
public final class ActiveStreamImpl {
    private ActiveStreamImpl() {
    }

    private static final ScopedValue<ActiveInstance> CURRENT_INSTANCE = ScopedValue.newInstance();

    public static final class ActiveInstance {
        private final ActiveStreamInstanceImpl instance;
        private final ActiveStream.FrameRequest request;

        private ActiveInstance(ActiveStreamInstanceImpl instance, ActiveStream.FrameRequest request) {
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

    /* package-private */
    static void runWith(ActiveStreamInstanceImpl instance, ActiveStream.FrameRequest request, Runnable runnable) {
        ScopedValue.where(CURRENT_INSTANCE, new ActiveInstance(instance, request)).run(runnable);
    }

    public static boolean hasActive() {
        return !INSTANCES.isEmpty();
    }

    public static ActiveInstance getActive() {
        return CURRENT_INSTANCE.isBound() ? CURRENT_INSTANCE.get() : null;
    }

    private static final List<ActiveStreamInstanceImpl> INSTANCES = new ArrayList<>();

    /* package-private */
    static void activate(ActiveStream.Config config, ActiveStream stream) {
        Minecraft.getInstance().execute(() -> {
            if (CURRENT_INSTANCE.isBound()) {
                throw new IllegalStateException("Cannot activate a new stream when rendering frames.");
            }
            for (ActiveStreamInstanceImpl instance : INSTANCES) {
                if (instance.stream() == stream) {
                    throw new IllegalArgumentException("ActiveStream " + stream + " has already been activated!");
                }
            }

            INSTANCES.add(new ActiveStreamInstanceImpl(config, stream, Minecraft.getInstance().mainRenderTarget.useStencil));
        });
    }

    /* package-private */
    static void deactivate(ActiveStream stream) {
        Minecraft.getInstance().execute(() -> {
            for (int i = 0; i < INSTANCES.size(); i++) {
                ActiveStreamInstanceImpl instance = INSTANCES.get(i);
                if (instance.stream() == stream) {
                    INSTANCES.remove(i);
                    instance.close();
                    break;
                }
            }
        });
    }

    @SubscribeEvent
    private static void tick(ClientTickEvent.Pre event) {
        for (int i = INSTANCES.size() - 1; i >= 0; i--) {
            INSTANCES.get(i).tick();
        }
    }
}
