package ai.shuvrajeet.qatarpeninsula.world;

import android.content.res.AssetManager;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/** Minimal versioned packaged-world gate. It deliberately fails closed if its asset is missing. */
public final class QatarWorldManifest {
    public static final String MAGIC = "QTRWORLD";
    public final String version;
    public final int municipalityCount;

    private QatarWorldManifest(String version, int municipalityCount) {
        this.version = version;
        this.municipalityCount = municipalityCount;
    }

    public static QatarWorldManifest load(AssetManager assets) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(assets.open("world/qatar_world_manifest.txt")))) {
            String magic = reader.readLine();
            String version = reader.readLine();
            String count = reader.readLine();
            if (!MAGIC.equals(magic) || version == null || count == null) throw new IOException("Invalid Qatar world manifest");
            int municipalities = Integer.parseInt(count);
            if (municipalities < 8) throw new IOException("Incomplete municipality manifest");
            return new QatarWorldManifest(version, municipalities);
        }
    }
}
