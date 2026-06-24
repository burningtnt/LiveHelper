package net.burningtnt.livehelper.server.components.storage;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.TypeAdapter;
import com.google.gson.TypeAdapterFactory;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonWriter;
import net.burningtnt.livehelper.LiveHelper;
import net.burningtnt.livehelper.server.components.Clip;
import net.burningtnt.livehelper.server.components.Dashboard;
import net.burningtnt.livehelper.server.components.InputValue;
import net.burningtnt.livehelper.server.components.Manager;
import net.burningtnt.livehelper.server.components.Program;
import net.burningtnt.livehelper.server.components.ProgramBinary;
import net.burningtnt.livehelper.server.components.ProgramScript;
import net.burningtnt.livehelper.server.components.Validation;
import net.neoforged.fml.loading.FMLPaths;
import net.neoforged.neoforge.common.util.Lazy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;

public final class ComponentStorage {
    public static final Gson GSON = new GsonBuilder()
            .setPrettyPrinting()
            .registerTypeAdapterFactory(Dashboard.Node.DISPATCH_CONFIGURATION.adapter())
            .registerTypeAdapterFactory(InputValue.DISPATCH_CONFIGURATION.adapter())
            .registerTypeAdapterFactory(new TypeAdapterFactory() {
                @Override
                public <T> TypeAdapter<T> create(Gson gson, TypeToken<T> type) {
                    TypeAdapter<T> delegate = gson.getDelegateAdapter(this, type);
                    return new TypeAdapter<T>() {
                        @Override
                        public void write(JsonWriter out, T value) throws IOException {
                            delegate.write(out, value);
                        }

                        @Override
                        public T read(JsonReader in) throws IOException {
                            T object = delegate.read(in);
                            if (object instanceof Validation validation) {
                                validation.validate();
                            }
                            return object;
                        }
                    };
                }
            })
            .create();

    private static final Logger LOGGER = LoggerFactory.getLogger(ComponentStorage.class);

    public static final Lazy<Path> ROOT = Lazy.of(() ->
            Objects.requireNonNullElse(FMLPaths.CONFIGDIR.get(), Path.of("config"))
                    .toAbsolutePath()
                    .resolve(LiveHelper.MODID)
    );

    private static abstract class JsonStorageBucket<T> extends ComponentStorageBucket<T> {
        private final Class<T> clazz;

        JsonStorageBucket(String category, Class<T> clazz) {
            super(category, "json");
            this.clazz = clazz;
        }

        @Override
        protected final T read(int id, InputStream is) throws IOException {
            try (InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                T object = GSON.fromJson(reader, clazz);
                if (id != getID(object)) {
                    throw new UnsupportedOperationException("Validation failed: id " + id + " doesn't match with its data.");
                }
                return object;
            }
        }

        @Override
        protected final void write(OutputStream os, T object) throws IOException {
            try (OutputStreamWriter writer = new OutputStreamWriter(os, StandardCharsets.UTF_8)) {
                GSON.toJson(object, writer);
            }
        }
    }

    public final ComponentStorageBucket<Program> programs = new JsonStorageBucket<>("programs", Program.class) {
        @Override
        protected int getID(Program object) {
            return object.id();
        }
    };

    public final ComponentStorageBucket<ProgramScript> scripts = new ComponentStorageBucket<>("program-scripts", "text") {
        @Override
        protected int getID(ProgramScript object) {
            return object.id();
        }

        @Override
        protected ProgramScript read(int id, InputStream is) throws IOException {
            try (InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                return new ProgramScript(id, reader.readAllAsString());
            }
        }

        @Override
        protected void write(OutputStream os, ProgramScript object) throws IOException {
            try (OutputStreamWriter writer = new OutputStreamWriter(os, StandardCharsets.UTF_8)) {
                writer.write(object.script());
            }
        }
    };

    public final ComponentStorageBucket<ProgramBinary> binaries = new ComponentStorageBucket<>("program-binaries", "wasm") {
        @Override
        protected int getID(ProgramBinary object) {
            return object.id();
        }

        @Override
        protected ProgramBinary read(int id, InputStream is) throws IOException {
            return new ProgramBinary(id, is.readAllBytes());
        }

        @Override
        protected void write(OutputStream os, ProgramBinary object) throws IOException {
            os.write(object.buffer());
        }
    };

    public final ComponentStorageBucket<Clip> clips = new JsonStorageBucket<>("clips", Clip.class) {
        @Override
        protected int getID(Clip object) {
            return object.id();
        }
    };

    public final ComponentStorageBucket<Manager> managers = new JsonStorageBucket<>("managers", Manager.class) {
        @Override
        protected int getID(Manager object) {
            return object.id();
        }
    };

    public final ComponentStorageBucket<Dashboard> dashboards = new JsonStorageBucket<>("dashboards", Dashboard.class) {
        @Override
        protected int getID(Dashboard object) {
            return object.id();
        }
    };

    private static final String STORE_ROOT = "/assets/live_helper/script-predefined/";

    public CompletableFuture<Runnable> load() {
        return CompletableFuture.runAsync(() -> {
            if (!Files.exists(ROOT.get())) {
                try {
                    String[] files;
                    try (InputStream is = ComponentStorage.class.getResourceAsStream(STORE_ROOT + "index.json")) {
                        files = GSON.fromJson(new String(Objects.requireNonNull(is, LiveHelper.MESSAGE).readAllBytes(), StandardCharsets.UTF_8), String[].class);
                    }

                    Path root = ROOT.get();
                    for (String file : files) {
                        Path v = root.resolve(file);
                        Files.createDirectories(v.getParent());

                        try (InputStream input = Objects.requireNonNull(ComponentStorage.class.getResourceAsStream(STORE_ROOT + file), file);
                             OutputStream os = Files.newOutputStream(v)
                        ) {
                            input.transferTo(os);
                        }
                    }
                } catch (IOException e1) {
                    throw new UncheckedIOException(e1);
                }
            }
        }).thenComposeAsync(_ -> {
            ComponentStorageBucket<?>[] buckets = {programs, scripts, binaries, clips, managers, dashboards};
            CompletableFuture<?>[] futures = new CompletableFuture[buckets.length];
            for (int i = 0; i < buckets.length; i++) {
                futures[i] = buckets[i].load();
            }

            return CompletableFuture.allOf(futures).thenApplyAsync(_ -> () -> {
                for (CompletableFuture<?> future : futures) {
                    try {
                        ((Runnable) future.resultNow()).run();
                    } catch (RuntimeException e) {
                        LOGGER.warn("Cannot initialize storage.", e);
                    }
                }
            });
        });
    }
}
