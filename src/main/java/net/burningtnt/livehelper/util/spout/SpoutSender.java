package net.burningtnt.livehelper.util.spout;

import java.lang.foreign.MemorySegment;
import java.lang.ref.Cleaner;
import java.lang.ref.Reference;

public final class SpoutSender implements AutoCloseable {
    private static final Cleaner CLEANER = Cleaner.create();

    private final MemorySegment spout;
    private final Cleaner.Cleanable cleanable;

    private record CleanableImpl(MemorySegment spout) implements Runnable {
        @Override
        public void run() {
            SpoutSupport.release(spout);
        }
    }

    public SpoutSender(String name) {
        this.spout = SpoutSupport.create(name);
        this.cleanable = CLEANER.register(this, new CleanableImpl(spout));
    }

    public void sendFrameBufferObject(int glFrameBuffer, int width, int height) {
        try {
            int code = SpoutSupport.sendFrameBufferObject(this.spout, glFrameBuffer, width, height);
            switch (code) {
                case 0 -> throw new RuntimeException("Unable to send Frame Buffer Object " + glFrameBuffer);
                case 1 -> {}
                default -> throw new AssertionError("Unknown return value: " + code);
            }
        } finally {
            Reference.reachabilityFence(this);
        }
    }

    @Override
    public void close() {
        this.cleanable.clean();
    }
}
