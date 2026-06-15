const managerInclude = `import { lhInputGetF32, lhInputGetBuffer } from "./common";

export type HRenderRequest = i32;

export class Clip {
  duration: i32;
  name: string;

  constructor(duration: i32, name: string) {
    this.duration = duration;
    this.name = name;
  }
}

export function lhManagerGetClips(): StaticArray<Clip> {
  const count = lhInputGetF32("clip") as i32;

  const clips: StaticArray<Clip> = new StaticArray(count);
  for (let i = 0; i < count;i ++) {
    const index = i.toString();
    const duration = lhInputGetF32("clip." + index + ".duration") as i32;
    const name = lhInputGetBuffer("clip." + index + ".name");
    clips[i] = new Clip(duration, String.UTF8.decode(name, true));
  }
  
  return clips;
}

@external("LH", "Manager.Render.Single")
declare function __lhManagerRenderSingle(clip: i32, progress: f32): HRenderRequest;

export function lhManagerRenderSingle(clip: i32, progress: f32): HRenderRequest {
    return __lhManagerRenderSingle(clip, progress);
}

@external("LH", "Manager.Render.Mix")
declare function __lhManagerRenderMix(clip1: i32, clip2: i32, progress: f32): HRenderRequest;

export function lhManagerRenderMix(clip1: i32, clip2: i32, progress: f32): HRenderRequest {
    if (isNaN(progress)) {
        progress = 0.5;
    } else if (progress > 1) {
        progress = 1
    } else if (progress < 0) {
        progress = 0
    }

    return __lhManagerRenderMix(clip1, clip2, progress);
}

export function lhManagerGetDuration(): i32 {
    return lhInputGetF32("duration") as i32;
}
`;

export default managerInclude;
