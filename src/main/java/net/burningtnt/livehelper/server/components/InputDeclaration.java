package net.burningtnt.livehelper.server.components;

import com.google.gson.annotations.SerializedName;

import java.util.Objects;

public record InputDeclaration(
        @SerializedName("id") String id,
        @SerializedName("name") String name,
        @SerializedName("description") String description,
        @SerializedName("multivalue") boolean multiValue,
        @SerializedName("type") Type type
) implements Validation {
    public enum Type {
        @SerializedName("number") NUMBER,
        @SerializedName("string") STRING,
        @SerializedName("pose") POSE
    }

    @Override
    public void validate() {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(description, "description");
        Objects.requireNonNull(type, "type");
    }
}
