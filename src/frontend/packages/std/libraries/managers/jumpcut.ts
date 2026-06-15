// === meta ===

{
  "name": "跳切",
  "description": "循环展示镜头",
  "usage": "manager",
  "inputs": []
}

// === script ===

import { Pose, lhInputGetPose, lhInputGetF32, lhInputGetBuffer } from "./include/common";
import { HRenderRequest, Clip, lhManagerGetClips, lhManagerRenderSingle, lhManagerRenderMix, lhManagerGetDuration } from "./include/manager";

export function main(): HRenderRequest {
  const clips = lhManagerGetClips();
  let cycle = 0;
  for (let i = 0; i < clips.length; i++) {
    cycle += clips[i].duration;
  }

  const duration = lhManagerGetDuration() % cycle;

  cycle = 0;
  for (let i = 0; i < clips.length; i++) {
    const d = clips[i].duration;
    const next = cycle + d;
    if (next >= duration) {
      return lhManagerRenderSingle(i, ((duration - cycle) as f32) / (d as f32));
    }

    cycle = next;
  }

  unreachable();
  return -1;
}
