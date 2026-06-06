package net.burningtnt.livehelper.components.storage;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.TypeAdapter;
import com.google.gson.TypeAdapterFactory;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonWriter;
import net.burningtnt.livehelper.components.Clip;
import net.burningtnt.livehelper.components.Manager;
import net.burningtnt.livehelper.components.Program;
import net.burningtnt.livehelper.components.ProgramScript;
import net.burningtnt.livehelper.components.Validation;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;

public final class ComponentStorage {
    public static final Gson GSON = new GsonBuilder()
            .setPrettyPrinting()
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

    private static abstract class JsonStorageBucket<T> extends ComponentStorageBucket<T> {
        private final Class<T> clazz;

        JsonStorageBucket(String category, Class<T> clazz) {
            super(category);
            this.clazz = clazz;
        }

        @Override
        protected final T read(int id, InputStream is) {
            T object = GSON.fromJson(new InputStreamReader(is, StandardCharsets.UTF_8), clazz);
            if (id != getID(object)) {
                throw new UnsupportedOperationException("Validation failed: id " + id + " doesn't match with its data.");
            }
            return object;
        }

        @Override
        protected final void write(OutputStream os, T object) {
            GSON.toJson(object, new OutputStreamWriter(os, StandardCharsets.UTF_8));
        }
    }

    public final ComponentStorageBucket<Program> programs = new JsonStorageBucket<>("programs", Program.class) {
        @Override
        protected int getID(Program object) {
            return object.id();
        }
    };

    public final ComponentStorageBucket<ProgramScript> scripts = new ComponentStorageBucket<>("program-scripts") {
        @Override
        protected int getID(ProgramScript object) {
            return object.id();
        }

        @Override
        protected ProgramScript read(int id, InputStream is) throws IOException {
            return ProgramScript.compile(id, new InputStreamReader(is, StandardCharsets.UTF_8).readAllAsString());
        }

        @Override
        protected void write(OutputStream os, ProgramScript object) throws IOException {
            new OutputStreamWriter(os, StandardCharsets.UTF_8).write(object.script());
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

    public CompletableFuture<Runnable> load() {
        CompletableFuture<?>[] futures = {programs.load(), scripts.load(), clips.load(), managers.load()};
        return CompletableFuture.anyOf(futures).thenApply(_ -> () -> {
            for (CompletableFuture<?> future : futures) {
                ((Runnable) future.resultNow()).run();
            }
        });
    }
}
