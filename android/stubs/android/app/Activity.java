package android.app;
import android.os.Bundle;
import android.view.Window;
public class Activity extends android.content.Context {
  public void onCreate(Bundle b) {}
  public Window getWindow() { return null; }
  public void setContentView(android.view.View v) {}
  public void requestWindowFeature(int f) {}
  public android.content.res.AssetManager getAssets() { return null; }
}
