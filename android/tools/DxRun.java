import java.lang.reflect.Method;
public class DxRun {
  public static void main(String[] a) throws Exception {
    Class c = Class.forName("com.android.dx.command.Main");
    Method found = null;
    Method[] all = c.getDeclaredMethods();
    for (int i = 0; i < all.length; i++) {
      Method m = all[i];
      if (m.getName().equals("main")) { found = m; break; }
    }
    if (found == null) { System.err.println("no main method found"); System.exit(99); }
    found.setAccessible(true);
    Class[] ps = found.getParameterTypes();
    Object arg = a;
    if (ps.length == 1 && ps[0] == String[].class) {
      Object r = found.invoke(null, new Object[] { a });
      int rc = (r instanceof Integer) ? ((Integer) r).intValue() : 0;
      System.exit(rc);
    } else {
      System.err.println("main has unexpected signature: " + found.toString());
      System.exit(98);
    }
  }
}
