package net.burningtnt.livehelper.dashboard;

import com.dylibso.chicory.runtime.ImportFunction;
import com.dylibso.chicory.runtime.ImportValues;
import com.dylibso.chicory.runtime.Memory;
import com.dylibso.chicory.runtime.TrapException;
import com.dylibso.chicory.wasm.types.FunctionType;
import com.dylibso.chicory.wasm.types.ValType;
import net.burningtnt.livehelper.components.InputValue;
import net.burningtnt.livehelper.components.Program;
import net.burningtnt.livehelper.live.ActiveStream;
import org.jspecify.annotations.NonNull;

import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/* package-private */ final class LinkedMachineImports {
    private LinkedMachineImports() {
    }

    private static TrapException trap(String message) {
        return new TrapException(message);
    }

    private static final String MODULE_ID = "LiveHelper";

    public static ImportValues create(LinkedMachine machine, Program.Usage usage) {
        ImportValues.Builder builder = ImportValues.builder()
                .addFunction(
                        new ImportFunction(
                                MODULE_ID, "Handle.Duplicate", FunctionType.of(List.of(ValType.I32), List.of(ValType.I32)),
                                (_, args) -> {
                                    Object resource = machine.resource().get((int) args[0]);
                                    if (resource == null) {
                                        throw trap("Unknown resource index (pointed by a handle): " + (int) args[0]);
                                    }

                                    return new long[]{machine.attachResource(resource)};
                                }
                        ),
                        new ImportFunction(
                                MODULE_ID, "Handle.Release", FunctionType.of(List.of(ValType.I32), List.of(ValType.I32)),
                                (_, args) -> {
                                    Object resource = machine.resource().remove((int) args[0]);
                                    if (resource == null) {
                                        throw trap("Unknown resource index (pointed by a handle): " + (int) args[0]);
                                    }
                                    return null;
                                }
                        ),
                        new ImportFunction(
                                MODULE_ID, "Input.GetF32", FunctionType.of(List.of(ValType.I32, ValType.I32), List.of(ValType.F32)),
                                (instance, args) -> {
                                    String name = instance.memory((int) args[1]).readCString((int) args[0], StandardCharsets.UTF_8);
                                    InputValue input = machine.inputs().get(name);

                                    if (!(input instanceof InputValue.F32Like f32)) {
                                        throw trap("Cannot access input " + name + "as f32: " + input);
                                    }
                                    return new long[]{((long) Float.floatToIntBits(f32.f32())) & 0xFFFFFFFFL};
                                }
                        ),
                        new ImportFunction(
                                MODULE_ID, "Input.GetBuffer", FunctionType.of(List.of(ValType.I32, ValType.I32, ValType.I32, ValType.I32, ValType.I32), List.of(ValType.I32)),
                                (instance, args) -> {
                                    String name = instance.memory((int) args[1]).readCString((int) args[0], StandardCharsets.UTF_8);
                                    InputValue input = machine.inputs().get(name);

                                    if (!(input instanceof InputValue.BufferLike buffer)) {
                                        throw trap("Cannot access input " + name + "as pose: " + input);
                                    }

                                    DataOutputStream os = new DataOutputStream(new MemorySliceOutputStream(instance.memory((int) args[3]), (int) args[2], (int) args[4]));
                                    try (os) {
                                        buffer.intoBuffer(os);
                                    } catch (IOException e) {
                                        throw new UncheckedIOException(e);
                                    }

                                    return new long[]{os.size()};
                                }
                        )
                );

        switch (usage) {
            case CLIP -> builder.addFunction(
                    new ImportFunction(
                            MODULE_ID, "Technique.MakeClip",
                            FunctionType.of(
                                    List.of(
                                            ValType.F32, ValType.F32, ValType.F32, ValType.F32,
                                            ValType.F32, ValType.F32, ValType.F32,
                                            ValType.F32, ValType.I32, ValType.I32
                                    ),
                                    List.of(ValType.I32)
                            ),
                            (_, args) -> {
                                return new long[]{machine.attachResource(new ActiveStream.FrameRequest(
                                        Float.intBitsToFloat((int) args[0]),
                                        Float.intBitsToFloat((int) args[1]),
                                        Float.intBitsToFloat((int) args[2]),
                                        Float.intBitsToFloat((int) args[3]),
                                        Float.intBitsToFloat((int) args[4]),
                                        Float.intBitsToFloat((int) args[5]),
                                        Float.intBitsToFloat((int) args[6]),
                                        Float.intBitsToFloat((int) args[7]),
                                        (int) args[8] != 0,
                                        (int) args[9] != 0
                                ))};
                            }
                    )
            );
            case MANAGER -> builder.addFunction(
                    new ImportFunction(
                            MODULE_ID, "Manager.Render.Single", FunctionType.of(List.of(ValType.I32), List.of(ValType.I32)),
                            (_, args) -> {
                                int count = (int) ((InputValue.F32Like) machine.inputs().get("camera")).f32();
                                int index = (int) args[0];
                                if (index < 0 && index >= count) {
                                    throw trap("Cannot find specific clip: " + index);
                                }

                                return new long[]{machine.attachResource(new ProgramScheduler.RenderInstruction.Single(index))};
                            }
                    ),
                    new ImportFunction(
                            MODULE_ID, "Manager.Render.Mix", FunctionType.of(List.of(ValType.I32, ValType.I32, ValType.F32), List.of(ValType.I32)),
                            (_, args) -> {
                                ProgramScheduler.RenderInstruction left = (ProgramScheduler.RenderInstruction) machine.resource().get((int) args[0]);
                                ProgramScheduler.RenderInstruction right = (ProgramScheduler.RenderInstruction) machine.resource().get((int) args[1]);
                                float progress = Math.clamp(Float.intBitsToFloat((int) args[2]), 0, 1);
                                if (Float.isNaN(progress)) {
                                    progress = 0f;
                                }

                                return new long[]{machine.attachResource(new ProgramScheduler.RenderInstruction.Mix(left, right, progress))};
                            }
                    )
            );
        }

        return builder.build();
    }

    private static final class MemorySliceOutputStream extends OutputStream {
        private final Memory memory;
        private int index;
        private final int deadline;

        public MemorySliceOutputStream(Memory memory, int index, int length) {
            this.memory = memory;
            this.index = index;
            this.deadline = index + length;
        }

        @Override
        public void write(int b) {
            if (index < deadline) {
                memory.writeByte(index++, (byte) b);
            }
        }

        @Override
        public void write(byte @NonNull [] b, int off, int len) {
            if (index < deadline) {
                memory.write(index, b, off, Math.min(len, deadline - index));
            }
        }

        @Override
        public void close() {
            this.index = Integer.MAX_VALUE;
        }
    }
}
