package net.burningtnt.livehelper.live;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/* package-private */ final class ActiveStreamWorker {
    private ActiveStreamWorker() {
    }

    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(
            Thread.ofPlatform().name("LiveHelper Worker").daemon().factory()
    );

    public record FrameRequest(long timeNs, Future<ActiveStream.RenderRequest> future) {
    }

    public static FrameRequest requestFrame(long durationNs, ActiveStream stream) {
        return new FrameRequest(System.nanoTime(), WORKER.submit(() -> stream.computeFrame(durationNs)));
    }
}
