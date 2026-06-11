package net.burningtnt.livehelper.server.executor;

import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2IntMap;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import net.burningtnt.livehelper.api.ActiveStream;
import net.burningtnt.livehelper.server.components.Clip;
import net.burningtnt.livehelper.server.components.InputValue;
import net.burningtnt.livehelper.server.components.Manager;
import net.burningtnt.livehelper.server.components.Program;
import net.burningtnt.livehelper.server.components.storage.ComponentException;
import net.burningtnt.livehelper.server.components.storage.ComponentStorage;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.EventBusSubscriber;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@EventBusSubscriber(Dist.CLIENT)
public final class ProgramScheduler {
    private static final Logger LOGGER = LoggerFactory.getLogger(ProgramScheduler.class);

    private final ComponentStorage storage;

    public ProgramScheduler(ComponentStorage storage) {
        this.storage = storage;
    }

    /* package-private */ sealed interface RenderNode {
        record Single(int clipID, float progress) implements RenderNode {
        }

        record Mix(RenderNode left, RenderNode right, float process) implements RenderNode {
        }
    }

    public sealed interface ManagerStatus {
        record Running(ProgramScheduler instance, int managerID, ActiveStream stream) implements ManagerStatus {
            public void stop() {
                if (!instance.status.remove(managerID, this)) {
                    throw new IllegalStateException();
                }

                ActiveStream.deactivate(stream);
            }
        }

        record Failed(ProgramScheduler instance, int managerID, Exception exception) implements ManagerStatus {
            public void forget() {
                if (!instance.status.remove(managerID, this)) {
                    throw new IllegalStateException();
                }
            }
        }

        record Nil() implements ManagerStatus {
            public static final Nil INSTANCE = new Nil();
        }
    }

    private final Int2ObjectMap<ManagerStatus> status = new Int2ObjectOpenHashMap<>();

    public ManagerStatus getStatus(int managerID) {
        return Objects.requireNonNullElse(status.get(managerID), ManagerStatus.Nil.INSTANCE);
    }

    public void launch(int managerID) throws ComponentException {
        ActiveStream.Config config;
        ActiveStream stream;
        try {
            Manager manager = storage.managers.get(managerID);

            int clipCount = manager.clips().length;
            List<InputValue> managerInputs = new ArrayList<>(clipCount * 2 + 1);
            managerInputs.add(new InputValue.Number("clip", clipCount));

            Int2ObjectMap<LinkedMachine> clipPrograms = new Int2ObjectOpenHashMap<>(clipCount);
            for (int i = 0; i < clipCount; i++) {
                int clipID = manager.clips()[i];
                Clip clip = storage.clips.get(clipID);

                managerInputs.add(new InputValue.Number("clip." + i + ".duration", clip.duration()));
                managerInputs.add(new InputValue.Chars("clip." + i + ".name", clip.name()));

                if (!clipPrograms.containsKey(clipID)) {
                    clipPrograms.put(clipID, new LinkedMachine(storage, clip.programID(), clip.inputs(), Program.Usage.CLIP));
                }
            }

            LinkedMachine managerProgram = new LinkedMachine(storage, manager.programID(), manager.inputs(), Program.Usage.MANAGER);

            config = new ActiveStream.Config(manager.name(), manager.width(), manager.height(), manager.fps(), manager.renderDistance());
            stream = new ActiveStream() {
                @Override
                public List<RenderStep> computeFrame(long durationNs) {
                    try {
                        managerInputs.add(new InputValue.Number("duration", TimeUnit.NANOSECONDS.toMillis(durationNs)));
                        RenderNode instruction = managerProgram.executeProgram(RenderNode.class, managerInputs);
                        managerInputs.removeLast();

                        List<RenderStep> steps = new ArrayList<>();
                        int finalID = collectSteps(steps, new AtomicInteger(0), instruction, new Long2IntOpenHashMap(), new HashSet<>());
                        steps.add(new RenderStep.Display(finalID));
                        return steps;
                    } catch (RuntimeException | ComponentException e) {
                        LOGGER.warn("Cannot execute a manager.", e);
                        status.put(managerID, new ManagerStatus.Failed(ProgramScheduler.this, managerID, e));
                        throw e instanceof RuntimeException re ? re : new RuntimeException(e);
                    }
                }

                private int /* targetID */ collectSteps(
                        List<RenderStep> steps,
                        AtomicInteger currentTargetID,
                        RenderNode current,
                        Long2IntMap renderedClips, // (clipID + progress) -> targetID
                        Set<RenderNode> previous
                ) throws ComponentException {
                    if (!previous.add(current)) {
                        throw new AssertionError("RenderInstruction loop detected, Should NOT be here!");
                    }

                    switch (current) {
                        case RenderNode.Single(int i, float progress) -> {
                            int clipID = manager.clips()[i];
                            long cacheKey = ((long) clipID << 32) | (Float.floatToIntBits(progress) & 0xFFFFFFFFL);

                            int targetID = renderedClips.getOrDefault(cacheKey, Integer.MIN_VALUE);
                            if (targetID == Integer.MIN_VALUE) {
                                List<InputValue> inputs = List.of(new InputValue.Number("progress", progress));

                                steps.add(new RenderStep.Render(
                                        clipPrograms.get(clipID).executeProgram(FrameRequest.class, inputs),
                                        targetID = requestTargetID(currentTargetID)
                                ));
                                renderedClips.put(cacheKey, targetID);
                            }
                            return targetID;
                        }
                        case RenderNode.Mix(RenderNode left, RenderNode right, float progress) -> {
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
        } catch (RuntimeException | ComponentException | Error e) {
            LOGGER.warn("Cannot execute a manager.", e);

            ComponentException exception = new ComponentException.LinkageFailure(managerID).make(e);
            status.put(managerID, new ManagerStatus.Failed(this, managerID, exception));
            return;
        }

        ActiveStream.activate(config, stream);
        ManagerStatus previous = status.put(managerID, new ManagerStatus.Running(this, managerID, stream));
        if (previous instanceof ManagerStatus.Running running) {
            running.stop();
        }
    }
}
