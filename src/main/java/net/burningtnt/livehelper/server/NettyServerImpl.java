package net.burningtnt.livehelper.server;

import io.jooby.internal.netty.NettyTransport;
import io.jooby.netty.NettyEventLoopGroup;
import io.jooby.netty.NettyServer;
import io.netty.channel.EventLoopGroup;
import org.jspecify.annotations.NonNull;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/* package-private */ class NettyServerImpl extends NettyServer {
    @Override
    protected @NonNull NettyEventLoopGroup createEventLoopGroup() {
        NettyTransport transport = NettyTransport.transport(UIServer.class.getClassLoader());
        EventLoopGroup acceptor = transport.createEventLoop(1, "LiveHelper WebServer Acceptor", 50);
        EventLoopGroup eventLoop = transport.createEventLoop(2, "LiveHelper WebServer IO", 100);
        ExecutorService worker = Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("LiveHelper WebServer Worker").factory());

        return new NettyEventLoopGroup() {
            private boolean closed;

            @Override
            public @NonNull EventLoopGroup acceptor() {
                return acceptor;
            }

            @Override
            public @NonNull EventLoopGroup eventLoop() {
                return eventLoop;
            }

            @Override
            public @NonNull ExecutorService worker() {
                return worker;
            }

            @Override
            public void shutdown() {
                if (!closed) {
                    closed = true;
                    try {
                        try {
                            shutdown(acceptor, 0);
                        } finally {
                            shutdown(eventLoop, 2);
                        }
                    } finally {
                        worker.shutdown();
                    }
                }
            }

            private static void shutdown(EventLoopGroup eventLoopGroup, int quietPeriod) {
                eventLoopGroup.shutdownGracefully(quietPeriod, 15, TimeUnit.SECONDS);
            }
        };
    }
}
