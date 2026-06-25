package net.burningtnt.livehelper;

import net.minecraft.resources.Identifier;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.client.gui.ConfigurationScreen;
import net.neoforged.neoforge.client.gui.IConfigScreenFactory;
import net.neoforged.neoforge.common.ModConfigSpec;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;

@Mod(value = LiveHelper.MODID, dist = Dist.CLIENT)
public final class LiveHelper {
    public static final String MODID = "live_helper";

    public static ModConfigSpec.ConfigValue<Boolean> ENABLE_MULTI_CONTEXT_WORKAROUND;

    public static final String MESSAGE = "Cannot setup LiveHelper, probably in development environment?";

    public LiveHelper(ModContainer container) {
        container.registerExtensionPoint(IConfigScreenFactory.class, ConfigurationScreen::new);

        ModConfigSpec.Builder client = new ModConfigSpec.Builder();
        ENABLE_MULTI_CONTEXT_WORKAROUND = client
                .define("enable_multi_context_workaround", () -> false);

        container.registerConfig(ModConfig.Type.CLIENT, client.build());

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
