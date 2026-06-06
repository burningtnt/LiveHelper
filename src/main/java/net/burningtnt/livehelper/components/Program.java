package net.burningtnt.livehelper.components;

import com.google.gson.annotations.SerializedName;

import java.util.List;
import java.util.Objects;

public record Program(
        @SerializedName("id") int id,
        @SerializedName("name") String name,
        @SerializedName("description") String description,
        @SerializedName("usage") Usage usage,
        @SerializedName("inputs") List<InputDeclaration> inputs
) implements Validation {
    public enum Usage {
        @SerializedName("clip") CLIP,
        @SerializedName("manager") MANAGER
    }

    @Override
    public void validate() {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(description, "description");
        Objects.requireNonNull(usage, "usage");
        Objects.requireNonNull(inputs, "inputs");
        for (InputDeclaration input : inputs) {
            Objects.requireNonNull(input, "input");
        }
    }
}
