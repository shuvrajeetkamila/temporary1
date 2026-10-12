package ai.shuvrajeet.qataronegb;

import android.app.Activity;
import android.opengl.GLES30;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.io.IOException;

/** Offline-only launcher for the 1 GiB local-streaming package foundation. */
public final class MainActivity extends Activity {
    private GLSurfaceView surface;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        surface = new GLSurfaceView(this);
        surface.setEGLContextClientVersion(3);
        surface.setRenderer(new CountryRenderer());
        surface.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);

        TextView status = new TextView(this);
        status.setTextColor(0xfff6e7c3);
        status.setTextSize(14f);
        status.setPadding(24, 24, 24, 24);
        status.setText(new OfflineWorldIndex(getAssets()).startupStatus());

        FrameLayout root = new FrameLayout(this);
        root.addView(surface);
        FrameLayout.LayoutParams overlay = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        root.addView(status, overlay);
        setContentView(root);
    }

    @Override protected void onPause() { surface.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); surface.onResume(); }

    private static final class CountryRenderer implements GLSurfaceView.Renderer {
        @Override public void onSurfaceCreated(javax.microedition.khronos.opengles.GL10 gl,
                                               javax.microedition.khronos.egl.EGLConfig config) {
            GLES30.glClearColor(0.06f, 0.18f, 0.27f, 1f);
        }
        @Override public void onSurfaceChanged(javax.microedition.khronos.opengles.GL10 gl, int width, int height) {
            GLES30.glViewport(0, 0, width, height);
        }
        @Override public void onDrawFrame(javax.microedition.khronos.opengles.GL10 gl) {
            GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT | GLES30.GL_DEPTH_BUFFER_BIT);
        }
    }
}
