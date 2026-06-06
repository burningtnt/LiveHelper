package net.burningtnt.livehelper.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.jooby.ExecutionMode;
import io.jooby.Jooby;
import io.jooby.StatusCode;
import io.jooby.exception.StatusCodeException;
import io.jooby.handler.AssetSource;
import io.jooby.internal.netty.NettyTransport;
import io.jooby.netty.NettyEventLoopGroup;
import io.jooby.netty.NettyServer;
import io.netty.channel.EventLoopGroup;
import net.burningtnt.livehelper.components.Clip;
import net.burningtnt.livehelper.components.Manager;
import net.burningtnt.livehelper.components.Program;
import net.burningtnt.livehelper.components.ProgramScript;
import net.burningtnt.livehelper.components.executor.ProgramScheduler;
import net.burningtnt.livehelper.components.storage.ComponentException;
import net.burningtnt.livehelper.components.storage.ComponentStorage;
import net.minecraft.client.Minecraft;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.fml.loading.FMLEnvironment;
import org.jspecify.annotations.NonNull;

import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@EventBusSubscriber
public final class UIServer extends Jooby {
    private static UIServer INSTANCE;

    @SubscribeEvent
    private static void on(FMLClientSetupEvent event) {
        INSTANCE = new UIServer();
        runApp(
                new String[0],
                new NettyServer() {
                    @Override
                    protected @NonNull NettyEventLoopGroup createEventLoopGroup() {
                        NettyTransport transport = NettyTransport.transport(UIServer.class.getClassLoader());
                        EventLoopGroup acceptor = transport.createEventLoop(1, "LiveHelper WebServer Acceptor", 50);
                        EventLoopGroup eventLoop = transport.createEventLoop(2, "LiveHelper WebServer IO", 100);
                        ExecutorService worker = Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("LiveHelper WebServer Worker").factory());

                        return new NettyEventLoopGroup() {
                            private boolean closed;

                            @Override
                            public @NonNull EventLoopGroup acceptor() {
                                return acceptor;
                            }

                            @Override
                            public @NonNull EventLoopGroup eventLoop() {
                                return eventLoop;
                            }

                            @Override
                            public @NonNull ExecutorService worker() {
                                return worker;
                            }

                            @Override
                            public void shutdown() {
                                if (!closed) {
                                    closed = true;
                                    try {
                                        try {
                                            shutdown(acceptor, 0);
                                        } finally {
                                            shutdown(eventLoop, 2);
                                        }
                                    } finally {
                                        worker.shutdown();
                                    }
                                }
                            }

                            private static void shutdown(EventLoopGroup eventLoopGroup, int quietPeriod) {
                                eventLoopGroup.shutdownGracefully(quietPeriod, 15, TimeUnit.SECONDS);
                            }
                        };
                    }
                },
                ExecutionMode.EVENT_LOOP,
                () -> INSTANCE
        );
    }

    private UIServer() {
        ComponentStorage storage = new ComponentStorage();
        storage.load().thenAcceptAsync(Runnable::run, Minecraft.getInstance());
        ProgramScheduler scheduler = new ProgramScheduler(storage);

        setWorker(Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("LiveHelper WebServer Router [DEFAULT]").factory()));
        setExecutionMode(ExecutionMode.EVENT_LOOP);
        install(new GsonModule(ComponentStorage.GSON));

        ExecutorService apiExecutor = Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("LiveHelper WebServer Router [API]").factory());
        dispatch(apiExecutor, () -> path("/api/v1", () -> {
            get("/program", _ -> storage.programs.getAll());
            post("/program", ctx -> {
                Program program = ctx.body(Program.class);
                try {
                    storage.programs.put(program);
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDDuplicate) {
                        throw new StatusCodeException(StatusCode.CONFLICT);
                    }
                    throw e;
                }
            });
            get("/program/{id}", ctx -> {
                int programID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                try {
                    return storage.programs.get(programID);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });
            patch("/program/{id}", ctx -> {
                int programID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                Program program = ctx.body(Program.class);
                if (program.id() != programID) {
                    throw new StatusCodeException(StatusCode.BAD_REQUEST);
                }
                try {
                    storage.programs.update(program);
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });
            delete("/program/{id}", ctx -> {
                int programID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                for (Clip clip : storage.clips.getAll()) {
                    if (clip.programID() == programID) {
                        throw new StatusCodeException(StatusCode.CONFLICT);
                    }
                }
                for (Manager manager : storage.managers.getAll()) {
                    if (manager.programID() == programID) {
                        throw new StatusCodeException(StatusCode.CONFLICT);
                    }
                }

                try {
                    storage.programs.remove(programID);
                    storage.scripts.removeIfExist(programID);
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });
            get("/program/{id}/code", ctx -> {
                int programID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                if (!storage.programs.contains(programID)) {
                    throw new StatusCodeException(StatusCode.NOT_FOUND);
                }
                ProgramScript script = storage.scripts.getOrDefault(programID, null);
                return script == null ? "" : script.script();
            });
            patch("/program/{id}/code", ctx -> {
                int programID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                if (!storage.programs.contains(programID)) {
                    throw new StatusCodeException(StatusCode.NOT_FOUND);
                }

                String script = ctx.body(String.class);
                storage.scripts.set(ProgramScript.compile(programID, script));
                throw new StatusCodeException(StatusCode.NO_CONTENT);
            });

            get("/clip", _ -> storage.clips.getAll());
            post("/clip", ctx -> {
                Clip clip = ctx.body(Clip.class);
                if (!storage.programs.contains(clip.programID())) {
                    throw new StatusCodeException(StatusCode.BAD_REQUEST);
                }
                try {
                    storage.clips.put(clip);
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDDuplicate) {
                        throw new StatusCodeException(StatusCode.CONFLICT);
                    }
                    throw e;
                }
            });
            get("/clip/{id}", ctx -> {
                int clipID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                try {
                    return storage.clips.get(clipID);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });
            patch("/clip/{id}", ctx -> {
                int clipID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                Clip clip = ctx.body(Clip.class);
                if (clip.id() != clipID) {
                    throw new StatusCodeException(StatusCode.BAD_REQUEST);
                }
                if (!storage.programs.contains(clip.programID())) {
                    throw new StatusCodeException(StatusCode.BAD_REQUEST);
                }
                try {
                    storage.clips.update(clip);
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });
            delete("/clip/{id}", ctx -> {
                int clipID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                for (Manager manager : storage.managers.getAll()) {
                    for (int id : manager.clips()) {
                        if (id == clipID) {
                            throw new StatusCodeException(StatusCode.CONFLICT);
                        }
                    }
                }

                try {
                    storage.clips.remove(clipID);
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });

            get("/manager", _ -> storage.managers.getAll());
            post("/manager", ctx -> {
                Manager manager = ctx.body(Manager.class);

                if (!storage.programs.contains(manager.programID())) {
                    throw new StatusCodeException(StatusCode.BAD_REQUEST);
                }
                for (int clipID : manager.clips()) {
                    if (!storage.clips.contains(clipID)) {
                        throw new StatusCodeException(StatusCode.BAD_REQUEST);
                    }
                }

                try {
                    storage.managers.put(manager);
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDDuplicate) {
                        throw new StatusCodeException(StatusCode.CONFLICT);
                    }
                    throw e;
                }
            });
            get("/manager/{id}", ctx -> {
                int managerID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                try {
                    return storage.managers.get(managerID);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });
            patch("/manager/{id}", ctx -> {
                int managerID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                Manager manager = ctx.body(Manager.class);
                if (manager.id() != managerID) {
                    throw new StatusCodeException(StatusCode.BAD_REQUEST);
                }

                if (!storage.programs.contains(manager.programID())) {
                    throw new StatusCodeException(StatusCode.BAD_REQUEST);
                }
                for (int clipID : manager.clips()) {
                    if (!storage.clips.contains(clipID)) {
                        throw new StatusCodeException(StatusCode.BAD_REQUEST);
                    }
                }

                try {
                    storage.managers.update(manager);
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });
            delete("/manager/{id}", ctx -> {
                int managerID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));

                try {
                    storage.managers.remove(managerID);
                    switch (scheduler.getStatus(managerID)) {
                        case ProgramScheduler.ManagerStatus.Running running -> running.stop();
                        case ProgramScheduler.ManagerStatus.Failed failed -> failed.forget();
                        case ProgramScheduler.ManagerStatus.Nil _ -> {
                        }
                    }
                    throw new StatusCodeException(StatusCode.NO_CONTENT);
                } catch (ComponentException e) {
                    if (e.getType() instanceof ComponentException.IDNotFound) {
                        throw new StatusCodeException(StatusCode.NOT_FOUND);
                    }
                    throw e;
                }
            });

            get("/manager/{id}/activation", ctx -> {
                int managerID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                if (!storage.managers.contains(managerID)) {
                    throw new StatusCodeException(StatusCode.NOT_FOUND);
                }

                return encodeActivation(scheduler.getStatus(managerID));
            });
            patch("/manager/{id}/activation", ctx -> {
                int managerID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                if (!storage.managers.contains(managerID)) {
                    throw new StatusCodeException(StatusCode.NOT_FOUND);
                }

                switch (ctx.body(JsonObject.class).getAsString()) {
                    case "running" -> {
                        if (scheduler.getStatus(managerID) instanceof ProgramScheduler.ManagerStatus.Running running) {
                            running.stop();
                        }

                        scheduler.launch(managerID);
                    }
                    case "disabled" -> {
                        if (scheduler.getStatus(managerID) instanceof ProgramScheduler.ManagerStatus.Running running) {
                            running.stop();
                        }
                    }
                    case null, default -> throw new StatusCodeException(StatusCode.BAD_REQUEST);
                }
                throw new StatusCodeException(StatusCode.NO_CONTENT);
            });

            error(ComponentException.class, (ctx, cause, _) -> {
                ctx.setResponseCode(StatusCode.SERVER_ERROR);
                ctx.send(ComponentStorage.GSON.toJson(((ComponentException) cause).getType().toRoute()));
            });

            if (FMLEnvironment.isProduction()) {
                assets("/**", AssetSource.create(UIServer.class.getClassLoader(), "/assets/live_helper/webassets"));
            }
        }));
    }

    private Object encodeActivation(ProgramScheduler.ManagerStatus status) {
        JsonObject object = new JsonObject();
        switch (status) {
            case ProgramScheduler.ManagerStatus.Running _ -> object.addProperty("status", "running");
            case ProgramScheduler.ManagerStatus.Failed(_, _, Exception exception) -> {
                object.addProperty("status", "error");
                JsonArray payload = new JsonArray();
                if (exception instanceof ComponentException e) {
                    for (String part : e.getType().toRoute()) {
                        payload.add(part);
                    }
                } else {
                    payload.add("unknown");
                }
                object.add("error", payload);
            }
            case ProgramScheduler.ManagerStatus.Nil _ -> object.addProperty("status", "disabled");
        }
        return object;
    }
}