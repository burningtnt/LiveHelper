package net.burningtnt.livehelper.server.executor;

import com.dylibso.chicory.runtime.ImportFunction;
import com.dylibso.chicory.runtime.ImportValues;
import com.dylibso.chicory.runtime.Instance;
import com.dylibso.chicory.runtime.Memory;
import com.dylibso.chicory.runtime.TrapException;
import com.dylibso.chicory.wasm.types.FunctionType;
import com.dylibso.chicory.wasm.types.ValType;
import com.google.common.io.LittleEndianDataOutputStream;
import net.burningtnt.livehelper.api.ActiveStream;
import net.burningtnt.livehelper.server.components.InputValue;
import net.burningtnt.livehelper.server.components.Program;
import org.apache.commons.io.output.CountingOutputStream;
import org.jspecify.annotations.NonNull;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/* package-private */ final class LinkedMachineImports {
    private LinkedMachineImports() {
    }

    private static TrapException trap(String message) {
        return new TrapException(message);
    }

    private static final String MODULE_ID = "LH";

    public static ImportValues create(LinkedMachine machine, Program.Usage usage) {
        ImportValues.Builder builder = ImportValues.builder()
                .addFunction(
                        new ImportFunction(
                                "env", "abort", FunctionType.of(List.of(ValType.I32, ValType.I32, ValType.I32, ValType.I32), List.of()),
                                (instance, args) -> {
                                    class H {
                                        static String readString(Instance instance, int pointer) {
                                            if (pointer == 0) {
                                                return "<null>";
                                            }

                                            Memory memory = instance.memory();
                                            long size = memory.readU32(pointer - 4);
                                            if ((size & 1) != 0) {
                                                return "<error: invalid size, must be a even number>";
                                            }
                                            if ((int) size != size) {
                                                return "<error: invalid size>";
                                            }

                                            byte[] buffer = memory.readBytes(pointer, (int) size);
                                            return new String(buffer, StandardCharsets.UTF_16LE);
                                        }
                                    }

                                    String message = H.readString(instance, (int) args[0]);
                                    String file = H.readString(instance, (int) args[1]);
                                    long line = args[2];
                                    long column = args[3];

                                    throw trap(String.format("AssemblyScript aborted: %s\n  at %s (%d:%d)", message, file, line, column));
                                }
                        )
                )
                .addFunction(
                        new ImportFunction(
                                MODULE_ID, "Handle.Duplicate", FunctionType.of(List.of(ValType.I32), List.of(ValType.I32)),
                                (_, args) -> {
                                    return new long[]{machine.attachResource(machine.borrowResource((int) args[0], Object.class))};
                                }
                        ),
                        new ImportFunction(
                                MODULE_ID, "Handle.Release", FunctionType.of(List.of(ValType.I32), List.of(ValType.I32)),
                                (_, args) -> {
                                    machine.acquireResource((int) args[0], Object.class);
                                    return null;
                                }
                        ),
                        new ImportFunction(
                                MODULE_ID, "Input.GetF32", FunctionType.of(List.of(ValType.I32, ValType.I32), List.of(ValType.F32)),
                                (instance, args) -> {
                                    String name = instance.memory((int) args[1]).readCString((int) args[0], StandardCharsets.UTF_8);
                                    InputValue input = machine.getInput(name);

                                    if (!(input instanceof InputValue.F32Like f32)) {
                                        throw trap("Cannot access input " + name + " as f32: " + input);
                                    }
                                    return new long[]{((long) Float.floatToIntBits(f32.f32())) & 0xFFFFFFFFL};
                                }
                        ),
                        new ImportFunction(
                                MODULE_ID, "Input.GetBuffer", FunctionType.of(List.of(ValType.I32, ValType.I32, ValType.I32, ValType.I32, ValType.I32), List.of(ValType.I32)),
                                (instance, args) -> {
                                    String name = instance.memory((int) args[1]).readCString((int) args[0], StandardCharsets.UTF_8);
                                    InputValue input = machine.getInput(name);

                                    if (!(input instanceof InputValue.BufferLike buffer)) {
                                        throw trap("Cannot access input " + name + "as pose: " + input);
                                    }

                                    CountingOutputStream counter = new CountingOutputStream(new MemorySliceOutputStream(
                                            instance.memory((int) args[3]),
                                            (int) args[2],
                                            (int) args[4]
                                    ));
                                    try (LittleEndianDataOutputStream os = new LittleEndianDataOutputStream(counter)) {
                                        buffer.intoBuffer(os);
                                    } catch (IOException e) {
                                        throw new UncheckedIOException(e);
                                    }

                                    return new long[]{counter.getCount()};
                                }
                        )
                );

        switch (usage) {
            case CLIP -> builder.addFunction(
                    new ImportFunction(
                            MODULE_ID, "Technique.MakeClip",
                            FunctionType.of(
                                    List.of(
                                            ValType.F32, ValType.F32, ValType.F32,
                                            ValType.F32, ValType.F32, ValType.F32, ValType.F32
                                    ),
                                    List.of(ValType.I32)
                            ),
                            (_, args) -> {
                                return new long[]{machine.attachResource(new ActiveStream.IRequest.Frame(
                                        Float.intBitsToFloat((int) args[0]),
                                        Float.intBitsToFloat((int) args[1]),
                                        Float.intBitsToFloat((int) args[2]),
                                        Float.intBitsToFloat((int) args[3]),
                                        Float.intBitsToFloat((int) args[4]),
                                        Float.intBitsToFloat((int) args[5]),
                                        Float.intBitsToFloat((int) args[6]),
                                        80 // TODO: Enable developers to configure FOV
                                ))};
                            }
                    ),
                    new ImportFunction(
                            MODULE_ID, "Technique.MakeEntity", FunctionType.of(List.of(ValType.I32, ValType.I32), List.of(ValType.I32)),
                            (instance, args) -> {
                                UUID uuid = UUID.fromString(instance.memory((int) args[1]).readCString((int) args[0], StandardCharsets.UTF_8));
                                return new long[]{machine.attachResource(new ActiveStream.IRequest.Entity(uuid))};
                            }
                    )
            );
            case MANAGER -> builder.addFunction(
                    new ImportFunction(
                            MODULE_ID, "Manager.Render.Single", FunctionType.of(List.of(ValType.I32, ValType.F32), List.of(ValType.I32)),
                            (_, args) -> {
                                int count = (int) ((InputValue.F32Like) Objects.requireNonNull(machine.getInput("clip"))).f32();
                                int index = (int) args[0];
                                if (index < 0 && index >= count) {
                                    throw trap("Cannot find specific clip: " + index);
                                }

                                float p = Math.clamp(Float.intBitsToFloat((int) args[1]), 0, 1);
                                p = Float.isNaN(p) ? 0.5f : p;

                                return new long[]{machine.attachResource(new ProgramScheduler.RenderNode.Single(index, p))};
                            }
                    ),
                    new ImportFunction(
                            MODULE_ID, "Manager.Render.Mix", FunctionType.of(List.of(ValType.I32, ValType.I32, ValType.F32), List.of(ValType.I32)),
                            (_, args) -> {
                                ProgramScheduler.RenderNode left = machine.acquireResource((int) args[0], ProgramScheduler.RenderNode.class);
                                ProgramScheduler.RenderNode right = machine.acquireResource((int) args[1], ProgramScheduler.RenderNode.class);
                                float progress = Math.clamp(Float.intBitsToFloat((int) args[2]), 0, 1);
                                if (Float.isNaN(progress)) {
                                    progress = 0f;
                                }

                                return new long[]{machine.attachResource(new ProgramScheduler.RenderNode.Mix(left, right, progress))};
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
                len = Math.min(len, deadline - index);
                memory.write(index, b, off, len);
                index += len;
            }
        }

        @Override
        public void close() {
            this.index = Integer.MAX_VALUE;
        }
    }
}
