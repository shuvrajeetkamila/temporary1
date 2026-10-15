package android.view;
public class View {
  public static interface OnClickListener { void onClick(View v); }
  public void setLayoutParams(ViewGroup.LayoutParams p) {}
  public void setPadding(int a, int b, int c, int d) {}
  public void setBackgroundColor(int c) {}
  public void setOnClickListener(OnClickListener l) {}
}
