package com.arena.islandrealm;

import android.app.Activity;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;

/**
 * Island Realm shell v3 — descriptor-exact against the real Android SDK.
 * Boots into a diagnostics canvas (pure View, no widgets/WebView needed),
 * then a tap launches the world in a WebView. Every referenced method below
 * exists with the same signature in the real framework, so NoSuchMethodError
 * at class-load is impossible.
 */
public class MainActivity extends Activity {
  private String logS = "";
  private BootView view;
  private boolean worldStarted = false;

  private void say(String s) {
    logS = logS + s + "\n";
    view.setText(logS);
    view.invalidate();
  }

  public void onCreate(Bundle b) {
    super.onCreate(b);
    view = new BootView(this);
    setContentView(view);
    say("ISLAND REALM — Mumbai / Navi Mumbai");
    say("BUILD 3.0 — real-toolchain APK");
    say("Android " + android.os.Build.VERSION.RELEASE + " (SDK " + android.os.Build.VERSION.SDK_INT + ") " + android.os.Build.MODEL);
    try {
      java.io.InputStream in = getAssets().open("index.html");
      long n = 0;
      byte[] buf = new byte[65536];
      int r = in.read(buf);
      while (r > 0) { n += r; r = in.read(buf); }
      in.close();
      say("Game data OK (" + (n / 1024L) + " KB)");
    } catch (Throwable t) {
      say("Game data PROBLEM: " + t.toString());
    }
    try {
      Class.forName("android.webkit.WebView");
      say("WebView present.");
    } catch (Throwable t) {
      say("WebView MISSING: " + t.toString());
    }
    say("");
    say("TAP ANYWHERE TO ENTER THE WORLD");
    view.setOnTouchListener(new View.OnTouchListener() {
      public boolean onTouch(View v, MotionEvent m) {
        if (m.getAction() == MotionEvent.ACTION_DOWN) startWorld();
        return true;
      }
    });
  }

  private void startWorld() {
    if (worldStarted) return;
    worldStarted = true;
    try {
      android.webkit.WebView web = new android.webkit.WebView(this);
      android.webkit.WebSettings s = web.getSettings();
      s.setJavaScriptEnabled(true);
      s.setDomStorageEnabled(true);
      s.setAllowFileAccess(true);
      s.setAllowFileAccessFromFileURLs(true);
      s.setAllowUniversalAccessFromFileURLs(true);
      web.setWebViewClient(new android.webkit.WebViewClient());
      setContentView(web);
      web.loadUrl("file:///android_asset/index.html");
      say("World launched.");
    } catch (Throwable t) {
      worldStarted = false;
      say("WORLD FAIL: " + t.toString());
      say("Screenshot this screen and send it.");
      setContentView(view);
    }
  }

  /** Diagnostics canvas: renders the boot log; doubles as the tap target. */
  private static class BootView extends View {
    private String text = "";
    private final Paint title;
    private final Paint body;

    BootView(android.content.Context c) {
      super(c);
      title = new Paint();
      title.setAntiAlias(true);
      title.setTextSize(44);
      title.setColor(0xFFFFD97F);
      body = new Paint();
      body.setAntiAlias(true);
      body.setTextSize(30);
      body.setColor(0xFFEEF4F8);
    }

    void setText(String s) { text = s; }

    protected void onDraw(Canvas cv) {
      cv.drawColor(0xFF0A1826);
      cv.drawText("ISLAND REALM", 40, 90, title);
      float y = 170;
      int from = 0;
      while (from < text.length()) {
        int nl = text.indexOf(10, from);
        if (nl < 0) nl = text.length();
        String line = text.substring(from, nl);
        from = nl + 1;
        cv.drawText(line, 40, y, body);
        y += 40;
        if (y > getHeight() - 30) break;
      }
    }
  }
}
