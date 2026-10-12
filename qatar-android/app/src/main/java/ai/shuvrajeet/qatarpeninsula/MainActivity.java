package ai.shuvrajeet.qatarpeninsula;

import android.app.Activity;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import ai.shuvrajeet.qatarpeninsula.render.QatarSurface;

/** Launcher activity for the offline GLES3 prototype. */
public final class MainActivity extends Activity {
    private QatarSurface surface;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);

        FrameLayout root = new FrameLayout(this);
        surface = new QatarSurface(this);
        root.addView(surface);
        TextView attribution = new TextView(this);
        attribution.setText("QATAR: THE PENINSULA  •  Offline GLES3 prototype  •  F1-equivalent: tap ?");
        attribution.setTextColor(0xffd9eee9);
        attribution.setTextSize(11);
        attribution.setPadding(20, 16, 20, 16);
        root.addView(attribution);
        setContentView(root);
    }

    @Override protected void onPause() { super.onPause(); surface.onPause(); }
    @Override protected void onResume() { super.onResume(); surface.onResume(); }
}
