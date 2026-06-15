// === meta ===

{
  "name": "呼吸",
  "description": "在某个点附近晃动，模拟呼吸效果",
  "inputs": [
    {
      "id": "pose",
      "name": "位置",
      "description": "",
      "multivalue": false,
      "type": "pose"
    },
    {
      "id": "intensity",
      "name": "强度",
      "description": "建议为 0-0.5 的小数",
      "multivalue": false,
      "type": "number"
    }
  ]
}

// === script ===

import { Pose, lhInputGetPose, lhInputGetF32 } from "./include/common";
import { HClip, lhTechniqueMakeClip } from "./include/clip";

function quatMul(
    ax: f32, ay: f32, az: f32, aw: f32,
    bx: f32, by: f32, bz: f32, bw: f32
): StaticArray<f32> {
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz
    ];
}

function quatFromEuler(
    pitch: f32,
    yaw: f32,
    roll: f32
): StaticArray<f32> {
    const cy = Mathf.cos(yaw * 0.5);
    const sy = Mathf.sin(yaw * 0.5);

    const cp = Mathf.cos(pitch * 0.5);
    const sp = Mathf.sin(pitch * 0.5);

    const cr = Mathf.cos(roll * 0.5);
    const sr = Mathf.sin(roll * 0.5);

    return [
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
        cr * cp * cy + sr * sp * sy
    ];
}

export function main(): HClip {
    const pose = lhInputGetPose("pose");
    const intensity = lhInputGetF32("intensity");
    const process = lhInputGetF32("progress");

    const phase = process * Mathf.PI * 2.0;

    const positionScale = intensity * 0.5;

    const dx =
        Mathf.sin(phase * 0.5) *
        positionScale *
        0.15;

    const dy =
        Mathf.sin(phase) *
        positionScale *
        0.5;

    const dz =
        Mathf.sin(phase + Mathf.PI * 0.3) *
        positionScale *
        0.25;

    const pitch =
        Mathf.sin(phase) *
        intensity *
        0.05;

    const yaw =
        Mathf.sin(phase * 0.5) *
        intensity *
        0.03;

    const roll =
        Mathf.sin(phase * 0.7) *
        intensity *
        0.01;

    const breathingRotation =
        quatFromEuler(
            pitch,
            yaw,
            roll
        );

    const q =
        quatMul(
            pose.qx,
            pose.qy,
            pose.qz,
            pose.qw,

            breathingRotation[0],
            breathingRotation[1],
            breathingRotation[2],
            breathingRotation[3]
        );

    const transformedPose: Pose = new Pose(
        pose.x + dx, pose.y + dy, pose.z + dz,
        q[0], q[1], q[2], q[3]
    );

    return lhTechniqueMakeClip(transformedPose);
}