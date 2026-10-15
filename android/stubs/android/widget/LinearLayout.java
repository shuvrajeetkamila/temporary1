package android.widget;
import android.view.ViewGroup;
public class LinearLayout extends ViewGroup {
  public static class LayoutParams extends ViewGroup.LayoutParams {
    public LayoutParams(int w, int h, float weight) { super(w, h); }
  }
  public static final int VERTICAL = 1;
  public static final int HORIZONTAL = 0;
  public LinearLayout(Object context) {}
  public void setOrientation(int o) {}
}
