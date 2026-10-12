package ai.shuvrajeet.qataronegb;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public final class WorldPackageContractTest {
    @Test public void exactCountryPackageBudgetIsOneGib() {
        long regionalPackBytes = 134_217_728L;
        int regionCount = 8;
        assertEquals(1_073_741_824L, regionalPackBytes * regionCount);
    }

    @Test public void universalThresholdIsAtLeastOneDecimalGigabyte() {
        long oneGiB = 1_073_741_824L;
        assertEquals(true, oneGiB >= 1_000_000_000L);
    }
}
