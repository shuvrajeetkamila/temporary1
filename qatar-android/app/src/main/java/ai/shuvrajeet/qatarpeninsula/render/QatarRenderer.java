package ai.shuvrajeet.qatarpeninsula.render;

import android.content.res.AssetManager;
import android.opengl.GLES30;
import android.opengl.GLSurfaceView;
import android.opengl.Matrix;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

import ai.shuvrajeet.qatarpeninsula.physics.PhysicsMath;
import ai.shuvrajeet.qatarpeninsula.physics.VehicleForceModels;
import ai.shuvrajeet.qatarpeninsula.world.QatarWorldManifest;

/** Minimal fully-offline GLES3 world renderer and fixed-step simulation spike. */
public final class QatarRenderer implements GLSurfaceView.Renderer {
    private static final float FIXED_DT = 1f / 60f;
    private static final int FOOT = 0, CAR = 1, BOAT = 2, HELI = 3, PLANE = 4;
    private final AssetManager assets;
    private Mesh ocean, peninsula, runway, cube;
    private int program, mvpUniform, colorUniform;
    private final float[] projection = new float[16], view = new float[16], model = new float[16], viewModel = new float[16], mvp = new float[16];
    private long previousNanos;
    private float accumulator, simulationTime, heading = 0.6f, playerX = -8f, playerZ = 15f, speed;
    private float touchX, touchY;
    private boolean touching;
    private int mode = FOOT;
    private String manifestStatus = "loading";

    public QatarRenderer(AssetManager assets) { this.assets = assets; }

    public void setTouch(float x, float y, boolean active) { touchX = x; touchY = y; touching = active; }
    public void cycleVehicle() { mode = (mode + 1) % 5; speed = 0f; }

    @Override public void onSurfaceCreated(javax.microedition.khronos.egl.EGLConfig config) {
        GLES30.glEnable(GLES30.GL_DEPTH_TEST);
        GLES30.glEnable(GLES30.GL_CULL_FACE);
        GLES30.glClearColor(0.33f, 0.58f, 0.72f, 1f);
        program = createProgram(VERTEX, FRAGMENT);
        mvpUniform = GLES30.glGetUniformLocation(program, "uMvp");
        colorUniform = GLES30.glGetUniformLocation(program, "uColor");
        ocean = Mesh.plane(160f, 0f);
        runway = Mesh.plane(3f, 0.015f);
        cube = Mesh.cube();
        peninsula = Mesh.peninsula();
        try {
            QatarWorldManifest manifest = QatarWorldManifest.load(assets);
            manifestStatus = "QTRWORLD " + manifest.version + " / " + manifest.municipalityCount + " municipalities";
        } catch (IOException | NumberFormatException failure) {
            manifestStatus = "world manifest failure";
        }
        previousNanos = System.nanoTime();
    }

    @Override public void onSurfaceChanged(javax.microedition.khronos.egl.EGLConfig config, int width, int height) {
        GLES30.glViewport(0, 0, width, height);
        Matrix.perspectiveM(projection, 0, 62f, width / (float) Math.max(1, height), 0.15f, 600f);
    }

    @Override public void onDrawFrame(javax.microedition.khronos.opengles.GL10 gl) {
        long now = System.nanoTime();
        float frame = Math.min(0.1f, (now - previousNanos) / 1_000_000_000f);
        previousNanos = now;
        accumulator += frame;
        int steps = 0;
        while (accumulator >= FIXED_DT && steps++ < 4) {
            simulate(FIXED_DT);
            accumulator -= FIXED_DT;
        }
        draw();
    }

    private void simulate(float dt) {
        simulationTime += dt;
        float throttle = touching ? (touchY < 0.55f ? 1f : -0.5f) : 0f;
        float steer = touching ? (touchX - 0.5f) * 2f : 0f;
        if (mode == FOOT) {
            speed = PhysicsMath.clamp(speed + throttle * 10f * dt, -2.8f, 5.2f);
            speed *= 0.94f;
        } else if (mode == CAR) {
            speed = PhysicsMath.clamp(speed + throttle * 8.5f * dt, -4f, 32f);
            speed *= 0.993f;
        } else if (mode == BOAT) {
            float waterDamping = 0.22f;
            speed += throttle * 4.2f * dt - speed * Math.abs(speed) * waterDamping * dt;
        } else if (mode == HELI) {
            float rotorLift = VehicleForceModels.helicopterThrust(0.006f, 1.16f, 12f, 180f, Math.max(0f, throttle));
            speed += (rotorLift / 1280f - 0.4f) * dt;
        } else {
            float cl = VehicleForceModels.stalledLiftCoefficient(steer * 0.15f, 0f);
            float lift = VehicleForceModels.lift(1.16f, Math.max(0f, speed), 16f, cl);
            speed += throttle * 5f * dt + lift / 930f * 0.03f * dt - speed * Math.abs(speed) * 0.006f * dt;
        }
        heading += steer * (mode == CAR ? 1.5f : 0.75f) * dt;
        playerX += (float) Math.sin(heading) * speed * dt;
        playerZ += (float) Math.cos(heading) * speed * dt;
    }

