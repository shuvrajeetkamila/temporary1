package ai.shuvrajeet.qataronegb;

import android.content.res.AssetManager;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Fails closed at startup if the packaged regional index is missing or malformed. */
final class OfflineWorldIndex {
    private final AssetManager assets;
    OfflineWorldIndex(AssetManager assets) { this.assets = assets; }

    String startupStatus() {
        try (InputStream stream = assets.open("qatar_world_index.json")) {
            byte[] raw = new byte[stream.available()];
            int read = stream.read(raw);
            if (read != raw.length) throw new IllegalStateException("Index read incomplete");
            JSONObject index = new JSONObject(new String(raw, StandardCharsets.UTF_8));
            if (!"QTRWORLD2".equals(index.getString("format"))) throw new IllegalStateException("World format rejected");
            JSONArray packs = index.getJSONArray("regionPacks");
            if (packs.length() != 8) throw new IllegalStateException("Expected eight municipal-region packs");
            long bytes = 0L;
            for (int i = 0; i < packs.length(); i++) {
                JSONObject pack = packs.getJSONObject(i);
                String file = pack.getString("file");
                if (!file.startsWith("world/") || !file.endsWith(".qtrpack")) throw new IllegalStateException("Unsafe pack path");
                bytes += pack.getLong("bytes");
            }
            return "QATAR: THE PENINSULA\nOffline package ready: " + packs.length() + " regional bundles / " + (bytes / 1_073_741_824L) + " GiB\nData-authority gate: pending";
        } catch (Exception error) {
            return "Offline world startup check failed: " + error.getMessage();
        }
    }
}
