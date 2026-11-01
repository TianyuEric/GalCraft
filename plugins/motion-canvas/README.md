# Motion Canvas 视频插件

普通精确插件 `org.galcraft.motion-canvas@0.1.0` 提供 DOM-free 工程定义、作者文档、只读领域工具及本机制作操作。播放器消费标准 MP4；可编辑 TS/TSX 保存在 M02 作者源中。本机可选工具链由 [准备入口](../../tools/motion-canvas/README.md)提供。

| 公开键 | 用途 |
|---|---|
| `org.galcraft.motion-canvas/project` | 作者文档类型，data 为 `{project}` |
| `org.galcraft.motion-canvas/projectInfo` | describe 返回工程 schema/起始工程；validate 返回结构/语义诊断；runtime 返回实际工具链可用状态 |
| `org.galcraft.motion-canvas/render` | M10 本地制作操作，fields 为 `{project}`，输出 video/mp4 的 video 端口 |
| `org.galcraft.motion-canvas/renderProvider` | 提交、实际进度及取消；freeze 冻结实际工具链版本 |
| `org.galcraft.motion-canvas/toolchain` | 已声明的宿主外置运行时能力 |

`MotionProject` 包含 schemaVersion、源身份/修订、title、entry、files、bindings、render、toolchain。M02 文档修订是编辑基准；project.revision 是可辨认的源码修订。entry 指向 files 中的 TS/TSX；文件使用相对路径，源码支持已固定工具链中的 Motion Canvas 核心/2D、普通相对模块及 CSS/JSON 导入。安装其他 npm 模块需要提供方另行声明并验证真实工具链。

bindings 用唯一 alias 关联 assetId、variantId、port 和 purpose。三个输入端口为 images/image（多张）、fonts/font（多个）和 audio/audio（一条）。`galcraft_production.prepare` 的 references 使用 `{assetId,variantId,port}`，宿主解析实际资源；作者源保留稳定身份。工程以以下公开虚拟模块使用素材：

```tsx
import {asset, font} from '@galcraft/motion-canvas-assets';
// 对应 bindings 中 cover/image 与 body/font：
view.add(<Img src={asset('cover')} width={960}/>);
view.add(<Txt text="春日序章" fontFamily={font('body')} fill="#fff"/>);
```

render 记录偶数 width/height、fps、frames、音轨 alias/startSec/trimSec/gainDb。首期编码固定为不透明 H.264/yuv420p；音频采用 AAC 128kbps。源场景时长必须等于 frames/fps，工具链会在逐帧输出前计算并拒绝不一致。`createMotionProject`、`parseMotionProject`、`updateMotionProject` 和 `motionProjectSchema` 由包根公开。

作者或 harness 先从目录读取工程类型、操作及素材定义，通过 `galcraft_documents` 创建/读取/修改作者文档，携带当前文档修订提交 M02。`projectInfo.validate` 只验证结构与语义，实际编译和时长诊断在本机渲染执行。制作按 M10 的 prepare → 审阅/submit → task 查询/取消运行，使用同一工程及精确素材引用。M10 在计划中保存精确插件和 runtime 快照，适配器拒绝执行方版本变化。

本机制作同样使用“连接与工具”中的实际执行实例：protocol 为 plugin，providerKey 为 renderProvider，purpose 为 render；准备工具链后创建该配置，prepare 使用目录返回的真实 connectionId。影片沿既有 cg 制作用途产生 video 素材，库采用保留标准视频和作者源。

完成候选包含 `metadata.authorDocument`，采用计划把标准视频和可编辑源一次交给 M04/M02。作者确认采用后可以撤销；正式保存是单独动作。查看结果经 `galcraft_media` 读取完整成品或指定时间/帧画面，修改工程后建立新执行；已完成候选继续保留。缺少制作插件时，作品保留作者源，标准视频继续按原播放器能力消费。

构建、类型及相邻检查使用 `pnpm --filter @galcraft/motion-canvas build|typecheck|test`。构建的 definition/editor 入口使用浏览器可用产物；services 入口通过公开 SDK 调用声明过的外置工具链，不导入宿主内部业务。Motion Canvas MIT 许可随 `package/licenses/motion-canvas.txt` 分发。