    private void draw() {
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT | GLES30.GL_DEPTH_BUFFER_BIT);
        float cameraDistance = mode >= HELI ? 37f : 25f;
        float cameraHeight = mode >= HELI ? 22f : 13f;
        Matrix.setLookAtM(view, 0,
                playerX - (float) Math.sin(heading) * cameraDistance, cameraHeight, playerZ - (float) Math.cos(heading) * cameraDistance,
                playerX, 0f, playerZ, 0f, 1f, 0f);
        GLES30.glUseProgram(program);
        drawMesh(ocean, 0f, -1f, 0f, 1f, 0.2f, 0.52f, 0.65f);
        drawMesh(peninsula, 0f, 0f, 0f, 0.97f, 0.55f, 0.45f, 0.23f);
        drawMesh(runway, -4f, 0.08f, 16f, 0.18f, 0.18f, 0.19f, 0.20f);
        drawMesh(cube, -8f, 1.5f, 12f, 1.6f, 0.78f, 0.62f, 0.28f);
        drawMesh(cube, 7f, 0.8f, -7f, 1.1f, 0.75f, 0.82f, 0.8f);
        drawMesh(cube, -14f, 2.5f, 5f, 1.4f, 0.18f, 0.60f, 0.46f);
        drawMesh(cube, 2f, 1.4f, 17f, 1.2f, 0.90f, 0.72f, 0.25f);
        drawMesh(cube, playerX, mode == HELI ? 8f : 1.2f, playerZ, 0.8f, 0.10f, 0.85f, 0.72f);
    }

    private void drawMesh(Mesh mesh, float x, float y, float z, float scale, float r, float g, float b) {
        Matrix.setIdentityM(model, 0);
        Matrix.translateM(model, 0, x, y, z);
        Matrix.scaleM(model, 0, scale, scale, scale);
        Matrix.multiplyMM(viewModel, 0, view, 0, model, 0);
        Matrix.multiplyMM(mvp, 0, projection, 0, viewModel, 0);
        GLES30.glUniformMatrix4fv(mvpUniform, 1, false, mvp, 0);
        GLES30.glUniform4f(colorUniform, r, g, b, 1f);
        mesh.draw();
    }

    private static int createProgram(String vertex, String fragment) {
        int v = compile(GLES30.GL_VERTEX_SHADER, vertex);
        int f = compile(GLES30.GL_FRAGMENT_SHADER, fragment);
        int p = GLES30.glCreateProgram();
        GLES30.glAttachShader(p, v); GLES30.glAttachShader(p, f); GLES30.glLinkProgram(p);
        int[] linked = new int[1]; GLES30.glGetProgramiv(p, GLES30.GL_LINK_STATUS, linked, 0);
        if (linked[0] == 0) throw new IllegalStateException("GLES program link: " + GLES30.glGetProgramInfoLog(p));
        return p;
    }
    private static int compile(int type, String source) {
        int shader = GLES30.glCreateShader(type);
        GLES30.glShaderSource(shader, source); GLES30.glCompileShader(shader);
        int[] compiled = new int[1]; GLES30.glGetShaderiv(shader, GLES30.GL_COMPILE_STATUS, compiled, 0);
        if (compiled[0] == 0) throw new IllegalStateException("GLES shader: " + GLES30.glGetShaderInfoLog(shader));
        return shader;
    }

    private static final class Mesh {
        private final FloatBuffer vertices;
        private final int count;
        private Mesh(float[] data) {
            count = data.length / 3;
            vertices = ByteBuffer.allocateDirect(data.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
            vertices.put(data).position(0);
        }
        void draw() {
            GLES30.glEnableVertexAttribArray(0);
            GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, 12, vertices);
            GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, count);
            GLES30.glDisableVertexAttribArray(0);
        }
        static Mesh plane(float size, float y) { return new Mesh(new float[]{-size,y,-size, size,y,-size, size,y,size, -size,y,-size, size,y,size, -size,y,size}); }
        static Mesh cube() {
            return new Mesh(new float[]{
                -1,-1,1,1,-1,1,1,1,1,-1,-1,1,1,1,1,-1,1,1, 1,-1,-1,-1,-1,-1,-1,1,-1,1,-1,-1,-1,1,-1,1,1,-1,
                -1,-1,-1,-1,-1,1,-1,1,1,-1,-1,-1,-1,1,1,-1,1,-1, 1,-1,1,1,-1,-1,1,1,-1,1,-1,1,1,1,-1,1,1,1,
                -1,1,1,1,1,1,1,1,-1,-1,1,1,1,1,-1,-1,1,-1, -1,-1,-1,1,-1,-1,1,-1,1,-1,-1,-1,1,-1,1,-1,-1,1});
        }
        static Mesh peninsula() {
            float[] points = {0,0, 8,4, 11,12, 9,24, 6,38, 2,50, -4,56, -10,51, -12,38, -9,28, -11,18, -8,7, -4,-3, 2,-7, 8,-3};
            float[] tri = new float[(points.length / 2) * 9]; int k = 0, n = points.length / 2;
            for (int i = 0; i < n; i++) { int j = (i + 1) % n; tri[k++]=0;tri[k++]=0;tri[k++]=22; tri[k++]=points[i*2];tri[k++]=0;tri[k++]=points[i*2+1]+12; tri[k++]=points[j*2];tri[k++]=0;tri[k++]=points[j*2+1]+12; }
            return new Mesh(tri);
        }
    }

    private static final String VERTEX = "#version 300 es\nlayout(location=0) in vec3 aPosition; uniform mat4 uMvp; void main(){gl_Position=uMvp*vec4(aPosition,1.0);}";
    private static final String FRAGMENT = "#version 300 es\nprecision mediump float; uniform vec4 uColor; out vec4 color; void main(){color=uColor;}";
}
