// === meta ===

{
  "name": "交叉相溶",
  "description": "循环展示镜头，在每次切换时交叉相溶",
  "usage": "manager",
  "inputs": [
    {
      "id": "transition_time",
      "name": "转场时间",
      "description": "转场的时间，以毫秒计算",
      "multivalue": false,
      "type": "number"
    }
  ]
}

// === script ===

import { Pose, lhInputGetPose, lhInputGetF32, lhInputGetBuffer } from "./include/common";
import { HRenderRequest, Clip, lhManagerGetClips, lhManagerRenderSingle, lhManagerRenderMix, lhManagerGetDuration } from "./include/manager";

export function main(): HRenderRequest {
  const clips = lhManagerGetClips();
  let cycle = 0 as f32;
  for (let i = 0; i < clips.length; i++) {
    cycle += clips[i].duration as f32;
  }

  const duration = (lhManagerGetDuration() as f32) % cycle;
  const transition = lhInputGetF32("transition_time");
  assert(transition >= 0, "Transition must be a positive value");

  cycle = 0;
  for (let i = 0; i < clips.length; i++) {
    const d = clips[i].duration as f32;
    const next = cycle + d;
    if (next >= duration) {
      const localPos = duration - cycle;
      const advance = localPos - (d - transition);
      const current = lhManagerRenderSingle(i, localPos / d);

      if (advance <= 0) {
        return current;
      }

      const next = (i + 1) % clips.length;

      return lhManagerRenderMix(
        current,
        lhManagerRenderSingle(next, advance / (clips[next].duration as f32)),
        (advance as f32) / transition
      );
    }

    cycle = next;
  }

  unreachable();
  return -1;
}
