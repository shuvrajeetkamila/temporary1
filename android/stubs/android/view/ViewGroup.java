package android.view;
public class ViewGroup extends View {
  public static class LayoutParams {
    public static final int MATCH_PARENT = -1;
    public LayoutParams(int w, int h) {}
  }
  public ViewGroup(android.content.Context c) { super(c); }
  public void addView(View v) {}
  public void addView(View v, LayoutParams p) {}
}
