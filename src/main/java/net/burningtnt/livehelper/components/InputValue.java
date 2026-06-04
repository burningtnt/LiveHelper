package net.burningtnt.livehelper.components;

import com.google.gson.Gson;
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

    record Number(
            @SerializedName("id") String id,
            @SerializedName("value") float value
    ) implements F32Like {
        @Override
        public InputDeclaration.Type type() {
            return InputDeclaration.Type.NUMBER;
        }

        @Override
        public float f32() {
            return value;
        }
    }

    record Chars(
            @SerializedName("id") String id,
            @SerializedName("value") String value
    ) implements BufferLike {
        @Override
        public InputDeclaration.Type type() {
            return InputDeclaration.Type.STRING;
        }

        @Override
        public void intoBuffer(DataOutput buffer) throws IOException {
            buffer.writeUTF(value);
        }
    }

    record Pose(
            @SerializedName("id") String id,
            @SerializedName("value") PoseInstance value
    ) implements BufferLike {
        @Override
        public InputDeclaration.Type type() {
            return InputDeclaration.Type.POSE;
        }

        public record PoseInstance(
                @SerializedName("x") float x,
                @SerializedName("y") float y,
                @SerializedName("z") float z,
                @SerializedName("qx") float qx,
                @SerializedName("qy") float qy,
                @SerializedName("qz") float qz,
                @SerializedName("qw") float qw
        ) {
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
        @SuppressWarnings("unchecked")
        @Override
        public <T> TypeAdapter<T> create(Gson gson, TypeToken<T> type) {
            return type.getRawType() == InputValue.class ? (TypeAdapter<T>) createInternal(gson) : null;
        }

        private TypeAdapter<InputValue> createInternal(Gson gson) {
            Map<InputDeclaration.Type, ? extends Class<? extends InputValue>> dispatcher = new EnumMap<>(Map.of(
                    InputDeclaration.Type.NUMBER, Number.class,
                    InputDeclaration.Type.STRING, Chars.class,
                    InputDeclaration.Type.POSE, Pose.class
            ));

            return new TypeAdapter<>() {
                @Override
                public void write(JsonWriter out, InputValue value) {
                    JsonObject tree = gson.toJsonTree(value).getAsJsonObject();
                    tree.addProperty("type", gson.toJsonTree(value.type()).getAsString());
                    gson.toJson(tree, out);
                }

                @Override
                public InputValue read(JsonReader in) throws IOException {
                    JsonObject tree = JsonParser.parseReader(in).getAsJsonObject();
                    return gson.getAdapter(dispatcher.get(gson.fromJson(tree.get("type").getAsString(), InputDeclaration.Type.class))).fromJsonTree(tree);
                }
            };
        }
    }
}
