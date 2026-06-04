package net.burningtnt.livehelper.live;

import org.jetbrains.annotations.Nullable;

import java.util.List;

public interface ActiveStream {
    record Config(
            String name, int width, int height, int fps, int renderDistance
    ) {
    }

    record FrameRequest(
            double x, double y, double z,
            float qx, float qy, float qz, float qw,
            float fov,
            boolean renderHUD, boolean renderHand
    ) {
    }

    sealed interface RenderStep {
        int MAX_BUFFER = 16;

        @interface Buffer {
        }

        record Render(FrameRequest request, @Buffer int target) implements RenderStep {
        }

        record Mix(@Buffer int left, @Buffer int right, @Buffer int target, float progress) implements RenderStep {
        }

        record Display(@Buffer int target) implements RenderStep {
        }
    }

    @Nullable
    List<RenderStep> computeFrame(long durationNs);
}
