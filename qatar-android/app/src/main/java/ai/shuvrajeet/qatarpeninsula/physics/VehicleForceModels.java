package ai.shuvrajeet.qatarpeninsula.physics;

/** Pure SI-unit force functions kept independent from Android/GLES for deterministic testing. */
public final class VehicleForceModels {
    private VehicleForceModels() {}

    public static float boatBuoyancy(float waterDensity, float displacedM3, float gravity, float submersion) {
        return waterDensity * displacedM3 * gravity * PhysicsMath.clamp(submersion, 0f, 1f);
    }

    public static float helicopterThrust(float coefficient, float density, float rotorArea, float tipSpeed, float collective) {
        return coefficient * density * rotorArea * tipSpeed * tipSpeed * PhysicsMath.clamp(collective, 0f, 1f);
    }

    public static float lift(float density, float airspeed, float wingArea, float coefficientLift) {
        return PhysicsMath.dynamicPressure(density, airspeed) * wingArea * coefficientLift;
    }

    public static float inducedDrag(float density, float airspeed, float wingArea, float coefficientLift, float zeroLiftDrag, float inducedFactor) {
        return PhysicsMath.dynamicPressure(density, airspeed) * wingArea * (zeroLiftDrag + inducedFactor * coefficientLift * coefficientLift);
    }

    public static float stalledLiftCoefficient(float alphaRadians, float flapLift) {
        float linear = 0.18f + 4.4f * alphaRadians + flapLift;
        float magnitude = Math.abs(alphaRadians);
        if (magnitude > 0.30f) linear *= Math.max(0.18f, 1f - (magnitude - 0.30f) * 2.4f);
        return PhysicsMath.clamp(linear, -0.55f, 1.45f);
    }
}
