package net.burningtnt.livehelper.server.executor;

import com.dylibso.chicory.runtime.ExportFunction;
import com.dylibso.chicory.runtime.Instance;
import com.dylibso.chicory.wasm.ChicoryException;
import com.dylibso.chicory.wasm.Parser;
import com.dylibso.chicory.wasm.WasmModule;
import com.dylibso.chicory.wasm.types.FunctionType;
import com.dylibso.chicory.wasm.types.MemoryLimits;
import com.dylibso.chicory.wasm.types.ValType;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectRBTreeMap;
import net.burningtnt.livehelper.server.components.InputDeclaration;
import net.burningtnt.livehelper.server.components.InputValue;
import net.burningtnt.livehelper.server.components.Program;
import net.burningtnt.livehelper.server.components.storage.ComponentException;
import net.burningtnt.livehelper.server.components.storage.ComponentStorage;
import org.jetbrains.annotations.Nullable;
import org.jspecify.annotations.NonNull;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/* package-private */ final class LinkedMachine {
    @SuppressWarnings("FieldCanBeLocal")
    private final Instance script;
    private final ExportFunction entrypoint;
    private final Map<String, InputValue> inputs;
    private final Int2ObjectMap<Object> resources = new Int2ObjectOpenHashMap<>();

    public LinkedMachine(ComponentStorage storage, int programID, List<InputValue> inputs, Program.Usage usage) throws ComponentException {
        Program program = storage.programs.get(programID);
        if (program.usage() != usage) {
            throw new ComponentException.InvalidUsage(program.id()).make();
        }

        WasmModule module = Parser.parse(storage.binaries.get(programID).buffer());

        this.inputs = resolveInputs(program, inputs);
        this.script = Instance.builder(module)
                .withMemoryLimits(new MemoryLimits(4, 32, false))
//                            .withMemoryFactory() TODO: Replace with LWJGL-based memory access to reduce runtime index validation overload
                .withImportValues(LinkedMachineImports.create(this, usage))
                .build();
        this.entrypoint = this.script.export("main");
        if (this.entrypoint == null) {
            throw new ComponentException.MissingEntry(programID).make();
        }

        FunctionType mainType = this.script.exportType("main");
        if (!mainType.equals(FunctionType.returning(ValType.I32))) {
            throw new ComponentException.MissingEntry(programID).make();
        }
    }

    private static final ScopedValue<Map<String, InputValue>> ACTIVATE_INPUTS = ScopedValue.newInstance();

    /* package-private */ <T> T executeProgram(Class<T> clazz, List<InputValue> dynamicInputs) throws ComponentException {
        Map<String, InputValue> activatedInputs;
        if (dynamicInputs.isEmpty()) {
            activatedInputs = this.inputs;
        } else {
            activatedInputs = new HashMap<>(this.inputs.size() + dynamicInputs.size());
            activatedInputs.putAll(this.inputs);
            for (InputValue input : dynamicInputs) {
                if (activatedInputs.put(input.id(), input) != null) {
                    throw new IllegalStateException("A user-defined input conflicts with a system input: " + input.id());
                }
            }
        }

        long[] result = ScopedValue.where(ACTIVATE_INPUTS, activatedInputs).call(this.entrypoint::apply);
        if (result == null || result.length != 1) {
            throw new ChicoryException("Invalid return value: " + Arrays.toString(result));
        }

        int i = Math.toIntExact(result[0]);
        return acquireResource(i, clazz);
    }

    @Nullable
    /* package-private */ InputValue getInput(String name) {
        return ACTIVATE_INPUTS
                .orElseThrow(() -> new IllegalStateException("Cannot locate activated inputs"))
                .get(name);
    }

    /* package-private */ <T> T acquireResource(int id, Class<T> clazz) {
        return readResource(id, this.resources.remove(id), clazz);
    }

    /* package-private */ <T> T borrowResource(int id, Class<T> clazz) {
        return readResource(id, this.resources.get(id), clazz);
    }

    /* package-private */ int attachResource(Object resource) {
        int id;
        while (this.resources.putIfAbsent(id = ThreadLocalRandom.current().nextInt(), resource) != null) {
            Thread.yield();
        }
        return id;
    }

    @SuppressWarnings("unchecked")
    private <T> @NonNull T readResource(int id, Object object, Class<T> clazz) {
        if (object == null) {
            throw new NullPointerException("Unknown resource " + id);
        }
        if (!clazz.isInstance(object)) {
            throw new ClassCastException(String.format("Invalid resource %d: Cannot cast %s to %s", id, object.getClass().getName(), clazz.getName()));
        }
        return (T) object;
    }

    private static Map<String, InputValue> resolveInputs(Program program, List<InputValue> inputs) throws ComponentException {
        Map<String, InputValue> resolvedInputs = new HashMap<>(program.inputs().size());
        for (InputDeclaration declaration : program.inputs()) {
            String declareID = declaration.id();

            if (declaration.multiValue()) {
                Int2ObjectMap<InputValue> multivalue = new Int2ObjectRBTreeMap<>();
                for (InputValue input : inputs) {
                    String inputID = input.id();
                    if (inputID.length() >= declareID.length() + 2 && inputID.startsWith(declareID) && inputID.charAt(declareID.length()) == '.') {
                        int index;
                        try {
                            index = Integer.parseUnsignedInt(inputID, declareID.length() + 1, inputID.length(), 10);
                        } catch (NumberFormatException e) {
                            continue;
                        }

                        multivalue.put(index, input);
                    }
                }

                int size = multivalue.size();
                for (int i = 0; i < size; i++) {
                    if (!multivalue.containsKey(i) || multivalue.get(i).type() != declaration.type()) {
                        throw new ComponentException.MissingInput(program.id(), declareID + "." + i).make();
                    }
                }
                resolvedInputs.put(declareID, new InputValue.Number(declareID, size));
                for (Int2ObjectMap.Entry<InputValue> entry : multivalue.int2ObjectEntrySet()) {
                    resolvedInputs.put(declareID + "." + entry.getIntKey(), entry.getValue());
                }
            } else {
                for (InputValue input : inputs) {
                    if (input.id().equals(declareID)) {
                        if (input.type() != declaration.type()) {
                            throw new ComponentException.MissingInput(program.id(), declareID).make();
                        }
                        resolvedInputs.put(declareID, input);
                        break;
                    }
                }
                if (!resolvedInputs.containsKey(declareID)) {
                    throw new ComponentException.MissingInput(program.id(), declareID).make();
                }
            }
        }
        return Collections.unmodifiableMap(resolvedInputs);
    }
}
