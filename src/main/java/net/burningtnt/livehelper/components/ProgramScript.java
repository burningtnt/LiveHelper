package net.burningtnt.livehelper.components;

import com.dylibso.chicory.wasm.Parser;
import com.dylibso.chicory.wasm.WasmModule;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

public record ProgramScript(int id, Path wasm, WasmModule module) {
    private static final Parser PARSER = Parser.builder().withValidation(true).build();

    public static ProgramScript of(int id, Path wasm) throws IOException {
        try (InputStream is = Files.newInputStream(wasm)) {
            return new ProgramScript(id, wasm, PARSER.parse(() -> is));
        }
    }
}
