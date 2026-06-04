package net.burningtnt.livehelper.components.storage;

public final class ComponentException extends Exception {
    private final Type type;

    private ComponentException(Type type) {
        super(type.toString());
        this.type = type;
    }

    public ComponentException(Type type, Throwable cause) {
        super(type.toString(), cause);
        this.type = type;
    }

    public Type getType() {
        return type;
    }

    public sealed interface Type {
        default ComponentException make() {
            return new ComponentException(this);
        }

        default ComponentException make(Throwable cause) {
            return new ComponentException(this, cause);
        }
    }

    public record IDNotFound(int id) implements Type {
    }

    public record IDDuplicate(int id) implements Type {
    }

    public record LinkageFailure(int managerID) implements Type {
    }

    public record InvalidUsage(int programID) implements Type {
    }

    public record MissingInput(int programID, String inputName) implements Type {
    }

    public record MissingEntry(int programID) implements Type {
    }
}
