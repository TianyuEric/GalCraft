# 引擎目录

M11 从 `<Studio userData>/engines/<version>/manifest.json` 读取本机已安装的运行包。`version` 是精确 SemVer；manifest 的 `id` 固定为 `galcraft`，`version` 必须与目录名相同。`files` 列出运行包文件及字节数，并包含 compiler、双目标 Player 入口、升级入口（存在时）和 release notes。已被作品引用的版本保留原目录；补齐缺失版本时安装相同版本的完整包。

`EngineCatalog.listCreationVersions(target)` 列出可创建作品的已安装版本。`resolveProjectEngine(project, lock, target)` 为打开、编译、试玩及发布返回同一精确版本的 compiler 和目标 Player 路径。缺版本返回 `ENGINE_MISSING` 与补齐动作，目标不支持返回 `ENGINE_UNSUPPORTED`，作品与 Lock 不一致返回 `ENGINE_LOCK_MISMATCH`；这些操作只读，不修改作品或运行包。Android 保留契约目标字段，当前不作为可用运行目标。
