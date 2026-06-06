package net.burningtnt.livehelper.components;

import com.google.gson.annotations.SerializedName;
import org.apache.commons.lang3.Validate;

import java.util.List;
import java.util.Objects;

public record Manager(
        @SerializedName("id") int id,
        @SerializedName("name") String name,
        @SerializedName("description") String description,
        @SerializedName("clips") int[] clips,
        @SerializedName("program") int programID,
        @SerializedName("width") int width,
        @SerializedName("height") int height,
        @SerializedName("fps") int fps,
        @SerializedName("renderDistance") int renderDistance,
        @SerializedName("inputs") List<InputValue> inputs
) implements Validation {
    @Override
    public void validate() {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(description, "description");
        Objects.requireNonNull(clips, "clips");
        Validate.inclusiveBetween(0, 8192, width, "width");
        Validate.inclusiveBetween(0, 8192, height, "height");
        Validate.inclusiveBetween(0, 1000, fps, "fps");
        Validate.inclusiveBetween(0, 1000, renderDistance, "fps");
        Objects.requireNonNull(inputs, "inputs");
        for (InputValue input : inputs) {
            Objects.requireNonNull(input, "input");
        }
    }
}
