import UIKit
import WebKit
import UniformTypeIdentifiers
import AVFoundation

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let window = UIWindow(frame: UIScreen.main.bounds)
    window.rootViewController = PlayerController(); window.makeKeyAndVisible(); self.window = window
    return true
  }
}

final class PlayerController: UIViewController, WKURLSchemeHandler, WKScriptMessageHandler, WKNavigationDelegate, UIDocumentPickerDelegate {
  private var web: WKWebView!
  private var values: [String: [UInt8]] = [:]
  private var exportReply: String?
  private let store = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("GalCraft/player.json")
  override func viewDidLoad() {
    super.viewDidLoad()
    if let bytes = try? Data(contentsOf: store), let decoded = try? JSONDecoder().decode([String: [UInt8]].self, from: bytes) { values = decoded }
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(self, forURLScheme: "galcraft")
    config.userContentController.add(self, name: "galcraft")
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = .all
    web = WKWebView(frame: view.bounds, configuration: config); web.navigationDelegate = self
    web.autoresizingMask = [.flexibleWidth, .flexibleHeight]; view.addSubview(web)
    web.load(URLRequest(url: URL(string: "galcraft://app/index.html?galcraft-target=ios")!))
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
    center.addObserver(self, selector: #selector(foreground), name: UIApplication.willEnterForegroundNotification, object: nil)
    center.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
  }
  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange(); let area = view.safeAreaInsets
    web?.evaluateJavaScript("window.galcraftMobileViewport={safeArea:{top:\(area.top),right:\(area.right),bottom:\(area.bottom),left:\(area.left)}}")
  }
  override func didReceiveMemoryWarning() { super.didReceiveMemoryWarning(); event("memoryPressure") }
  @objc private func background() { event("background") }
  @objc private func foreground() { event("foreground") }
  @objc private func audioInterrupted(_ notification: Notification) {
    let kind = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
    event(kind == AVAudioSession.InterruptionType.began.rawValue ? "audioInterrupted" : "audioAvailable")
  }
  private func event(_ type: String) { web?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('galcraft-lifecycle',{detail:{type:'\(type)',at:new Date().toISOString()}}))") }
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    decisionHandler(action.request.url?.scheme == "galcraft" && action.request.url?.host == "app" ? .allow : .cancel)
  }
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    do {
      guard let url = task.request.url, url.host == "app", let game = Bundle.main.resourceURL?.appendingPathComponent("Game") else { throw CocoaError(.fileReadNoSuchFile) }
      let target = game.appendingPathComponent(url.path).standardizedFileURL
      guard target.path.hasPrefix(game.path + "/") else { throw CocoaError(.fileReadNoPermission) }
      let source = try Data(contentsOf: target), mime = UTType(filenameExtension: target.pathExtension)?.preferredMIMEType ?? (target.pathExtension == "js" ? "text/javascript" : "application/octet-stream")
      var data = source, status = 200, headers = ["Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"]
      if let range = task.request.value(forHTTPHeaderField: "Range"), range.hasPrefix("bytes=") {
        let parts = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
        if let start = Int(parts[0]), start >= 0, start < source.count {
          let end = min(parts.count > 1 ? Int(parts[1]) ?? source.count - 1 : source.count - 1, source.count - 1)
          guard end >= start else { throw CocoaError(.fileReadCorruptFile) }
          data = source.subdata(in: start..<(end + 1)); status = 206; headers["Content-Range"] = "bytes \(start)-\(end)/\(source.count)"
        }
      }
      headers["Content-Length"] = String(data.count)
      task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!); task.didReceive(data); task.didFinish()
    } catch { task.didFailWithError(error) }
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
  private func success(_ value: Any = NSNull()) -> [String: Any] { ["ok": true, "value": value, "warnings": []] }
  private func failure(_ error: Error) -> [String: Any] {
    let issue: [String: Any] = ["code": "MOBILE_HOST", "message": String(describing: error), "severity": "error", "owner": "M07", "related": [], "actions": ["retry"]]
    return ["ok": false, "error": issue, "issues": [issue]]
  }
  private func reply(_ id: String, _ result: [String: Any]) {
    guard let json = try? JSONSerialization.data(withJSONObject: result), let text = String(data: json, encoding: .utf8), let quoted = try? JSONSerialization.data(withJSONObject: [id]), let ids = String(data: quoted, encoding: .utf8) else { return }
    web.evaluateJavaScript("window.galcraftNativeReply(\(ids)[0],\(text))")
  }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.host == "app", let body = message.body as? [String: Any], let id = body["id"] as? String, let method = body["method"] as? String, let args = body["args"] as? [String: Any] else { return }
    do {
      if method == "storage.read", let key = args["key"] as? String { reply(id, success(values[key] as Any? ?? NSNull())); return }
      if method == "storage.commit", let domain = args["domain"] as? [String: String], let project = domain["projectId"], let kind = domain["kind"], let instance = domain["instance"], let revision = args["expectedRevision"] as? Int, let writes = args["writes"] as? [[String: Any]], let deletes = args["deletes"] as? [String] {
        var allowed = CharacterSet.alphanumerics; allowed.insert(charactersIn: "-_.!~*'()")
        let prefix = "player/\(project)/\(kind)/\(instance.addingPercentEncoding(withAllowedCharacters: allowed)!)/"
        let current = values[prefix + "revision"].flatMap { String(bytes: $0, encoding: .utf8) }.flatMap(Int.init) ?? 0
        guard current == revision, writes.allSatisfy({ ($0["key"] as? String)?.hasPrefix(prefix) == true && $0["bytes"] is [UInt8] }), deletes.allSatisfy({ $0.hasPrefix(prefix) }) else { throw CocoaError(.validationMissingMandatoryProperty) }
        var next = values
        for item in writes { next[item["key"] as! String] = item["bytes"] as? [UInt8] }
        for key in deletes { next.removeValue(forKey: key) }; next[prefix + "revision"] = Array(String(revision + 1).utf8)
        let bytes = try JSONEncoder().encode(next); try FileManager.default.createDirectory(at: store.deletingLastPathComponent(), withIntermediateDirectories: true)
        try bytes.write(to: store, options: .atomic); values = next; reply(id, success(["revision": revision + 1])); return
      }
      if method == "transfer.export", let name = args["name"] as? String, let bytes = args["bytes"] as? [UInt8] {
        guard exportReply == nil else { throw CocoaError(.userCancelled) }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(URL(fileURLWithPath: name).lastPathComponent)
        try Data(bytes).write(to: file, options: .atomic); exportReply = id
        let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true); picker.delegate = self; present(picker, animated: true); return
      }
      if method == "platform", args["name"] as? String == "window.fullscreen" { reply(id, success(["enabled": true])); return }
      if method == "close" { reply(id, success()); return }
      throw CocoaError(.featureUnsupported)
    } catch { reply(id, failure(error)) }
  }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { if let id = exportReply { reply(id, success()); exportReply = nil } }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { if let id = exportReply { reply(id, failure(CocoaError(.userCancelled))); exportReply = nil } }
  deinit { NotificationCenter.default.removeObserver(self) }
}
