package net.burningtnt.livehelper.components.executor;

import it.unimi.dsi.fastutil.ints.Int2IntMap;
import it.unimi.dsi.fastutil.ints.Int2IntOpenHashMap;
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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

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
                @Override
                public List<RenderStep> computeFrame(long durationNs) {
                    try {
                        RenderInstruction instruction = managerProgram.executeProgram(RenderInstruction.class);

                        List<RenderStep> steps = new ArrayList<>();
                        int finalID = collectSteps(steps, new AtomicInteger(0), instruction, new Int2IntOpenHashMap(), new HashSet<>());
                        steps.add(new RenderStep.Display(finalID));
                        return steps;
                    } catch (RuntimeException | ComponentException e) {
                        STATUS.put(managerID, new ManagerStatus.Failed(e));
                        throw e instanceof RuntimeException re ? re : new RuntimeException(e);
                    }
                }

                private int /* targetID */ collectSteps(
                        List<RenderStep> steps,
                        AtomicInteger currentTargetID,
                        RenderInstruction current,
                        Int2IntMap renderedClips, // clipID -> targetID
                        Set<RenderInstruction> previous
                ) throws ComponentException {
                    if (!previous.add(current)) {
                        throw new AssertionError("RenderInstruction loop detected, Should NOT be here!");
                    }

                    switch (current) {
                        case RenderInstruction.Single(int clipID) -> {
                            int targetID = renderedClips.getOrDefault(clipID, Integer.MIN_VALUE);
                            if (targetID == Integer.MIN_VALUE) {
                                steps.add(new RenderStep.Render(
                                        clipPrograms.get(clipID).executeProgram(FrameRequest.class),
                                        targetID = requestTargetID(currentTargetID)
                                ));
                                return targetID;
                            }
                            return targetID;
                        }
                        case RenderInstruction.Mix(RenderInstruction left, RenderInstruction right, float progress) -> {
                            int leftID = collectSteps(steps, currentTargetID, left, renderedClips, previous);
                            int rightID = collectSteps(steps, currentTargetID, right, renderedClips, previous);
                            int targetID = requestTargetID(currentTargetID);

                            steps.add(new RenderStep.Mix(leftID, rightID, targetID, progress));
                            return targetID;
                        }
                    }
                }

                private int /* targetID */ requestTargetID(AtomicInteger currentTargetID) {
                    int targetID = currentTargetID.getPlain();
                    if (targetID == RenderStep.MAX_BUFFER) {
                        throw new IndexOutOfBoundsException("Requires too may targets!");
                    }
                    currentTargetID.set(targetID + 1);
                    return targetID;
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
