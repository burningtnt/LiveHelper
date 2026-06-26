# LiveHelper

欢迎使用 LiveHelper 直播助手实现多机位游戏内直播。

## 使用

LiveHelper 使用 分镜头 (Clip) + 调度器 (Manager) 三级控制系统。

| 类型  |  所需的程序  |        输出         |
|:---:|:-------:|:-----------------:|
| 分镜头 | 一个分镜头程序 |     摄像机的位置与视角     |
| 调度器 | 一个调度器程序 | 一个分镜头，或多个分镜头和合并策略 |

LiveHelper 在每帧按照如下流程完成机位计算：

1. 向调度器程序传入时间等信息, 获得一个或多个被激活的分镜头 (Clip) 及混合方式 (如果有)；
2. 让每个分镜头 (Clip) 所对的分镜头程序计算其位置与视角；
3. 依次渲染每一个所需的画面, 并按照调度器程序的命令混合；
4. 通过 Spout 库推流至外部程序。

LiveHelper 预定义了多个分镜头和调度器程序共用户使用。您也可以查看 API 文档以编写自定义的 AssemblyScript 程序。

## 获取流

任何其他使用 Spout2 纹理共享库的软件均可获取视频流，包括：
- [OBS](https://obsproject.com/)：安装 [OBS Spout2 插件](https://github.com/Off-World-Live/obs-spout2-plugin)；
- 其他软件：访问 [Spout2 主页](https://leadedge.github.io/)以查看更多基于 Spout2 的软件。

## 设备兼容性

在部分老旧 GPU 上，LiveHelper 可能无法推送大于游戏主窗口分辨率的画面，或超出部分像素全部为黑色。此时，请进入 Minecraft 开启模组 `ENABLE_MULTI_CONTEXT_WORKAROUND` 配置以缓解该问题。