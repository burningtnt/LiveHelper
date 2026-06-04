package net.burningtnt.livehelper.components;

import com.dylibso.chicory.wasm.WasmModule;

import java.nio.file.Path;

public record ProgramScript(int id, Path wasm, WasmModule module) {
}
