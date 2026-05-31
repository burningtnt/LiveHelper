package net.burningtnt.livehelper;

import org.jspecify.annotations.NonNull;

import java.util.PriorityQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import java.util.function.IntSupplier;

public final class MainScheduler {
    public interface ExecutableTask {
        void run(boolean isOutOfMemoryRecovery, long startNs);
    }

    public static abstract class Scheduler {
        private boolean stopped;

        public final void schedule(ExecutableTask task) {
            if (this.stopped) {
                throw new IllegalArgumentException("Scheduler has stopped.");
            }

            scheduleInternal(task);
        }

        protected final void submitTask(long nano, ExecutableTask task) {
            if (this.stopped) {
                throw new IllegalArgumentException("Scheduler has stopped.");
            }

            MainScheduler.submitDirect(nano, task);
        }

        protected abstract void scheduleInternal(ExecutableTask task);

        protected final boolean stopped() {
            return this.stopped;
        }

        public void stop() {
            this.stopped = true;
        }
    }

    public static Scheduler ofFrame(IntSupplier frameRateSupplier) {
        return new Scheduler() {
            @Override
            protected void scheduleInternal(ExecutableTask task) {
                submitTask(System.nanoTime(), new ExecutableTask() {
                    @Override
                    public void run(boolean isOutOfMemoryRecovery, long startNs) {
                        if (stopped()) {
                            return;
                        }

                        task.run(isOutOfMemoryRecovery, startNs);

                        int frameRate = frameRateSupplier.getAsInt();
                        if (frameRate < 260) {
                            submitTask(startNs + TimeUnit.SECONDS.toNanos(1) / frameRate, this);
                        } else {
                            submitTask(System.nanoTime(), this);
                        }
                    }
                });
            }
        };
    }

    // FIXME: May create massive objects, causing GC problems.
    private record Task(long nano, ExecutableTask task) implements Comparable<Task> {
        @Override
        public int compareTo(MainScheduler.@NonNull Task o) {
            return Long.compare(this.nano, o.nano);
        }
    }

    private static final PriorityQueue<Task> QUEUE = new PriorityQueue<>(16);

    private static void submitDirect(long nano, ExecutableTask task) {
        QUEUE.add(new Task(nano, task));
    }

    public static void tick(boolean isOutOfMemoryRecovery) {
        Task task = QUEUE.peek();
        if (task == null) {
            throw new IllegalStateException("Should NOT be here: No tasks are scheduled.");
        }

        if (task.nano - System.nanoTime() > TimeUnit.MILLISECONDS.toNanos(10)) {
            LockSupport.parkNanos(TimeUnit.MICROSECONDS.toNanos(5));
            return;
        }

        QUEUE.remove(task);
        sleepUntil(task.nano);

        task.task.run(isOutOfMemoryRecovery, task.nano);
    }

    private static final double OVERSHOOT_SMOOTHING = 0.1;
    private static final long MAX_CURRENT_OVERSHOOT_NS = TimeUnit.MILLISECONDS.toNanos(25);
    private static final long MAX_AVERAGE_OVERSHOOT_NS = TimeUnit.MILLISECONDS.toNanos(2);
    private static final long SPIN_SAFETY_BUFFER_NS = 500000L;

    // Smart sleep & spin wait implementation to eliminate overshoot.
    private static long averageOvershootNs = 0L;

    private static void sleepUntil(long targetTimeNs) {
        long remainingTimeNs;
        while ((remainingTimeNs = targetTimeNs - System.nanoTime()) > 0L) {
            if (remainingTimeNs > averageOvershootNs + SPIN_SAFETY_BUFFER_NS) {
                long sleepStartTimeNs = System.nanoTime();
                long expectedSleepTimeNs = remainingTimeNs - averageOvershootNs - SPIN_SAFETY_BUFFER_NS;
                if (!Thread.interrupted()) {
                    LockSupport.parkNanos(expectedSleepTimeNs);
                    long currentOvershootNs = System.nanoTime() - sleepStartTimeNs - expectedSleepTimeNs;
                    if (currentOvershootNs > 0L && currentOvershootNs < MAX_CURRENT_OVERSHOOT_NS) {
                        averageOvershootNs = Math.min(
                                (long) (OVERSHOOT_SMOOTHING * currentOvershootNs + (1 - OVERSHOOT_SMOOTHING) * averageOvershootNs),
                                MAX_AVERAGE_OVERSHOOT_NS
                        );
                    }
                }
            } else {
                Thread.onSpinWait();
            }
        }
    }
}
