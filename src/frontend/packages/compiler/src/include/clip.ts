const clipInclude = `import { Pose, lhInputGetF32 } from "./common";

export type HClip = i32;

@external("LH", "Technique.MakeClip")
declare function __lhTechniqueMakeClip(x: f32, y: f32, z: f32, qx: f32, qy: f32, qz: f32, qw: f32): HClip;

export function lhTechniqueMakeClip(pose: Pose): HClip {
  return __lhTechniqueMakeClip(pose.x, pose.y, pose.z, pose.qx, pose.qy, pose.qz, pose.qw);
}

@external("LH", "Technique.MakeEntity")
declare function __lhTechniqueMakeEntity(pUUID: i32, pUUIDMP: i32): HClip;

export function lhTechniqueMakeEntity(uuid: string): HClip {
  const uuidBuffer = String.UTF8.encode(uuid, true);
  return __lhTechniqueMakeEntity(changetype<i32>(uuidBuffer), 0);
}

export function lhTechniqueGetProgress(): f32 {
  return lhInputGetF32("progress");
}
`;

export default clipInclude;
