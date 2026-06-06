package net.burningtnt.livehelper.components.storage;

import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.burningtnt.livehelper.LiveHelper;
import net.neoforged.fml.loading.FMLPaths;
import org.jetbrains.annotations.Nullable;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

public abstract class ComponentStorageBucket<T> {
    private static final Logger LOGGER = LoggerFactory.getLogger(ComponentStorageBucket.class);

    private static final ExecutorService WORKER = new ThreadPoolExecutor(
            0, 1,
            5, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(),
            Thread.ofPlatform().name("Component Database").factory()
    );

    private interface Executable {
        void execute() throws Exception;
    }

    private void enqueueWork(Executable task) {
        WORKER.execute(() -> {
            try {
                task.execute();
            } catch (Exception e) {
                LOGGER.warn("Cannot execute task.", e);
            }
        });
    }

    private final Int2ObjectMap<T> storage = new Int2ObjectOpenHashMap<>();
    private final String category;

    protected ComponentStorageBucket(String category) {
        this.category = category;
    }

    protected abstract int getID(T object);

    protected abstract T read(int id, InputStream is) throws IOException;

    protected abstract void write(OutputStream os, T object) throws IOException;

    public T get(int id) throws ComponentException {
        T object = storage.get(id);
        if (object == null) {
            throw new ComponentException.IDNotFound(id).make();
        }
        return object;
    }

    public T getOrDefault(int id, T defaultValue) throws ComponentException {
        return storage.getOrDefault(id, defaultValue);
    }

    public boolean contains(int id) {
        return storage.containsKey(id);
    }

    public List<T> getAll() {
        return new ArrayList<>(storage.values());
    }

    public void put(T object) throws ComponentException {
        int id = getID(object);
        if (storage.putIfAbsent(id, object) != null) {
            throw new ComponentException.IDDuplicate(id).make();
        }
        enqueueUpdate(id, object);
    }

    public void update(T object) throws ComponentException {
        int id = getID(object);
        if (storage.replace(id, object) == null) {
            throw new ComponentException.IDNotFound(id).make();
        }
        enqueueUpdate(id, object);
    }

    public void set(T object) {
        int id = getID(object);
        storage.put(id, object);
        enqueueUpdate(id, object);
    }

    public void remove(int id) throws ComponentException {
        if (storage.remove(id) == null) {
            throw new ComponentException.IDNotFound(id).make();
        }
        enqueueUpdate(id, null);
    }

    public void removeIfExist(int id) {
        if (storage.remove(id) != null) {
            enqueueUpdate(id, null);
        }
    }

    @NonNull
    private Path computeBase() {
        return FMLPaths.CONFIGDIR.get().resolve(LiveHelper.MODID).resolve("storage." + category);
    }

    public CompletableFuture<Runnable> load() {
        return CompletableFuture.supplyAsync(() -> {
            List<T> values = new ArrayList<>();
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(computeBase(), p -> p.getFileName().endsWith(".dat"))) {
                for (Path path : stream) {
                    String filename = path.getFileName().toString();
                    int id;
                    try {
                        id = Integer.parseInt(filename, 0, filename.length() - ".dat".length(), 16);
                    } catch (NumberFormatException e) {
                        LOGGER.warn("Cannot parse {}: invalid filename {}", category, filename, e);
                        continue;
                    }

                    try (InputStream is = Files.newInputStream(path)) {
                        values.add(read(id, is));
                    } catch (Throwable e) {
                        LOGGER.warn("Cannot parse {}#{}", category, id, e);
                    }
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }

            return () -> {
                for (T value : values) {
                    try {
                        put(value);
                    } catch (ComponentException e) {
                        LOGGER.warn("Cannot load {}#{}", category, getID(value), e);
                    }
                }
            };
        }, WORKER);
    }

    public CompletableFuture<?> fence() {
        return CompletableFuture.runAsync(() -> {}, WORKER);
    }

    private void enqueueUpdate(int id, @Nullable T object) {
        Path path = computeBase().resolve(Integer.toHexString(id) + ".dat");
        if (object == null) {
            enqueueWork(() -> {
                Files.deleteIfExists(path);
            });
        } else {
            enqueueWork(() -> {
                if (Files.exists(path)) {
                    Path tmp = Files.createTempFile(path.getParent(), path.getFileName().toString() + ".", "");
                    try (OutputStream os = Files.newOutputStream(tmp)) {
                        write(os, object);
                    }
                    Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } else {
                    Files.createDirectories(path.getParent());
                }
            });
        }
    }
}
