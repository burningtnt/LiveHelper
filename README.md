# 直播助手 (LiveHelper)

> [!NOTE]
> 太长不看：ReplayMod, 但是直播。

支持多机位直播。

- 将渲染结果通过 Spout 库推流至外部程序 (如 OBS)；
- 基于 WebAssembly 的可编程控制。

# 机位控制流

LiveHelper 使用 分镜头 (Clip) + 调度器 (Manager) 三级控制系统。

| 类型  |  所需的程序  |        输出         |
|:---:|:-------:|:-----------------:|
| 分镜头 | 一个分镜头程序 |     摄像机的位置与视角     |
| 调度器 | 一个调度器程序 | 一个分镜头，或多个分镜头和合并策略 |

LiveHelper 在每帧按照如下流程完成机位计算：

1. 向调度器 (Manager) 传入时间等信息, 获得一个或多个被激活的分镜头 (Clip) 及混合方式 (如果有)；
2. 依次让每个分镜头 (Clip) 所对的技法 (Technique) 计算其位置与视角；
3. 依次渲染每一个所需的画面, 并按照调度器 (Manager) 的命令混合；
4. 通过 Spout 库推流至外部程序。

# WebAssembly API

为最大化可拓展性, LiveHelper 支持用户为技法 (Technique) 和调度器 (Manager) 自定义 WebAssembly 脚本。
虽然您可以使用任何支持 WebAssembly 的语言, 但我们建议您使用 [AssemblyScript](https://www.assemblyscript.org/)。

## 句柄 (Handle)

和 Windows 类似，LiveHelper 使用句柄 (Handle) 作为外部资源的标识，其类型为 `i32(&handle)` 或 `i32(handle)`。

- `i32(&handle)`: 所有权保留在 WebAssembly 层；
- `i32(handle)` (方法返回值): WebAssembly 获得其所有权；
- `i32(handle)` (方法参数): WebAssembly 失去其所有权；

WebAssembly 脚本必须妥善管理持有的句柄 (Handle)，防止内存泄露。

## 导入表

LiveHeleper 的全部导入模块名为“LiveHelper”, 名称为函数名。

### 句柄 (Handle)

技法 (Technique) 和调度器 (Manager) 均可通过下列 API 管理句柄生命周期：

#### Handle.Duplicate(i32(&handle)) -> i32(handle)

创建一个新的句柄 (Handle)，指向同一个资源。当通过其中一个句柄修改资源时，通过另一个句柄也能观察到修改。

```
Handle.Duplicate(
    i32(&handle) handle // 待复制的句柄
) -> i32(owned handle)  // 新句柄
```

#### Handle.Release(i32(handle)) -> void

释放一个句柄的所有权。

```
Handle.Release(
    i32(handle) handle // 待释放的句柄
) -> void
```

### 输入 (Input)

技法 (Technique) 和调度器 (Manager) 均可通过下列 API 获取其输入：

#### Input.GetF32(i32, i32) -> f32

获取一个 f32 类型的输入。

```
Input.GetF32(
    [IN] i32 pName       // 待查 Input 名称：指向 UTF8 编码的, null-terminated 字符串的指针；
    [IN] i32 pMemoryPage // pName 对应的内存页；
) -> f32                 // 该 Input 的值。若不能以 f32 呈现，方法将出错并立刻中止 WebAssembly 运行。
```

#### Input.GetBuffer(i32, i32, i32, i32, i32) -> i32

获取一个二进制字节流类型的输入。

```
Input.GetBuffer(
    [IN] i32 pName,     // 待查 Input 名称：指向 UTF8 编码的, null-terminated 字符串的指针；
    [IN] i32 pNameMP    // pName 对应的内存页；
    [OUT] i32 pBuffer,  // 该 Input 的二进制序列：指向至少有 lBuffer 字节长缓冲区的指针 pBuffer；
    [IN] i32 pBufferMP  // pName 对应的内存页；
    [OUT] i32 lBuffer   // pBuffer 所指向缓冲区的字节长度；
) -> i32                // 返回输入的二进制数据字节长度：若输入的二进制数据少于或等于 lBuffer 字节, 
                        // 数据会被写入到 pBuffer 中；否则, pBuffer 指向的数据未定义，调用方应按照
                        // 返回的所需空间，申请足量内存后重试。
```

### 技法 (Technique)

技法 (Technique) 可计算摄像机的位置与视角。

必须导出函数 `main() -> i32(handle, clip)` 作为入口点：

```
main(
) -> i32(handle, clip) // 摄像机配置。 
```

拥有以下特别的 API：

#### 预定义输入 (Input) `progress` / `GetF32`

当前程序的进度: [0, 1) 间浮点数

#### Technique.MakeClip(f32, f32, f32, f32, f32, f32, f32) -> i32(handle, clip)

创建一个摄像机配置供 LiveHelper 渲染。

```
Technique.MakeClip(
    [IN] f32 pX,          // 机位位置，以 Minecraft 风格的 X, Y, Z 空间坐标系呈现。
    [IN] f32 pY,
    [IN] f32 pZ,
    [IN] f32 rX,          // 机位朝向，以四元数呈现。
    [IN] f32 rY,
    [IN] f32 rZ,
    [IN] f32 rW,
    [IN] f32 fov,         // FOV
) -> i32(handle, clip)    // 摄像机配置，请在 main 中返回。
```

### 调度器 (Manager)

调度器 (Manager) 可激活一个或多个分镜头 (Clip), 并设置其混合方式 (如果需要)。

必须导出函数 `main() -> i32(handle, render_request)` 作为入口点：

```
main() -> i32(handle, render_request) // 摄像机配置。 
```

拥有以下特别的 API：

#### 预定义输入 (Input) `clip` / `GetF32`

可支配的分镜头 (Clip) 个数：正整数

#### 预定义输入 (Input) `clip.$id.duration` / `GetF32`

可支配的第 N 个 (0-based) 分镜头 (Clip) 所需的时间毫秒数：正整数

#### 预定义输入 (Input) `clip.$id.name` / `GetBuffer`

可支配的第 N 个 (0-based) 分镜头 (Clip) 名称：UTF-8 编码的 null-terminated 字符串

#### 预定义输入 (Input) `duration` / `GetF32`

自调度器启动以来过去的时间毫秒数

#### Manager.Render.Single(i32(unsigned), f32) -> i32(handle, render_request)

使 LiveHelper 激活一个特定的分镜头 (Clip)。

```
Manager.Render.Single(
   i32(unsigned) clipIndex,       // 摄像机下标 (0-based)
   f32 progress                   // [0, 1] 间浮点数，代表该摄像机的进度
) -> i32(handle, render_request)  // 帧渲染配置，LiveHelper 渲染该分镜头 (Clip), 请在 main 中返回
```

#### Manager.Render.Mix(i32(handle, render_request), i32(handle, render_request), f32) -> i32(handle, render_request)

使 LiveHelper 同时激活两个分镜头 (Clip) 并线性插值合并。

```
Manager.Render.Mix(
   i32(handle, render_request) frame1, // 帧渲染配置 1
   i32(handle, render_request) frame2, // 帧渲染配置 2
   f32 progress                        // [0, 1] 间浮点数。若为 0，则只渲染 frame1；若为 1，则只渲染 frame2；否则，线性插值。
) -> i32(handle, render_request)       // 帧渲染配置，LiveHelper 渲染该分镜头 (Clip), 请在 main 中返回
```



