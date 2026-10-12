package ai.shuvrajeet.qatarpeninsula.physics;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class VehicleForceModelsTest {
    @Test public void jumpVelocityMatchesConfiguredHeight() {
        float velocity = PhysicsMath.jumpVelocity(9.81f, 1.15f);
        assertEquals(1.15f, velocity * velocity / (2f * 9.81f), 0.0001f);
    }

    @Test public void boatBuoyancyIsBoundedBySubmersion() {
        float full = VehicleForceModels.boatBuoyancy(1025f, 0.62f, 9.81f, 1f);
        assertEquals(0f, VehicleForceModels.boatBuoyancy(1025f, 0.62f, 9.81f, -1f), 0.0001f);
        assertEquals(full, VehicleForceModels.boatBuoyancy(1025f, 0.62f, 9.81f, 4f), 0.0001f);
    }

    @Test public void wingLosesLiftPastStallPeak() {
        float normal = VehicleForceModels.stalledLiftCoefficient(0.22f, 0f);
        float stalled = VehicleForceModels.stalledLiftCoefficient(0.70f, 0f);
        assertTrue(normal > stalled);
    }

    @Test public void inducedDragGrowsWithLift() {
        float low = VehicleForceModels.inducedDrag(1.18f, 30f, 16f, 0.2f, 0.034f, 0.075f);
        float high = VehicleForceModels.inducedDrag(1.18f, 30f, 16f, 1.0f, 0.034f, 0.075f);
        assertTrue(high > low);
    }
}
