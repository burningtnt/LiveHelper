package net.burningtnt.livehelper.server.components;

import com.google.gson.annotations.SerializedName;
import com.google.gson.reflect.TypeToken;
import net.burningtnt.livehelper.util.gson.DispatchConfiguration;

import java.io.DataOutput;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

public sealed interface InputValue {
    DispatchConfiguration<InputValue, InputDeclaration.Type> DISPATCH_CONFIGURATION = new DispatchConfiguration<>(
            InputValue.class, "type", InputValue::type,
            Map.of(
                    InputDeclaration.Type.NUMBER, TypeToken.get(Number.class),
                    InputDeclaration.Type.STRING, TypeToken.get(Chars.class),
                    InputDeclaration.Type.POSE, TypeToken.get(Pose.class),
                    InputDeclaration.Type.ENTITY, TypeToken.get(Entity.class)
            )
    );

    String id();

    InputDeclaration.Type type();

    sealed interface F32Like extends InputValue {
        float f32();
    }

    sealed interface BufferLike extends InputValue {
        void intoBuffer(DataOutput buffer) throws IOException;
    }

    record Number(
            @SerializedName("id") String id,
            @SerializedName("value") float value
    ) implements F32Like, Validation {
        @Override
        public InputDeclaration.Type type() {
            return InputDeclaration.Type.NUMBER;
        }

        @Override
        public void validate() {
            Objects.requireNonNull(id, "id");
        }

        @Override
        public float f32() {
            return value;
        }
    }

    record Chars(
            @SerializedName("id") String id,
            @SerializedName("value") String value
    ) implements BufferLike, Validation {
        @Override
        public InputDeclaration.Type type() {
            return InputDeclaration.Type.STRING;
        }

        @Override
        public void validate() {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(value, "value");
        }

        @Override
        public void intoBuffer(DataOutput buffer) throws IOException {
            buffer.write(value.getBytes(StandardCharsets.UTF_8));
            buffer.write(0);
        }
    }

    record Pose(
            @SerializedName("id") String id,
            @SerializedName("value") PoseInstance value
    ) implements BufferLike, Validation {
        @Override
        public InputDeclaration.Type type() {
            return InputDeclaration.Type.POSE;
        }

        @Override
        public void validate() {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(value, "value");
        }

        public record PoseInstance(
                @SerializedName("x") float x,
                @SerializedName("y") float y,
                @SerializedName("z") float z,
                @SerializedName("qx") float qx,
                @SerializedName("qy") float qy,
                @SerializedName("qz") float qz,
                @SerializedName("qw") float qw
        ) implements Validation {
            @Override
            public void validate() {
                Validation.requireReal(x, "x");
                Validation.requireReal(y, "y");
                Validation.requireReal(z, "z");
                Validation.requireReal(qx, "qx");
                Validation.requireReal(qy, "qy");
                Validation.requireReal(qz, "qz");
                Validation.requireReal(qw, "qw");
            }
        }

        @Override
        public void intoBuffer(DataOutput buffer) throws IOException {
            buffer.writeFloat(value.x);
            buffer.writeFloat(value.y);
            buffer.writeFloat(value.z);
            buffer.writeFloat(value.qx);
            buffer.writeFloat(value.qy);
            buffer.writeFloat(value.qz);
            buffer.writeFloat(value.qw);
        }
    }

    record Entity(
            @SerializedName("id") String id,
            @SerializedName("value") UUID uuid
    ) implements BufferLike, Validation {
        @Override
        public InputDeclaration.Type type() {
            return InputDeclaration.Type.ENTITY;
        }

        @Override
        public void validate() {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(uuid, "uuid");
        }

        @Override
        public void intoBuffer(DataOutput buffer) throws IOException {
            buffer.write(uuid.toString().getBytes(StandardCharsets.UTF_8));
            buffer.write(0);
        }
    }
}
