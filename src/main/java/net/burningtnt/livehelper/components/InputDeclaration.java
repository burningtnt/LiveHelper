package net.burningtnt.livehelper.components;

import com.google.gson.annotations.SerializedName;

public record InputDeclaration(
        @SerializedName("id") String id,
        @SerializedName("name") String name,
        @SerializedName("description") String description,
        @SerializedName("multivalue") boolean multiValue,
        @SerializedName("type") Type type
) {
    public enum Type {
        @SerializedName("name") NUMBER,
        @SerializedName("string") STRING,
        @SerializedName("pose") POSE
    }
}
