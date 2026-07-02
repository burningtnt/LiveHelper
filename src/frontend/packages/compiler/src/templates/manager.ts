const managerTemplate = `import { Pose, lhInputGetPose, lhInputGetF32, lhInputGetBuffer, lhInputGetString } from "./include/common";
import { HRenderRequest, Clip, lhManagerGetClips, lhManagerRenderSingle, lhManagerRenderMix, lhManagerGetDuration } from "./include/manager";

export function main(): HRenderRequest {
    // ...
}
`;

export default managerTemplate;
