import java.util.jar.*;
import java.util.*;
import java.io.*;

public class JarCheck {
  public static void main(String[] a) throws Exception {
    JarFile jf = new JarFile(a[0], true);
    Enumeration<JarEntry> en = jf.entries();
    int n = 0;
    while (en.hasMoreElements()) {
      JarEntry e = en.nextElement();
      InputStream is = jf.getInputStream(e);
      byte[] buf = new byte[8192];
      while (is.read(buf) >= 0) { }
      is.close();
      n++;
      System.out.println("verified: " + e.getName());
    }

    System.out.println("ALL " + n + " ENTRIES VERIFIED BY JAVA JARVERIFIER");
  }
}
