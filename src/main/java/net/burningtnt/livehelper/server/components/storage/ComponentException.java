package net.burningtnt.livehelper.server.components.storage;

import com.google.common.base.CaseFormat;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

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

    public List<String> collect() {
        List<String> result = new ArrayList<>();
        collect(result);
        return result;
    }

    private void collect(List<String> result) {
        Class<? extends Type> clazz = this.type.getClass();
        result.add(CaseFormat.UPPER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, clazz.getSimpleName()));

        RecordComponent[] components = clazz.getRecordComponents();
        for (RecordComponent component : components) {
            Object v;
            try {
                v = component.getAccessor().invoke(this);
            } catch (IllegalAccessException | InvocationTargetException e) {
                throw new AssertionError(e);
            }
            result.add(Objects.toString(v));
        }

        Throwable cause = this.getCause();
        if (cause != null) {
            if (cause instanceof ComponentException e) {
                e.collect(result);
            } else {
                result.add(cause.getMessage());
            }
        }
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

    public record ExecutionFailure(int programID) implements Type {
    }
}
