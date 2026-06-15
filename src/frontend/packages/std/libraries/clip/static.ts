// === meta ===

{
  "name": "静态",
  "description": "禁止不动的镜头",
  "inputs": [
    {
      "id": "pose",
      "name": "静态镜头的位置",
      "description": "摄像机将静止在该点处保持不动",
      "multivalue": false,
      "type": "pose"
    }
  ]
}

// === script ===

import { Pose, lhInputGetPose, lhInputGetF32, lhInputGetBuffer } from "./include/common";
import { HClip, lhTechniqueMakeClip, lhTechniqueGetProgress } from "./include/clip";

export function main(): HClip {
    const pose = lhInputGetPose("pose");
    return lhTechniqueMakeClip(pose);
}
