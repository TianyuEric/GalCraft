# Getting started

[简体中文](getting-started.zh-CN.md) · [Project overview](../README.en.md)

GalCraft 0.1.0 is an early preview for Windows x64. Download the Windows installer from the [0.1.0 release](https://github.com/TianyuEric/GalCraft/releases/tag/v0.1.0), or start the npm application with `npx --yes --package=@galcraft/studio@0.1.0 galcraft-studio`.

| Your goal | Entry |
|---|---|
| Try a finished work | [Play Light up spring tonight](https://galcraft.dev/en/examples/) |
| Create a first project | [Your first project](https://galcraft.dev/docs/en/first-project/) and [basic operations](https://galcraft.dev/docs/en/basic-operations/) |
| Edit the tutorial sample | Check the [Examples page](https://galcraft.dev/en/examples/) for availability, then follow the [sample tutorial](https://galcraft.dev/docs/en/sample-tutorial/) |
| Use Studio | [Product manual](https://galcraft.dev/docs/en/studio-guide/) |
| Run from source | Install Node.js 24.21.0 and pnpm 12.3.4, then run the commands below |
| Build a plugin | [Plugin tutorial](https://galcraft.dev/docs/en/plugin-development/) and [plugin contract](reference/plugins.md) |
| Change GalCraft | [Development](development.md), [architecture](architecture.md) and [contributing](../CONTRIBUTING.md) |

Run from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @galcraft/studio desktop
```

The second command builds the complete desktop application and engine. First preparation downloads missing fonts and media tools. `pnpm dev` starts the renderer development server; use the desktop command for the complete host. The [development guide](development.md) describes preparation and restart behavior.

The website owns the single maintained product manual. Report a documentation issue with its page URL through the repository's contribution channel. Chinese is the normative language for repository engineering rules; this entry and the README provide English navigation.
