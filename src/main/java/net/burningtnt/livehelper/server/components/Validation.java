package net.burningtnt.livehelper.server.components;

public interface Validation {
    void validate();

    static void requireReal(float value, String name) {
        if (Float.isNaN(value)) {
            throw new IllegalArgumentException(name + " is NaN");
        }
        if (Float.isInfinite(value)) {
            throw new IllegalArgumentException(name + " is infinite");
        }
    }
}
