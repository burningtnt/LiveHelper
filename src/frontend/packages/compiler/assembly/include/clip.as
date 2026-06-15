import { Pose, lhInputGetF32 } from "./common";

export type HClip = i32;

@external("LH", "Technique.MakeClip")
declare function __lhTechniqueMakeClip(x: f32, y: f32, z: f32, qx: f32, qy: f32, qz: f32, qw: f32): HClip;

export function lhTechniqueMakeClip(pose: Pose): HClip {
  return __lhTechniqueMakeClip(pose.x, pose.y, pose.z, pose.qx, pose.qy, pose.qz, pose.qw);
}

export function lhTechniqueGetProgress(): f32 {
  return lhInputGetF32("progress");
}