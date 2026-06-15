// === meta ===

{
  "name": "平滑",
  "description": "在多个点间平滑插值",
  "inputs": [
    {
      "id": "pose",
      "name": "静态镜头的位置",
      "description": "",
      "multivalue": true,
      "type": "pose"
    }
  ]
}

// === script ===

import { Pose, lhInputGetPose, lhInputGetF32, lhInputGetBuffer } from "./include/common";
import { HClip, lhTechniqueMakeClip, lhTechniqueGetProgress } from "./include/clip";

export function main(): HClip {
    const process = lhInputGetF32("progress");
    const poses = new StaticArray<Pose>(lhInputGetF32("pose") as i32);
    for (let i = 0; i < poses.length; i ++) {
        poses[i] = lhInputGetPose("pose." + i.toString());
    }

    if (poses.length == 0) {
        assert(false, "pose list is empty");
    }

    if (poses.length == 1) {
        return lhTechniqueMakeClip(poses[0]);
    }

    const segmentCount = poses.length - 1;
    const scaled = process * <f32>segmentCount;
    let segment = <i32>Mathf.floor(scaled);
    if (segment >= segmentCount) {
        segment = segmentCount - 1;
    }

    const localT = scaled - <f32>segment;

    const a = poses[segment];
    const b = poses[segment + 1];

    const q = slerpQuat(
        a.qx, a.qy, a.qz, a.qw,
        b.qx, b.qy, b.qz, b.qw,
        localT
    );

    return lhTechniqueMakeClip(new Pose(
        lerp(a.x, b.x, localT), lerp(a.y, b.y, localT), lerp(a.z, b.z, localT),
        q[0], q[1], q[2], q[3]
    ));
}

function lerp(a: f32, b: f32, t: f32): f32 {
    return a + (b - a) * t;
}

function normalizeQuat(x: f32, y: f32, z: f32, w: f32): StaticArray<f32> {
    const len = Mathf.sqrt(x * x + y * y + z * z + w * w);

    return [x / len, y / len, z / len, w / len];
}

function slerpQuat(
    ax: f32, ay: f32, az: f32, aw: f32,
    bx: f32, by: f32, bz: f32, bw: f32,
    t: f32
): StaticArray<f32> {
    let dot = ax * bx + ay * by + az * bz + aw * bw;

    if (dot < 0.0) {
        dot = -dot;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }

    if (dot > 0.9995) {
        return normalizeQuat(lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t), lerp(aw, bw, t));
    }

    const theta0 = Mathf.acos(dot);
    const theta = theta0 * t;

    const sinTheta = Mathf.sin(theta);
    const sinTheta0 = Mathf.sin(theta0);

    const s0 = Mathf.cos(theta) - dot * sinTheta / sinTheta0;
    const s1 = sinTheta / sinTheta0;

    return [
        s0 * ax + s1 * bx,
        s0 * ay + s1 * by,
        s0 * az + s1 * bz,
        s0 * aw + s1 * bw
    ];
}