package net.burningtnt.livehelper.components;

import com.dylibso.chicory.wasm.Parser;
import com.dylibso.chicory.wasm.WasmModule;

import java.io.IOException;
import java.util.concurrent.CompletableFuture;

public record ProgramScript(int id, String script, CompletableFuture<WasmModule> module) {
    private static final Parser PARSER = Parser.builder().withValidation(true).build();

    public static ProgramScript compile(int id, String script) throws IOException {
        return new ProgramScript(id, script, new CompletableFuture<>()); // TODO: Compile wasm module!
    }
}
