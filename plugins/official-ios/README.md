# iOS target 0.1.0

This lightweight Studio service package contributes `org.galcraft.ios/build` through the public target-builder SDK. Windows and Linux export a complete Xcode project without installing Apple tools. The project includes Swift source, Info.plist, shared scheme, the common Player runtime, snapshot, template, assets, exact runtime plugins, and a native-host bridge.

The native host uses WKWebView and a controlled `galcraft://app` URL scheme with MIME and range responses. WebKit reserves HTTP/HTTPS schemes, so the native resource handler uses its own explicit scheme. Player data is written as a single atomic file in the application's private support directory; lifecycle/audio events reach the shared PlayerHost. UIKit supplies file selection and export.

Open `ios-project/GalCraftPlayer.xcodeproj` in Xcode 16 or later. The deployment target is iOS 15.0, with an arm64 device target. The bundle ID and build number come from the frozen target options. Configure the author's Apple team, provisioning and app icons in Xcode before distribution. The macOS archive port invokes `xcodebuild` with the selected team/profile; `build.sh` offers the equivalent project-local entry using `GALCRAFT_DEVELOPMENT_TEAM`.

Project export on Windows is separate evidence from Xcode compilation, Apple signing and device execution. The latter require an available macOS/Apple environment.

API source: [WKURLSchemeHandler](https://developer.apple.com/documentation/webkit/wkurlschemehandler).
