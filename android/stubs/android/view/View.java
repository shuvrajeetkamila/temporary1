package android.view;
import android.graphics.Canvas;
public class View extends android.content.Context {
  public interface OnTouchListener {
    boolean onTouch(View v, MotionEvent m);
  }
  public static interface OnClickListener { void onClick(View v); }
  public View(android.content.Context c) {}
  public void setLayoutParams(ViewGroup.LayoutParams p) {}
  public void setPadding(int a, int b, int c, int d) {}
  public void setBackgroundColor(int c) {}
  public void setOnClickListener(OnClickListener l) {}
  public void setOnTouchListener(OnTouchListener l) {}
  public void invalidate() {}
  public int getWidth() { return 0; }
  public int getHeight() { return 0; }
  protected void onDraw(Canvas c) {}
}
