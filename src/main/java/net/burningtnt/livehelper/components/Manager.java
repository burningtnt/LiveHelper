package net.burningtnt.livehelper.components;

import com.google.gson.annotations.SerializedName;
import it.unimi.dsi.fastutil.ints.IntList;

import java.util.List;

public record Manager(
        @SerializedName("id") int id,
        @SerializedName("name") String name,
        @SerializedName("description") String description,
        @SerializedName("clips") IntList clips,
        @SerializedName("program") int program,
        @SerializedName("width") int width,
        @SerializedName("height") int height,
        @SerializedName("fps") int fps,
        @SerializedName("renderDistance") int renderDistance,
        @SerializedName("inputs") List<InputValue> inputs
) {
}
