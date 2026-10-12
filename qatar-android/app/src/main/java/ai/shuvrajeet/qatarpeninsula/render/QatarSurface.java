package ai.shuvrajeet.qatarpeninsula.render;

import android.content.Context;
import android.opengl.GLSurfaceView;
import android.view.MotionEvent;

public final class QatarSurface extends GLSurfaceView {
    private final QatarRenderer renderer;

    public QatarSurface(Context context) {
        super(context);
        setEGLContextClientVersion(3);
        renderer = new QatarRenderer(context.getAssets());
        setRenderer(renderer);
        setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        final float x = event.getX() / Math.max(1f, getWidth());
        final float y = event.getY() / Math.max(1f, getHeight());
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN && x > 0.82f && y > 0.72f) {
            queueEvent(renderer::cycleVehicle);
            return true;
        }
        queueEvent(() -> renderer.setTouch(x, y, event.getActionMasked() != MotionEvent.ACTION_UP));
        return true;
    }
}
