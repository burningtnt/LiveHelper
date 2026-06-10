package net.burningtnt.livehelper.util;

import org.joml.Quaternionf;
import org.joml.Vector3f;

public final class AngleConvert {
    private AngleConvert() {
    }

    public static Quaternionf convert(Vector3f source, Quaternionf target) {
        target.rotationYXZ(
                (float) Math.PI - source.y * (float) (Math.PI / 180.0),
                -source.x * (float) (Math.PI / 180.0),
                -source.z * (float) (Math.PI / 180.0)
        );
        return target;
    }

    public static Vector3f convert(Quaternionf source, Vector3f target) {
        source.getEulerAnglesYXZ(target);
        target.set(Math.toDegrees(-target.x), Math.toDegrees(Math.PI - target.y), Math.toDegrees(-target.z));
        return target;
    }
}
