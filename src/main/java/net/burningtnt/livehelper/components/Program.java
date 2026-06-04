package net.burningtnt.livehelper.components;

import com.google.gson.annotations.SerializedName;

import java.util.List;

public record Program(
        @SerializedName("id") int id,
        @SerializedName("name") String name,
        @SerializedName("description") String description,
        @SerializedName("usage") Usage usage,
        @SerializedName("inputs") List<InputDeclaration> inputs
) {
    public enum Usage {
        @SerializedName("clip") CLIP,
        @SerializedName("manager") MANAGER
    }
}
