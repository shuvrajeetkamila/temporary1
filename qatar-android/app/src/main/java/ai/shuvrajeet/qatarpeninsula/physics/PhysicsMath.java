package ai.shuvrajeet.qatarpeninsula.physics;

public final class PhysicsMath {
    private PhysicsMath() {}
    public static float clamp(float value, float min, float max) { return Math.max(min, Math.min(max, value)); }
    public static float smooth(float min, float max, float value) {
        float t = clamp((value - min) / (max - min), 0f, 1f);
        return t * t * (3f - 2f * t);
    }
    public static float jumpVelocity(float gravity, float desiredHeight) { return (float) Math.sqrt(2f * gravity * desiredHeight); }
    public static float dynamicPressure(float density, float airspeed) { return 0.5f * density * airspeed * airspeed; }
}
