package net.burningtnt.livehelper.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.jooby.ExecutionMode;
import io.jooby.Jooby;
import io.jooby.MediaType;
import io.jooby.Server;
import io.jooby.StatusCode;
import io.jooby.exception.StatusCodeException;
import io.jooby.handler.AssetSource;
import net.burningtnt.livehelper.LiveHelper;
import net.burningtnt.livehelper.server.components.Clip;
import net.burningtnt.livehelper.server.components.InputValue;
import net.burningtnt.livehelper.server.components.Manager;
import net.burningtnt.livehelper.server.components.Program;
import net.burningtnt.livehelper.server.components.ProgramBinary;
import net.burningtnt.livehelper.server.components.ProgramScript;
import net.burningtnt.livehelper.server.components.storage.ComponentException;
import net.burningtnt.livehelper.server.components.storage.ComponentStorage;
import net.burningtnt.livehelper.server.executor.ProgramScheduler;
import net.burningtnt.livehelper.util.spout.SpoutSender;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.ModList;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.fml.loading.FMLLoader;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.helpers.NOPLogger;

import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@EventBusSubscriber(Dist.CLIENT)
public final class UIServer extends Jooby {
    private static final Logger LOGGER = LoggerFactory.getLogger(UIServer.class);
    private static UIServer INSTANCE;

    @SubscribeEvent
    private static void on(FMLClientSetupEvent event) {
        main();
    }

    static void main() {
        try {
            UIServer application = new UIServer();
            Server server = new NettyServerImpl().setOptions(application.getServerOptions());
            createApp(server, ExecutionMode.EVENT_LOOP, () -> application);
            server.start(application);

            INSTANCE = application;
            LOGGER.info("LiveHelper is started at http://localhost:{}/", INSTANCE.getServerOptions().getPort());
        } catch (Exception e) {
            LOGGER.warn("Cannot launch LiveHelper UI", e);
        }
    }

    @SubscribeEvent
    private static void on(ClientPlayerNetworkEvent.LoggingIn event) {
        ModList mods = ModList.get();
        if (INSTANCE == null || (mods.isLoaded("powertool") && mods.isLoaded("area_control") && mods.isLoaded("toad_sync"))) {
            return;
        }

        String url = "http://localhost:" + INSTANCE.getServerOptions().getPort() + "/";
        event.getPlayer().sendSystemMessage(Component.translatable(
                "live_helper.server_ready",
                Component.literal(url).withStyle(s -> s
                        .withClickEvent(new ClickEvent.OpenUrl(URI.create(url)))
                        .withColor(ChatFormatting.YELLOW)
                        .withUnderlined(true)
                )
        ));
    }

    private UIServer() {
        getServerOptions().setPort(23512);
        getServerOptions().setCompressionLevel(3);
        setWorker(Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("LiveHelper WebServer Router [DEFAULT]").factory()));
        setExecutionMode(ExecutionMode.EVENT_LOOP);

        if (!SpoutSender.AVAILABLE) {
            before(ctx -> {
                ctx.setResponseType(MediaType.HTML);
                ctx.setResponseCode(503);

                try (InputStream is = UIServer.class.getResourceAsStream("/assets/live_helper/fatal.html")) {
                    String content = new String(Objects.requireNonNull(is, LiveHelper.MESSAGE).readAllBytes(), StandardCharsets.UTF_8)
                            .replace("{ERROR_ID}", "SPOUT_UNAVAILABLE");
                    ctx.send(content);
                }
            });
            return;
        }

        install(new GsonModule(ComponentStorage.GSON));

        ComponentStorage storage = new ComponentStorage();
        ProgramScheduler scheduler = new ProgramScheduler(storage);
        ExecutorService apiExecutor = Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("LiveHelper WebServer Router [API]").factory());
        storage.load()
                .thenAcceptAsync(Runnable::run, apiExecutor)
                .whenCompleteAsync((_, t) -> {
                    if (t != null) {
                        LOGGER.warn("Cannot initialize LiveHelper", t);
                    }
                });


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

                String script = ctx.getRequestLength() == 0 ? "" : ctx.body(String.class);
                storage.scripts.set(new ProgramScript(programID, script));
                throw new StatusCodeException(StatusCode.NO_CONTENT);
            });

            patch("/program/{id}/wasm", ctx -> {
                int programID = Integer.parseInt(Objects.requireNonNull(ctx.path("id").valueOrNull()));
                if (!storage.programs.contains(programID)) {
                    throw new StatusCodeException(StatusCode.NOT_FOUND);
                }

                byte[] v = ctx.body().stream().readAllBytes();
                storage.binaries.set(new ProgramBinary(programID, v));
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

                switch (ctx.body(JsonObject.class).get("status").getAsString()) {
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

            post("/queue/pose", _ -> UIPoseRequest.submit());
            get("/queue/{key}", ctx -> {
                String key = Objects.requireNonNull(ctx.path("key").valueOrNull());

                switch (UIPoseRequest.get(key)) {
                    case UIPoseRequest.State.Pending _ -> throw new StatusCodeException(StatusCode.ACCEPTED);
                    case UIPoseRequest.State.Nil _ -> throw new StatusCodeException(StatusCode.NOT_FOUND);
                    case UIPoseRequest.State.Ready(_, InputValue.Pose value) -> {
                        return value;
                    }
                }
            });

            error(ComponentException.class, (ctx, cause, _) -> {
                ctx.setResponseCode(StatusCode.SERVER_ERROR);
                ctx.send(ComponentStorage.GSON.toJson(((ComponentException) cause).collect()));
                LOGGER.warn("Uncaught component exception.", cause);
            });
        }));

        AssetSource asset;
        if (FMLLoader.getCurrentOrNull() == null || !FMLEnvironment.isProduction()) {
            asset = AssetSource.create(Path.of("../src/frontend/packages/frontend/build/client"));
        } else {
            asset = AssetSource.create(UIServer.class.getClassLoader(), "/assets/live_helper/webassets");
        }
        assets("/**", asset);
    }

    private Object encodeActivation(ProgramScheduler.ManagerStatus status) {
        JsonObject object = new JsonObject();
        switch (status) {
            case ProgramScheduler.ManagerStatus.Running _ -> object.addProperty("status", "running");
            case ProgramScheduler.ManagerStatus.Failed(_, _, Exception exception) -> {
                object.addProperty("status", "error");
                JsonArray payload = new JsonArray();
                if (exception instanceof ComponentException e) {
                    for (String part : e.collect()) {
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

    @Override
    public @NonNull Logger getLog() {
        return NOPLogger.NOP_LOGGER;
    }
}