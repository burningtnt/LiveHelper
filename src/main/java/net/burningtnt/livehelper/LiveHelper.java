package net.burningtnt.livehelper;

import net.minecraft.resources.Identifier;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.client.gui.ConfigurationScreen;
import net.neoforged.neoforge.client.gui.IConfigScreenFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;

@Mod(value = LiveHelper.MODID)
public final class LiveHelper {
    private static final Logger LOGGER = LoggerFactory.getLogger(LiveHelper.class);

    public static final String MODID = "live_helper";

    public LiveHelper(ModContainer container) {
        if (FMLEnvironment.getDist() != Dist.CLIENT) {
            throw new UnsupportedOperationException("This mod may only works in clientside.");
        }

        container.registerExtensionPoint(IConfigScreenFactory.class, ConfigurationScreen::new);

        if (!FMLEnvironment.isProduction()) {
            Thread.ofPlatform().daemon().name("LiveHelper Debugger").start(() -> {
                while (true) {
                    LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));
                }
            });
        }
    }

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(MODID, path);
    }
}
