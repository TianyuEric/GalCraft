# Steam native runtime

The Windows x64 native entry uses steamworks.js 0.4.0, published by the [upstream project](https://github.com/ceifa/steamworks.js) under MIT. Its npm distribution includes the Node-API binding and Valve's steam_api64.dll. The package copies those actual Windows x64 files and records them in its manifest.

Authors configure their own Steam AppID. Public game distribution remains subject to the author's Steamworks agreement and the SDK redistribution terms. GalCraft's local package preparation does not publish a game or claim an account achievement result.

The upstream API exposes init, runCallbacks, achievement.activate and stats.store. It has no top-level shutdown function in 0.4.0. A dedicated child process owns initialization and callback pumping; disposing the native provider stops that process and releases its runtime resources. Playtests use the existing simulated domain and never initialize this process.

Sources checked 2026-10-25: the exact installed npm package's index.js, index.d.ts, client.d.ts and dist/win64; [Steamworks.js API](https://github.com/ceifa/steamworks.js#api); [Steamworks API lifecycle](https://partner.steamgames.com/doc/sdk/api).
