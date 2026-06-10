package net.burningtnt.livehelper.server;

import net.burningtnt.livehelper.LiveHelper;
import net.burningtnt.livehelper.server.components.InputValue;
import net.burningtnt.livehelper.util.AngleConvert;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.phys.Vec2;
import net.minecraft.world.phys.Vec3;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.InputEvent;
import net.neoforged.neoforge.client.event.RegisterGuiLayersEvent;
import org.joml.Quaternionf;
import org.joml.Vector3f;

import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static java.lang.Math.round;

@EventBusSubscriber(Dist.CLIENT)
public final class UIPoseRequest {
    public sealed interface State {
        record Pending(long timestamp, String key) implements State {
        }

        record Nil() implements State {
            public static final Nil INSTANCE = new Nil();
        }

        record Ready(String key, InputValue.Pose value) implements State {
        }
    }

    private static final AtomicReference<State> V = new AtomicReference<>(State.Nil.INSTANCE);

    public static String submit() {
        String key = UUID.randomUUID().toString();
        V.set(new State.Pending(System.currentTimeMillis(), key));
        return key;
    }

    public static State get(String key) {
        return switch (V.get()) {
            case State.Pending pending -> pending.key.equals(key) ? pending : State.Nil.INSTANCE;
            case State.Ready ready -> ready.key.equals(key) ? ready : State.Nil.INSTANCE;
            case State.Nil nil -> nil;
        };
    }

    @SubscribeEvent
    private static void on(RegisterGuiLayersEvent event) {
        event.registerAboveAll(LiveHelper.id("ui_pose_request_layer"), (graphics, _) -> {
            if (!(V.get() instanceof State.Pending(
                    long timestamp, _
            )) || System.currentTimeMillis() - timestamp >= TimeUnit.SECONDS.toMillis(60)) {
                return;
            }

            Minecraft minecraft = Minecraft.getInstance();
            Font font = minecraft.font;
            FormattedCharSequence text = Component.translatable("live_helper.pose_request", minecraft.options.keySwapOffhand.getTranslatedKeyMessage())
                    .getVisualOrderText();

            float x = graphics.guiWidth() / 2f;
            float y = graphics.guiHeight() * 0.62f;
            float w2 = font.width(text) / 2f;
            graphics.fill(round(x - w2 - 5), round(y - 5), round(x + w2 + 5), round(y + font.lineHeight + 5), 0xFF052f4a);
            graphics.fill(round(x - w2 - 4), round(y - 4), round(x + w2 + 4), round(y + font.lineHeight + 4), 0xCC90caf9);
            graphics.text(font, text, round(x - w2), round(y), 0xFFFFFFFF);
        });
    }

    @SubscribeEvent
    private static void on(InputEvent.Key event) {
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.player != null
                && V.get() instanceof State.Pending pending
                && System.currentTimeMillis() - pending.timestamp < TimeUnit.SECONDS.toMillis(60)
                && minecraft.options.keySwapOffhand.consumeClick()
        ) {
            Vec3 position = minecraft.player.getEyePosition();
            Vector3f rotation = new Vector3f().set(minecraft.player.getXRot(), minecraft.player.getYRot(), 0);
            Quaternionf q = AngleConvert.convert(rotation, new Quaternionf());

            V.compareAndSet(pending, new State.Ready(pending.key, new InputValue.Pose(pending.key,
                    new InputValue.Pose.PoseInstance((float) position.x, (float) position.y, (float) position.z, q.x, q.y, q.z, q.w)
            )));
        }
    }
}
