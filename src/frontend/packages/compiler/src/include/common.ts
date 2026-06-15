const commonInclude = `@external("LH", "Input.GetF32")
declare function __lhInputGetF32(
  pName: i32,
  pMemoryPage: i32
): f32;

export function lhInputGetF32(name: string): f32 {
  const nameBuffer = String.UTF8.encode(name, true);
  return __lhInputGetF32(changetype<i32>(nameBuffer), 0);
}

@external("LH", "Input.GetBuffer")
declare function __lhInputGetBuffer(
  pName: i32,
  pNameMemoryPage: i32,
  pBuffer: i32,
  pBufferMemoryPage: i32,
  sizeBuffer: i32
): i32;

export function lhInputGetBuffer(name: string): ArrayBuffer {
  const nameBuffer = String.UTF8.encode(name, true);
  const buf = new ArrayBuffer(__lhInputGetBuffer(changetype<i32>(nameBuffer), 0, 0, 0, 0));
  const written = __lhInputGetBuffer(changetype<i32>(nameBuffer), 0, changetype<i32>(buf), 0, buf.byteLength);
  assert(written == buf.byteLength);
  return buf;
}

export class Pose {
  public readonly x: f32;
  public readonly y: f32;
  public readonly z: f32;
  public readonly qx: f32;
  public readonly qy: f32;
  public readonly qz: f32;
  public readonly qw: f32;

  constructor(x: f32, y: f32, z: f32, qx: f32, qy: f32, qz: f32, qw: f32) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.qx = qx;
    this.qy = qy;
    this.qz = qz;
    this.qw = qw;
  }
}

export function lhInputGetPose(name: string): Pose {
  const nameBuffer = String.UTF8.encode(name, true);
  const buf = new Float32Array(7);
  const written = __lhInputGetBuffer(changetype<i32>(nameBuffer), 0, changetype<i32>(buf.buffer), 0, buf.byteLength);
  assert(buf.byteLength == 28, "Internal exception: buffer should be 28 bytes, but is " + buf.byteLength.toString());
  assert(written == buf.byteLength, "Internal exception: input 'pose' should be 28 bytes");
  return new Pose(buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], buf[6]);
}
`;

export default commonInclude;
