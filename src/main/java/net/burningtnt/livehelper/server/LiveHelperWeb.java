package net.burningtnt.livehelper.server;

import com.sun.net.httpserver.HttpServer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

@EventBusSubscriber
public final class LiveHelperWeb {
    private LiveHelperWeb() {
    }

    @SubscribeEvent
    private static void on(FMLClientSetupEvent event) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);
        server.createContext("/", exchange -> {
            // TODO: dispatch request
        });
        server.setExecutor(Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("LiveHelper WebServer").factory()));
        server.start();
    }
}
