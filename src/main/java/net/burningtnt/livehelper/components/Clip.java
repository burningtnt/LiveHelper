package net.burningtnt.livehelper.components;

import com.google.gson.annotations.SerializedName;

import java.util.List;

public record Clip(
        @SerializedName("id") int id,
        @SerializedName("name") String name,
        @SerializedName("description") String description,
        @SerializedName("technique") int programID,
        @SerializedName("inputs") List<InputValue> inputs
) {
}
