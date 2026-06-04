package net.burningtnt.livehelper.dashboard;

import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.burningtnt.livehelper.components.Clip;
import net.burningtnt.livehelper.components.Manager;
import net.burningtnt.livehelper.components.Program;
import net.burningtnt.livehelper.components.storage.ComponentException;
import net.burningtnt.livehelper.components.storage.ComponentStorage;
import net.burningtnt.livehelper.live.ActiveStream;
import net.burningtnt.livehelper.live.ActiveStreamRenderer;
import net.minecraft.client.Minecraft;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import org.jetbrains.annotations.Nullable;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@EventBusSubscriber
public final class ProgramScheduler {
    private ProgramScheduler() {
    }

    public static final ComponentStorage STORAGE = new ComponentStorage();

    @SubscribeEvent
    private static void on(FMLClientSetupEvent event) {
        STORAGE.load().thenAcceptAsync(Runnable::run, Minecraft.getInstance());
    }

    /* package-private */ sealed interface RenderInstruction {
        record Single(int clipID) implements RenderInstruction {
        }

        record Mix(RenderInstruction left, RenderInstruction right, float process) implements RenderInstruction {
        }
    }

    public sealed interface ManagerStatus {
        record Running(ActiveStream stream) implements ManagerStatus {
        }

        record Failed(Exception exception) implements ManagerStatus {
        }
    }

    private static final Int2ObjectMap<ManagerStatus> STATUS = new Int2ObjectOpenHashMap<>();

    public static void activate(int managerID) throws ComponentException {
        ActiveStream.Config config;
        ActiveStream stream;
        try {
            Manager manager = STORAGE.managers.get(managerID);

            LinkedMachine managerProgram = new LinkedMachine(STORAGE, manager.program(), manager.inputs(), Program.Usage.MANAGER);
            Int2ObjectMap<LinkedMachine> clipPrograms = new Int2ObjectOpenHashMap<>(manager.clips().size());
            for (int clipID : manager.clips()) {
                Clip clip = STORAGE.clips.get(clipID);
                if (clipPrograms.put(clipID, new LinkedMachine(STORAGE, clip.programID(), clip.inputs(), Program.Usage.CLIP)) != null) {
                    throw new ComponentException.IDDuplicate(clipID).make();
                }
            }

            config = new ActiveStream.Config(manager.name(), manager.width(), manager.height(), manager.fps(), manager.renderDistance());
            stream = new ActiveStream() {
                @Nullable
                @Override
                public List<RenderStep> computeFrame(long durationNs) {
                    try {
                        RenderInstruction instruction = managerProgram.executeProgram(RenderInstruction.class);
                        return computeFrameInternal(instruction, new Int2ObjectOpenHashMap<>(), new HashSet<>());
                    } catch (RuntimeException | ComponentException e) {
                        STATUS.put(managerID, new ManagerStatus.Failed(e));
                        throw e instanceof RuntimeException re ? re : new RuntimeException(e);
                    }
                }

                private List<RenderStep> computeFrameInternal(
                        RenderInstruction current,
                        Int2ObjectMap<RenderStep.Render> clips,
                        Set<RenderInstruction> previous
                ) throws ComponentException {
                    if (!previous.add(current)) {
                        throw new AssertionError("RenderInstruction loop detected, Should NOT be here!");
                    }

                    switch (current) {
                        case RenderInstruction.Single(int clipID) -> {
                            RenderStep.Render request = clips.get(clipID);
                            if (request == null) {
                                clips.put(clipID, request = clipPrograms.get(clipID).executeProgram(RenderStep.Render.class));
                            }
                            return request;
                        }
                        case RenderInstruction.Mix(RenderInstruction left, RenderInstruction right, float progress) -> {
                            RenderStep lr = computeFrameInternal(left, clips, previous);
                            RenderStep rr = computeFrameInternal(right, clips, previous);
                            return new RenderStep.Mix(lr, rr, progress);
                        }
                    }
                }
            };
        } catch (RuntimeException | ComponentException e) {
            ComponentException exception = new ComponentException.LinkageFailure(managerID).make(e);
            STATUS.put(managerID, new ManagerStatus.Failed(exception));
            throw exception;
        }

        ActiveStreamRenderer.activate(config, stream);
        STATUS.put(managerID, new ManagerStatus.Running(stream));
    }

    public static Int2ObjectMap<ManagerStatus> getStatus() {
        return STATUS;
    }
}
