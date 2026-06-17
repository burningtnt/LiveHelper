package net.burningtnt.livehelper.util.spout;

import oshi.PlatformEnum;
import oshi.SystemInfo;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.invoke.MethodHandle;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;

import static java.lang.foreign.ValueLayout.ADDRESS;
import static java.lang.foreign.ValueLayout.JAVA_INT;

/* package-private */ final class SpoutSupport {
    private SpoutSupport() {
    }

    public static final boolean AVAILABLE;
    public static final MethodHandle spCreateSpout, spReleaseSpout, spSendFrameBufferObject, spSendTexture;

    static {
        if (SystemInfo.getCurrentPlatform() != PlatformEnum.WINDOWS) {
            AVAILABLE = false;
            spCreateSpout = null;
            spReleaseSpout = null;
            spSendFrameBufferObject = null;
            spSendTexture = null;
        } else {
            Path library;
            try {
                library = Files.createTempFile("libSpoutBinding-", ".dll").toAbsolutePath();
                try (InputStream is = SpoutSupport.class.getResourceAsStream("/assets/live_helper/libSpoutBinding.dll");
                     OutputStream os = Files.newOutputStream(library)
                ) {
                    Objects.requireNonNull(is, "Missing libSpoutBinding.dll, SHOULD NOT be HERE").transferTo(os);
                }
            } catch (IOException e) {
                throw new ExceptionInInitializerError(e);
            }

            System.load(library.toString());
            SymbolLookup lookup = SymbolLookup.libraryLookup(library, Arena.global())
                    .or(SymbolLookup.loaderLookup())
                    .or(Linker.nativeLinker().defaultLookup());

            AVAILABLE = true;
            spCreateSpout = Linker.nativeLinker().downcallHandle(
                    lookup.findOrThrow("spCreateSpout"),
                    FunctionDescriptor.of(ADDRESS, ADDRESS)
            );
            spReleaseSpout = Linker.nativeLinker().downcallHandle(
                    lookup.findOrThrow("spReleaseSpout"),
                    FunctionDescriptor.ofVoid(ADDRESS)
            );
            spSendFrameBufferObject = Linker.nativeLinker().downcallHandle(
                    lookup.findOrThrow("spSendFrameBufferObject"),
                    FunctionDescriptor.of(JAVA_INT, ADDRESS, JAVA_INT, JAVA_INT, JAVA_INT)
            );
            spSendTexture = Linker.nativeLinker().downcallHandle(
                    lookup.findOrThrow("spSendTexture"),
                    FunctionDescriptor.of(JAVA_INT, ADDRESS, JAVA_INT, JAVA_INT, JAVA_INT, JAVA_INT, JAVA_INT)
            );
        }
    }

    public static MemorySegment create(String name) {
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment buffer = arena.allocateFrom(name.replace('\0', '_'), StandardCharsets.US_ASCII);
            return (MemorySegment) spCreateSpout.invokeExact(buffer);
        } catch (Throwable t) {
            throw raise(t);
        }
    }

    public static int sendFrameBufferObject(MemorySegment handle, int fbo, int width, int height) {
        try {
            return (int) spSendFrameBufferObject.invokeExact(handle, fbo, width, height);
        } catch (Throwable t) {
            throw raise(t);
        }
    }

    public static int sendTexture(MemorySegment handle, int textureID, int textureType, int width, int height, int hostFbo) {
        try {
            return (int) spSendTexture.invokeExact(handle, textureID, textureType, width, height, hostFbo);
        } catch (Throwable t) {
            throw raise(t);
        }
    }

    public static void release(MemorySegment handle) {
        try {
            spReleaseSpout.invokeExact(handle);
        } catch (Throwable t) {
            throw raise(t);
        }
    }

    private static RuntimeException raise(Throwable t) {
        if (t instanceof Error e) {
            throw e;
        } else if (t instanceof RuntimeException e) {
            throw e;
        } else {
            throw new AssertionError("Should NOT be here", t);
        }
    }
}

