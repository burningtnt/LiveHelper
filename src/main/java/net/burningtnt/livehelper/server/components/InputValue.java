package net.burningtnt.livehelper.server.components;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.TypeAdapter;
import com.google.gson.TypeAdapterFactory;
import com.google.gson.annotations.JsonAdapter;
import com.google.gson.annotations.SerializedName;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonWriter;
import org.jetbrains.annotations.ApiStatus;

import java.io.DataOutput;
import java.io.IOException;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

@JsonAdapter(value = InputValue.Adapter.class)
public sealed interface InputValue {
    String id();

    InputDeclaration.Type type();

    sealed interface F32Like extends InputValue {
        float f32();
    }

    sealed interface BufferLike extends InputValue {
        void intoBuffer(DataOutput buffer) throws IOException;
    }

    @JsonAdapter(value = InputValue.Adapter.class)
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

    @JsonAdapter(value = InputValue.Adapter.class)
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
            buffer.writeUTF(value);
        }
    }

    @JsonAdapter(value = InputValue.Adapter.class)
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

    @ApiStatus.Internal
    final class Adapter implements TypeAdapterFactory {
        private static final Map<InputDeclaration.Type, ? extends Class<? extends InputValue>> DISPATCHER = new EnumMap<>(Map.of(
                InputDeclaration.Type.NUMBER, Number.class,
                InputDeclaration.Type.STRING, Chars.class,
                InputDeclaration.Type.POSE, Pose.class
        ));

        @SuppressWarnings("unchecked")
        @Override
        public <T> TypeAdapter<T> create(Gson gson, TypeToken<T> type) {
            Class<? super T> clazz = type.getRawType();
            if (clazz == InputValue.class) {
                return (TypeAdapter<T>) createInternal(gson);
            } else if (DISPATCHER.containsValue(clazz)) {
                return (TypeAdapter<T>) createDelegate(gson, (TypeToken<? extends InputValue>) type);
            }

            throw new UnsupportedOperationException();
        }

        private TypeAdapter<InputValue> createInternal(Gson gson) {
            return new TypeAdapter<>() {
                @Override
                public void write(JsonWriter out, InputValue value) {
                    JsonObject tree = gson.toJsonTree(value).getAsJsonObject();
                    tree.addProperty("type", gson.toJsonTree(value.type()).getAsString());
                    gson.toJson(tree, out);
                }

                @Override
                public InputValue read(JsonReader in) {
                    JsonObject tree = JsonParser.parseReader(in).getAsJsonObject();
                    return gson.getAdapter(DISPATCHER.get(gson.fromJson(tree.get("type").getAsString(), InputDeclaration.Type.class))).fromJsonTree(tree);
                }
            };
        }

        private <T extends InputValue> TypeAdapter<T> createDelegate(Gson gson, TypeToken<T> type) {
            TypeAdapter<T> delegate = gson.getDelegateAdapter(this, type);
            return new TypeAdapter<>() {
                @Override
                public void write(JsonWriter out, T value) {
                    JsonObject tree = delegate.toJsonTree(value).getAsJsonObject();
                    tree.addProperty("type", gson.toJsonTree(value.type()).getAsString());
                    gson.toJson(tree, out);
                }

                @Override
                public T read(JsonReader in) {
                    JsonObject tree = JsonParser.parseReader(in).getAsJsonObject();
                    T object = delegate.fromJsonTree(tree);
                    JsonElement type = tree.get("type");
                    if (type != null && object.type() != gson.fromJson(type.getAsString(), InputDeclaration.Type.class)) {
                        throw new IllegalArgumentException();
                    }
                    return object;
                }
            };
        }
    }
}
