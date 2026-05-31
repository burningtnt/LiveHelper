package net.burningtnt.livehelper;

import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.client.gui.ConfigurationScreen;
import net.neoforged.neoforge.client.gui.IConfigScreenFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Mod(value = LiveHelper.MODID)
public class LiveHelper {
    private static final Logger LOGGER = LoggerFactory.getLogger(LiveHelper.class);

    public static final String MODID = "live_helper";

    public LiveHelper(ModContainer container) {
        if (FMLEnvironment.getDist() != Dist.CLIENT) {
            throw new UnsupportedOperationException("This mod may only works in clientside.");
        }

        container.registerExtensionPoint(IConfigScreenFactory.class, ConfigurationScreen::new);
    }
}
