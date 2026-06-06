package net.burningtnt.livehelper.components;

import com.google.gson.annotations.SerializedName;

import java.util.List;
import java.util.Objects;

public record Clip(
        @SerializedName("id") int id,
        @SerializedName("name") String name,
        @SerializedName("description") String description,
        @SerializedName("technique") int programID,
        @SerializedName("inputs") List<InputValue> inputs
) implements Validation {
    @Override
    public void validate() {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(description, "description");
        Objects.requireNonNull(inputs, "inputs");
        for (InputValue input : inputs) {
            Objects.requireNonNull(input, "input");
        }
    }
}
