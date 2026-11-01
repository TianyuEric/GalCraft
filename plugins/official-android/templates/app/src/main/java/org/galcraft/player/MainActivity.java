package org.galcraft.player;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local HTTPS mapping and private, transactional PlayerHost data. */
public final class MainActivity extends Activity {
  private WebView web;
  private SQLiteDatabase storage;
  private ValueCallback<Uri[]> picker;
  private AudioManager audio;
  private final AudioManager.OnAudioFocusChangeListener focus = change -> event("galcraft-lifecycle", "{\"type\":\"" + (change < 0 ? "audioInterrupted" : "audioAvailable") + "\"}");
  private static final String ORIGIN = "appassets.androidplatform.net";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    storage = openOrCreateDatabase("player.db", MODE_PRIVATE, null);
    storage.execSQL("CREATE TABLE IF NOT EXISTS values_store (key TEXT PRIMARY KEY, bytes BLOB NOT NULL)");
    audio = (AudioManager)getSystemService(AUDIO_SERVICE);
    audio.requestAudioFocus(focus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
    web = new WebView(this);
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.getSettings().setMediaPlaybackRequiresUserGesture(true);
    web.addJavascriptInterface(new Bridge(), "GalCraftNative");
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !ORIGIN.equals(request.getUrl().getHost()); }
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!ORIGIN.equals(request.getUrl().getHost())) return response(403, "Forbidden", new byte[0], "text/plain", new HashMap<>());
        try {
          String path = request.getUrl().getPath();
          if (path == null || path.contains("..") || !path.startsWith("/")) throw new Exception("Invalid asset path");
          if (path.equals("/")) path = "/index.html";
          byte[] bytes;
          try (InputStream stream = getAssets().open("game" + path); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) { byte[] buffer = new byte[65536]; int read; while ((read = stream.read(buffer)) != -1) output.write(buffer, 0, read); bytes = output.toByteArray(); }
          String extension = MimeTypeMap.getFileExtensionFromUrl(path), mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
          if (extension.equals("js") || extension.equals("mjs")) mime = "text/javascript";
          if (extension.equals("wasm")) mime = "application/wasm";
          if (mime == null) mime = "application/octet-stream";
          HashMap<String,String> headers = new HashMap<>(); headers.put("Accept-Ranges", "bytes"); headers.put("Cache-Control", "no-cache");
          String range = request.getRequestHeaders().get("Range");
          if (range != null && range.startsWith("bytes=")) {
            String[] parts = range.substring(6).split("-", -1); int start = Integer.parseInt(parts[0]); int end = parts.length > 1 && !parts[1].isEmpty() ? Integer.parseInt(parts[1]) : bytes.length - 1;
            end = Math.min(end, bytes.length - 1);
            if (start < 0 || start > end) return response(416, "Range Not Satisfiable", new byte[0], mime, headers);
            headers.put("Content-Range", "bytes " + start + "-" + end + "/" + bytes.length);
            return response(206, "Partial Content", java.util.Arrays.copyOfRange(bytes, start, end + 1), mime, headers);
          }
          return response(200, "OK", bytes, mime, headers);
        } catch (Exception error) { return response(404, "Not Found", new byte[0], "text/plain", new HashMap<>()); }
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (picker != null) picker.onReceiveValue(null); picker = callback;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
        startActivityForResult(intent, 101); return true;
      }
    });
    web.setOnApplyWindowInsetsListener((view, insets) -> {
      float ratio = getResources().getDisplayMetrics().density;
      String value = "{safeArea:{top:" + insets.getSystemWindowInsetTop()/ratio + ",right:" + insets.getSystemWindowInsetRight()/ratio + ",bottom:" + insets.getSystemWindowInsetBottom()/ratio + ",left:" + insets.getSystemWindowInsetLeft()/ratio + "}}";
      web.evaluateJavascript("window.galcraftMobileViewport=" + value, null); return insets;
    });
    setContentView(web); web.loadUrl("https://" + ORIGIN + "/index.html?galcraft-target=android");
  }
  private WebResourceResponse response(int status, String reason, byte[] bytes, String mime, HashMap<String,String> headers) {
    headers.put("Content-Length", String.valueOf(bytes.length));
    return new WebResourceResponse(mime, "UTF-8", status, reason, headers, new ByteArrayInputStream(bytes));
  }
  private void event(String name, String json) { if (web != null) runOnUiThread(() -> web.evaluateJavascript("window.dispatchEvent(new CustomEvent('" + name + "',{detail:Object.assign(" + json + ",{at:new Date().toISOString()})}))", null)); }
  @Override protected void onPause() { event("galcraft-lifecycle", "{\"type\":\"background\"}"); super.onPause(); }
  @Override protected void onResume() { super.onResume(); event("galcraft-lifecycle", "{\"type\":\"foreground\"}"); }
  @Override public void onLowMemory() { super.onLowMemory(); event("galcraft-lifecycle", "{\"type\":\"memoryPressure\"}"); }
  @Override public void onBackPressed() { event("galcraft-input", "{\"action\":\"back\",\"phase\":\"down\",\"origin\":\"system\",\"nativeCode\":\"AndroidBack\"}"); }
  @Override protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == 101 && picker != null) { picker.onReceiveValue(result == RESULT_OK && data != null ? new Uri[]{ data.getData() } : null); picker = null; }
    if (request == 102 && exportFile != null) {
      try { if (result != RESULT_OK || data == null) throw new Exception("Export cancelled"); try (InputStream input = new java.io.FileInputStream(exportFile); OutputStream output = getContentResolver().openOutputStream(data.getData())) { byte[] buffer = new byte[65536]; int read; while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read); } exportResult(true, ""); }
      catch (Exception error) { exportResult(false, error.toString()); }
      exportFile.delete(); exportFile = null;
    }
  }
  @Override protected void onDestroy() { audio.abandonAudioFocus(focus); if (picker != null) picker.onReceiveValue(null); web.destroy(); storage.close(); super.onDestroy(); }
  private JSONObject success(Object value) throws Exception { return new JSONObject().put("ok", true).put("value", value == null ? JSONObject.NULL : value).put("warnings", new JSONArray()); }
  private byte[] bytes(JSONArray array) throws Exception { byte[] result = new byte[array.length()]; for (int index = 0; index < result.length; index++) result[index] = (byte)array.getInt(index); return result; }
  private final class Bridge {
    @JavascriptInterface public synchronized void post(String id, String method, String raw) {
      if (!method.equals("transfer.export")) return;
      if (exportReply != null) { runOnUiThread(() -> web.evaluateJavascript("window.galcraftNativeReply(" + JSONObject.quote(id) + "," + hostFailure("Export already open") + ")", null)); return; }
      exportReply = id; String result = invoke(method, raw);
      try { if (!new JSONObject(result).getBoolean("ok")) exportResult(false, new JSONObject(result).getJSONObject("error").getString("message")); } catch (Exception error) { exportResult(false, error.toString()); }
    }
    @JavascriptInterface public synchronized String invoke(String method, String raw) {
      try {
        JSONObject args = new JSONObject(raw);
        if (method.equals("storage.read")) {
          try (Cursor cursor = storage.rawQuery("SELECT bytes FROM values_store WHERE key=?", new String[]{args.getString("key")})) {
            if (!cursor.moveToFirst()) return success(null).toString();
            JSONArray value = new JSONArray(); for (byte item : cursor.getBlob(0)) value.put(item & 255); return success(value).toString();
          }
        }
        if (method.equals("storage.commit")) {
          JSONObject domain = args.getJSONObject("domain");
          String prefix = "player/" + domain.getString("projectId") + "/" + domain.getString("kind") + "/" + Uri.encode(domain.getString("instance")) + "/";
          JSONArray writes = args.getJSONArray("writes"), deletes = args.getJSONArray("deletes");
          for (int index = 0; index < writes.length(); index++) if (!writes.getJSONObject(index).getString("key").startsWith(prefix)) throw new Exception("STORAGE_DOMAIN");
          for (int index = 0; index < deletes.length(); index++) if (!deletes.getString(index).startsWith(prefix)) throw new Exception("STORAGE_DOMAIN");
          int revision = 0; storage.beginTransaction();
          try {
            try (Cursor cursor = storage.rawQuery("SELECT bytes FROM values_store WHERE key=?", new String[]{prefix + "revision"})) { if (cursor.moveToFirst()) revision = Integer.parseInt(new String(cursor.getBlob(0), java.nio.charset.StandardCharsets.UTF_8)); }
            if (revision != args.getInt("expectedRevision")) throw new Exception("STORAGE_STALE");
            for (int index = 0; index < writes.length(); index++) { JSONObject item = writes.getJSONObject(index); storage.execSQL("INSERT OR REPLACE INTO values_store(key,bytes) VALUES(?,?)", new Object[]{item.getString("key"), bytes(item.getJSONArray("bytes"))}); }
            for (int index = 0; index < deletes.length(); index++) storage.execSQL("DELETE FROM values_store WHERE key=?", new Object[]{deletes.getString(index)});
            storage.execSQL("INSERT OR REPLACE INTO values_store(key,bytes) VALUES(?,?)", new Object[]{prefix + "revision", String.valueOf(revision + 1).getBytes(java.nio.charset.StandardCharsets.UTF_8)});
            storage.setTransactionSuccessful();
          } finally { storage.endTransaction(); }
          return success(new JSONObject().put("revision", revision + 1)).toString();
        }
        if (method.equals("transfer.export")) {
          String name = args.getString("name").replaceAll("[\\\\/]", "_");
          java.io.File directory = new java.io.File(getFilesDir(), "exports"); directory.mkdirs();
          java.io.File file = new java.io.File(directory, name);
          try (OutputStream output = new java.io.FileOutputStream(file)) { output.write(bytes(args.getJSONArray("bytes"))); }
          // The system picker gets a copy; Player data remains in the private store.
          runOnUiThread(() -> { Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(args.optString("mime", "application/octet-stream")); intent.putExtra(Intent.EXTRA_TITLE, name); exportFile = file; startActivityForResult(intent, 102); });
          return success(null).toString();
        }
        if (method.equals("close")) { runOnUiThread(() -> finish()); return success(null).toString(); }
        if (method.equals("platform") && args.optString("name").equals("window.fullscreen")) return success(new JSONObject().put("enabled", true)).toString();
        throw new Exception("PLATFORM_UNAVAILABLE");
      } catch (Exception error) { try { JSONObject issue = new JSONObject().put("code", "MOBILE_HOST").put("message", error.toString()).put("severity", "error").put("owner", "M07").put("related", new JSONArray()).put("actions", new JSONArray().put("retry")); return new JSONObject().put("ok", false).put("error", issue).put("issues", new JSONArray().put(issue)).toString(); } catch (Exception nested) { throw new RuntimeException(nested); } }
    }
  }
  private java.io.File exportFile;
  private String exportReply;
  private String hostFailure(String message) {
    try { JSONObject issue = new JSONObject().put("code", "MOBILE_TRANSFER").put("message", message).put("severity", "error").put("owner", "M07").put("related", new JSONArray()).put("actions", new JSONArray().put("retry")); return new JSONObject().put("ok", false).put("error", issue).put("issues", new JSONArray().put(issue)).toString(); } catch (Exception error) { throw new RuntimeException(error); }
  }
  private void exportResult(boolean succeeded, String message) {
    String id = exportReply; exportReply = null; if (id == null) return;
    try { String result = succeeded ? success(null).toString() : hostFailure(message); runOnUiThread(() -> web.evaluateJavascript("window.galcraftNativeReply(" + JSONObject.quote(id) + "," + result + ")", null)); } catch (Exception error) { throw new RuntimeException(error); }
  }
}
