package net.burningtnt.livehelper.util.gson;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.TypeAdapter;
import com.google.gson.TypeAdapterFactory;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonWriter;

import java.io.IOException;
import java.util.Map;
import java.util.function.Function;

public record DispatchConfiguration<T, E extends Enum<E>>(
        Class<T> clazz,
        String field,
        Function<T, E> getter,
        Map<E, TypeToken<? extends T>> dispatcher
) {
    public TypeAdapterFactory adapter() {
        return new Adapter();
    }

    private final class Adapter implements TypeAdapterFactory {
        private Adapter() {
        }

        @SuppressWarnings("unchecked")
        @Override
        public <S> TypeAdapter<S> create(Gson gson, TypeToken<S> type) {
            if (clazz.isAssignableFrom(type.getRawType())) {
                // SAFETY: S and T now both refer to clazz
                return (TypeAdapter<S>) create0(gson, (TypeToken<T>) type);
            }
            return gson.getDelegateAdapter(this, type);
        }

        @SuppressWarnings("unchecked")
        private TypeAdapter<T> create0(Gson gson, TypeToken<T> type) {
            Class<E> ev = (Class<E>) dispatcher.keySet().iterator().next().getClass();

            return new TypeAdapter<>() {
                @Override
                public T read(JsonReader in) throws IOException {
                    JsonObject object = gson.fromJson(in, JsonObject.class);
                    E type = gson.fromJson(object.get(field).getAsString(), ev);
                    T result = gson.getDelegateAdapter(Adapter.this, dispatcher.get(type)).fromJsonTree(object);
                    if (getter.apply(result) != type) {
                        throw new IOException("Invalid type.");
                    }
                    return result;
                }

                @Override
                public void write(JsonWriter out, T value) {
                    JsonObject object = gson.getDelegateAdapter(Adapter.this, type).toJsonTree(value).getAsJsonObject();
                    object.addProperty(field, gson.toJsonTree(getter.apply(value)).getAsString());
                    gson.toJson(object, out);
                }
            };
        }
    }
}
