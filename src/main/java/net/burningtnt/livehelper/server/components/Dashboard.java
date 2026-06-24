package net.burningtnt.livehelper.server.components;

import com.google.gson.annotations.SerializedName;
import com.google.gson.reflect.TypeToken;
import net.burningtnt.livehelper.util.gson.DispatchConfiguration;

import java.util.List;
import java.util.Map;
import java.util.Objects;

public record Dashboard(
        @SerializedName("id") int id,
        @SerializedName("name") String name,
        @SerializedName("nodes") List<Node> nodes
) implements Validation {
    @Override
    public void validate() {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(nodes, "nodes");
    }

    public enum NodeType {
        @SerializedName("text") TEXT,
        @SerializedName("switch") SWITCH,
    }

    public sealed interface Node {
        DispatchConfiguration<Node, NodeType> DISPATCH_CONFIGURATION = new DispatchConfiguration<>(
                Node.class, "type", Node::type,
                Map.of(
                        NodeType.TEXT, TypeToken.get(Text.class),
                        NodeType.SWITCH, TypeToken.get(Switch.class)
                )
        );

        int left();

        int right();

        int up();

        int down();

        NodeType type();

        record Text(
                @SerializedName("left") int left,
                @SerializedName("right") int right,
                @SerializedName("up") int up,
                @SerializedName("down") int down,
                @SerializedName("content") String content
        ) implements Node, Validation {
            @Override
            public void validate() {
                Objects.requireNonNull(content, "content");
            }

            @Override
            public NodeType type() {
                return NodeType.TEXT;
            }
        }

        record Switch(
                @SerializedName("left") int left,
                @SerializedName("right") int right,
                @SerializedName("up") int up,
                @SerializedName("down") int down,
                @SerializedName("manager") int managerID
        ) implements Node {
            @Override
            public NodeType type() {
                return NodeType.SWITCH;
            }
        }
    }
}
