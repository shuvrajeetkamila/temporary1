package com.arena.islandrealm;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.InputStream;

/** Island Realm shell v2: ALWAYS opens. Pure-Java boot screen reports the
 * device and every boot step; the world launches behind a button so a WebView
 * problem can never leave you with a blank screen again. */
public class MainActivity extends Activity {
  private TextView log;
  private String logS = "";

  private void say(String s) {
    logS = logS + s + "\n";
    log.setText(logS);
  }

  public void onCreate(Bundle b) {
    super.onCreate(b);
    try {
      LinearLayout root = new LinearLayout(this);
      root.setOrientation(LinearLayout.VERTICAL);
      root.setBackgroundColor(0xFF0A1826);
      root.setPadding(24, 48, 24, 24);

      TextView title = new TextView(this);
      title.setText("ISLAND REALM — Mumbai · Navi Mumbai");
      title.setTextColor(0xFFFFD97F);
      title.setTextSize(18);
      root.addView(title);

      log = new TextView(this);
      log.setTextColor(0xFFEEF4F8);
      log.setTextSize(13);
      log.setPadding(0, 20, 0, 20);
      ScrollView sc = new ScrollView(this);
      sc.addView(log);
      root.addView(sc, new LinearLayout.LayoutParams(-1, 0, 1.0f));

      Button go = new Button(this);
      go.setText("ENTER THE WORLD");
      go.setOnClickListener(new View.OnClickListener() {
        public void onClick(View v) { startWorld(); }
      });
      root.addView(go);
      setContentView(root);
    } catch (Throwable t) {
      // even the UI failed; last resort plain text
      super.setContentView(new TextView(this));
      t.toString();
      return;
    }
    say("Device: Android " + android.os.Build.VERSION.RELEASE + " (SDK " +
        android.os.Build.VERSION.SDK_INT + "), " + android.os.Build.MODEL);
    try {
      InputStream in = getAssets().open("index.html");
      long n = 0, r;
      byte[] buf = new byte[65536];
      while ((r = in.read(buf)) > 0) n += r;
      in.close();
      say("Game data OK (" + (n / 1024) + " KB bundled).");
    } catch (Throwable t) {
      say("Game data PROBLEM: " + t);
    }
    try {
      Class.forName("android.webkit.WebView");
      say("WebView present. Tap ENTER THE WORLD.");
    } catch (Throwable t) {
      say("WebView MISSING on this device — the 3D world needs it. " + t);
    }
    say("If the world fails after this screen, screenshot THIS screen and send it.");
  }

  private void startWorld() {
    try {
      WebView web = new WebView(this);
      WebSettings s = web.getSettings();
      s.setJavaScriptEnabled(true);
      s.setDomStorageEnabled(true);
      s.setAllowFileAccess(true);
      s.setAllowFileAccessFromFileURLs(true);
      s.setAllowUniversalAccessFromFileURLs(true);
      try { s.setMediaPlaybackRequiresUserGesture(false); } catch (Throwable ignored) {}
      web.setWebViewClient(new WebViewClient());
      setContentView(web);
      web.loadUrl("file:///android_asset/index.html");
      say("World launched.");
    } catch (Throwable t) {
      say("WORLD FAIL: " + t);
    }
  }
}
