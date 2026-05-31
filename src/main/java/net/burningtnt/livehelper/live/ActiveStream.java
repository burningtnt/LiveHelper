package net.burningtnt.livehelper.live;

import org.jetbrains.annotations.Nullable;

public interface ActiveStream {
    record Config(
            String name, int width, int height, int fps, int renderDistance,
            boolean renderHUD, boolean renderHand
    ) {
    }

    record RenderRequest(
            double x, double y, double z,
            float qx, float qy, float qz, float qw,
            float fov
    ) {
    }

    @Nullable
    RenderRequest computeFrame(long durationNs);
}
