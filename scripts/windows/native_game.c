/*
 * NAURU: THE COUNTRYSIDE — native Windows prototype runtime.
 *
 * This deliberately uses only Win32 and the OpenGL library supplied with Windows.
 * It is a real desktop game window: no URL is opened and no external browser is
 * launched.  Geometry is generated at run time so the executable stays portable.
 */
#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <windowsx.h>
#include <GL/gl.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define TERRAIN_STEP 92.0f
#define TERRAIN_HALF_X 2944.0f
#define TERRAIN_HALF_Z 3220.0f
#define KEY_COUNT 512

typedef struct { float x, y, z; } Vec3;

typedef struct {
    HWND window;
    HDC dc;
    HGLRC gl;
    int width;
    int height;
    int running;
    int keys[KEY_COUNT];
    int in_car;
    int map_mode;
    int first_person;
    int weather;
    float player_x, player_y, player_z, player_yaw, player_vertical;
    float car_x, car_y, car_z, car_yaw, car_speed;
    float elapsed;
    float time_of_day;
    float wheel_spin;
    LARGE_INTEGER clock_frequency;
    LARGE_INTEGER last_counter;
} Game;

static Game g;

static float clampf(float value, float low, float high) { return value < low ? low : (value > high ? high : value); }
static float lerpf(float a, float b, float t) { return a + (b - a) * t; }
static float smooth(float edge0, float edge1, float value) {
    float t = clampf((value - edge0) / (edge1 - edge0), 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}
static float radians(float degrees) { return degrees * (float)(M_PI / 180.0); }
static float degrees(float radians_value) { return radians_value * (float)(180.0 / M_PI); }
static float length2(float x, float z) { return sqrtf(x * x + z * z); }
static float hashf(int value) {
    unsigned int n = (unsigned int)value;
    n = (n << 13) ^ n;
    return 1.0f - (float)((n * (n * n * 15731u + 789221u) + 1376312589u) & 0x7fffffffu) / 1073741824.0f;
}
static float noise2(int x, int z) { return hashf(x * 92821 + z * 68917 + 241); }

/* An original, procedural approximation retaining the real island's ~5.7 by 6.1 km scale. */
static float shore_metric(float x, float z) {
    float angle = atan2f(z / 3050.0f, x / 2850.0f);
    float base = sqrtf((x * x) / (2850.0f * 2850.0f) + (z * z) / (3050.0f * 3050.0f));
    float contour = 1.0f + 0.045f * sinf(angle * 3.0f + 0.45f) + 0.028f * sinf(angle * 7.0f - 0.8f) + 0.018f * cosf(angle * 11.0f);
    return base / contour;
}

static float coast_distance(float x, float z) {
    /* Metres from the coast approximately; positive on Nauru, negative at sea. */
    return (1.0f - shore_metric(x, z)) * 2920.0f;
}

static float airport_blend(float x, float z) {
    float dx = x + 450.0f;
    float dz = z - 1870.0f;
    const float c = 0.9838437f;
    const float s = 0.1790296f;
    float lx = dx * c + dz * s;
    float lz = -dx * s + dz * c;
    float ox = fabsf(lx) - 1210.0f;
    float oz = fabsf(lz) - 118.0f;
    float outside = sqrtf((ox > 0.0f ? ox : 0.0f) * (ox > 0.0f ? ox : 0.0f) + (oz > 0.0f ? oz : 0.0f) * (oz > 0.0f ? oz : 0.0f));
    if (ox <= 0.0f && oz <= 0.0f) return 1.0f;
    return 1.0f - smooth(0.0f, 150.0f, outside);
}

static float terrain_height(float x, float z) {
    float coast = coast_distance(x, z);
    if (coast < 0.0f) return -1.0f;
    float plateau = smooth(180.0f, 790.0f, coast);
    int ix = (int)floorf(x / 105.0f);
    int iz = (int)floorf(z / 105.0f);
    float broad = noise2(ix, iz) * 3.8f + noise2(ix * 2 + 19, iz * 2 - 7) * 1.6f;
    float height = 1.4f + smooth(10.0f, 170.0f, coast) * 4.0f + plateau * (31.0f + broad);
    if (coast > 650.0f) height += fabsf(noise2(ix * 3 + 5, iz * 3 - 3)) * 4.5f - 1.3f;

    /* Buada's inland depression. */
    float lx = x + 650.0f;
    float lz = z - 420.0f;
    float lagoon = sqrtf((lx * lx) / (250.0f * 250.0f) + (lz * lz) / (135.0f * 135.0f));
    if (lagoon < 1.72f) height = lerpf(height, 12.1f + (lagoon < 1.0f ? 0.7f : 2.0f), 1.0f - smooth(0.88f, 1.72f, lagoon));

    height = lerpf(height, 4.2f, airport_blend(x, z));
    return height;
}

static void normal_at(float x, float z, Vec3 *out) {
    float sample = 5.0f;
    float nx = terrain_height(x - sample, z) - terrain_height(x + sample, z);
    float ny = sample * 2.0f;
    float nz = terrain_height(x, z - sample) - terrain_height(x, z + sample);
    float length = sqrtf(nx * nx + ny * ny + nz * nz);
    out->x = nx / length; out->y = ny / length; out->z = nz / length;
}

static void island_point(float angle, float inset, float *x, float *z) {
    float contour = 1.0f + 0.045f * sinf(angle * 3.0f + 0.45f) + 0.028f * sinf(angle * 7.0f - 0.8f) + 0.018f * cosf(angle * 11.0f);
    *x = cosf(angle) * 2850.0f * contour * inset;
    *z = sinf(angle) * 3050.0f * contour * inset;
}

static void set_box(float sx, float sy, float sz) {
    float x = sx * 0.5f, y = sy * 0.5f, z = sz * 0.5f;
    glBegin(GL_QUADS);
    glNormal3f(0, 0, 1); glVertex3f(-x,-y,z); glVertex3f(x,-y,z); glVertex3f(x,y,z); glVertex3f(-x,y,z);
    glNormal3f(0, 0,-1); glVertex3f(x,-y,-z); glVertex3f(-x,-y,-z); glVertex3f(-x,y,-z); glVertex3f(x,y,-z);
    glNormal3f(1, 0, 0); glVertex3f(x,-y,z); glVertex3f(x,-y,-z); glVertex3f(x,y,-z); glVertex3f(x,y,z);
    glNormal3f(-1,0, 0); glVertex3f(-x,-y,-z); glVertex3f(-x,-y,z); glVertex3f(-x,y,z); glVertex3f(-x,y,-z);
    glNormal3f(0, 1, 0); glVertex3f(-x,y,z); glVertex3f(x,y,z); glVertex3f(x,y,-z); glVertex3f(-x,y,-z);
    glNormal3f(0,-1, 0); glVertex3f(-x,-y,-z); glVertex3f(x,-y,-z); glVertex3f(x,-y,z); glVertex3f(-x,-y,z);
    glEnd();
}

static void cylinder(float radius, float length, int sides) {
    int i;
    glBegin(GL_QUAD_STRIP);
    for (i = 0; i <= sides; ++i) {
        float a = (float)i / (float)sides * 2.0f * (float)M_PI;
        float x = cosf(a) * radius, z = sinf(a) * radius;
        glNormal3f(x / radius, 0, z / radius);
        glVertex3f(x, -length * 0.5f, z); glVertex3f(x, length * 0.5f, z);
    }
    glEnd();
}

static void look_at(Vec3 eye, Vec3 centre, Vec3 up) {
    Vec3 forward = { centre.x - eye.x, centre.y - eye.y, centre.z - eye.z };
    float fl = sqrtf(forward.x*forward.x + forward.y*forward.y + forward.z*forward.z);
    forward.x /= fl; forward.y /= fl; forward.z /= fl;
    Vec3 side = { forward.y * up.z - forward.z * up.y, forward.z * up.x - forward.x * up.z, forward.x * up.y - forward.y * up.x };
    float sl = sqrtf(side.x*side.x + side.y*side.y + side.z*side.z);
    side.x /= sl; side.y /= sl; side.z /= sl;
    Vec3 corrected_up = { side.y * forward.z - side.z * forward.y, side.z * forward.x - side.x * forward.z, side.x * forward.y - side.y * forward.x };
    GLfloat matrix[16] = {
        side.x, corrected_up.x, -forward.x, 0,
        side.y, corrected_up.y, -forward.y, 0,
        side.z, corrected_up.z, -forward.z, 0,
        0, 0, 0, 1
    };
    glMultMatrixf(matrix);
    glTranslatef(-eye.x, -eye.y, -eye.z);
}

static void draw_ocean(void) {
    int x, z;
    const int cells = 38;
    const float step = 360.0f;
    glDisable(GL_LIGHTING);
    glColor4f(0.035f, 0.30f, 0.38f, 1.0f);
    glBegin(GL_QUADS);
    for (z = -cells; z < cells; ++z) {
        for (x = -cells; x < cells; ++x) {
            float x0 = x * step, x1 = (x + 1) * step;
            float z0 = z * step, z1 = (z + 1) * step;
            float y0 = 0.32f * sinf((x0 + g.elapsed * 27.0f) * 0.006f) + 0.21f * cosf((z0 - g.elapsed * 18.0f) * 0.008f);
            float y1 = 0.32f * sinf((x1 + g.elapsed * 27.0f) * 0.006f) + 0.21f * cosf((z1 - g.elapsed * 18.0f) * 0.008f);
            float y2 = 0.32f * sinf((x1 + g.elapsed * 27.0f) * 0.006f) + 0.21f * cosf((z1 - g.elapsed * 18.0f) * 0.008f);
            float y3 = 0.32f * sinf((x0 + g.elapsed * 27.0f) * 0.006f) + 0.21f * cosf((z0 - g.elapsed * 18.0f) * 0.008f);
            glVertex3f(x0, y0, z0); glVertex3f(x1, y1, z0); glVertex3f(x1, y2, z1); glVertex3f(x0, y3, z1);
        }
    }
    glEnd();
    glEnable(GL_LIGHTING);
}

static void terrain_color(float coast, float height) {
    if (coast < 130.0f) glColor3f(0.62f, 0.53f, 0.30f);
    else if (coast > 640.0f) glColor3f(0.37f, 0.34f, 0.26f);
    else glColor3f(0.18f + height * 0.001f, 0.37f + height * 0.0015f, 0.14f);
}

static void terrain_vertex(float x, float z) {
    Vec3 normal;
    float h = terrain_height(x, z);
    normal_at(x, z, &normal);
    terrain_color(coast_distance(x, z), h);
    glNormal3f(normal.x, normal.y, normal.z);
    glVertex3f(x, h, z);
}

static void draw_terrain(void) {
    int x, z;
    glBegin(GL_QUADS);
    for (z = (int)-TERRAIN_HALF_Z; z < (int)TERRAIN_HALF_Z; z += (int)TERRAIN_STEP) {
        for (x = (int)-TERRAIN_HALF_X; x < (int)TERRAIN_HALF_X; x += (int)TERRAIN_STEP) {
            float c0 = coast_distance((float)x, (float)z);
            float c1 = coast_distance((float)x + TERRAIN_STEP, (float)z);
            float c2 = coast_distance((float)x + TERRAIN_STEP, (float)z + TERRAIN_STEP);
            float c3 = coast_distance((float)x, (float)z + TERRAIN_STEP);
            if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
            terrain_vertex((float)x, (float)z);
            terrain_vertex((float)x + TERRAIN_STEP, (float)z);
            terrain_vertex((float)x + TERRAIN_STEP, (float)z + TERRAIN_STEP);
            terrain_vertex((float)x, (float)z + TERRAIN_STEP);
        }
    }
    glEnd();
}

static void road_quad(float ax, float az, float bx, float bz, float width) {
    float dx = bx - ax, dz = bz - az;
    float l = sqrtf(dx*dx + dz*dz);
    float nx = -dz / l * width * 0.5f, nz = dx / l * width * 0.5f;
    float ay = terrain_height(ax, az) + 0.28f;
    float by = terrain_height(bx, bz) + 0.28f;
    glBegin(GL_QUADS);
    glVertex3f(ax + nx, ay, az + nz); glVertex3f(ax - nx, ay, az - nz);
    glVertex3f(bx - nx, by, bz - nz); glVertex3f(bx + nx, by, bz + nz);
    glEnd();
}

static void draw_roads(void) {
    int i;
    glDisable(GL_LIGHTING);
    glColor3f(0.40f, 0.34f, 0.23f);
    for (i = 0; i < 210; ++i) {
        float ax, az, bx, bz;
        island_point((float)i / 210.0f * 2.0f * (float)M_PI, 0.902f, &ax, &az);
        island_point((float)(i + 1) / 210.0f * 2.0f * (float)M_PI, 0.902f, &bx, &bz);
        road_quad(ax, az, bx, bz, 14.5f);
    }
    glColor3f(0.16f, 0.18f, 0.18f);
    for (i = 0; i < 210; ++i) {
        float ax, az, bx, bz;
        island_point((float)i / 210.0f * 2.0f * (float)M_PI, 0.902f, &ax, &az);
        island_point((float)(i + 1) / 210.0f * 2.0f * (float)M_PI, 0.902f, &bx, &bz);
        road_quad(ax, az, bx, bz, 9.4f);
    }
    /* The airport runway, original geometry but real-scale footprint. */
    glPushMatrix();
    glTranslatef(-450.0f, 4.45f, 1870.0f);
    glRotatef(-10.26f, 0, 1, 0);
    glColor3f(0.17f, 0.19f, 0.19f); set_box(2250.0f, 0.18f, 46.0f);
    glColor3f(0.82f, 0.79f, 0.64f);
    for (i = -12; i <= 12; ++i) { glPushMatrix(); glTranslatef((float)i * 84.0f, 0.12f, 0); set_box(25.0f, 0.04f, 0.38f); glPopMatrix(); }
    glPopMatrix();
    glEnable(GL_LIGHTING);
}

static void draw_palm(float x, float z, float size) {
    int i;
    float y = terrain_height(x, z);
    if (coast_distance(x, z) < 80.0f) return;
    glPushMatrix();
    glTranslatef(x, y, z);
    glColor3f(0.29f, 0.18f, 0.08f);
    glPushMatrix(); glScalef(1.0f, size, 1.0f); cylinder(0.22f, 1.0f, 6); glPopMatrix();
    glTranslatef(0, size * 0.48f, 0);
    glColor3f(0.12f, 0.34f, 0.12f);
    for (i = 0; i < 7; ++i) {
        glPushMatrix();
        glRotatef((float)i * (360.0f / 7.0f), 0, 1, 0);
        glRotatef(-28.0f, 1, 0, 0);
        glBegin(GL_TRIANGLES);
        glVertex3f(0, 0, 0); glVertex3f(-0.35f, 0, size * 0.52f); glVertex3f(0.35f, 0, size * 0.52f);
        glEnd();
        glPopMatrix();
    }
    glPopMatrix();
}

static void draw_house(float x, float z, float yaw, float scale) {
    float y = terrain_height(x, z);
    glPushMatrix();
    glTranslatef(x, y + 2.4f * scale, z); glRotatef(yaw, 0, 1, 0);
    glColor3f(0.58f, 0.58f, 0.49f); set_box(8.0f * scale, 4.8f * scale, 7.0f * scale);
    glTranslatef(0, 2.7f * scale, 0); glColor3f(0.28f, 0.14f, 0.10f);
    glBegin(GL_TRIANGLES);
    glVertex3f(-4.5f*scale, 0, -4.2f*scale); glVertex3f(4.5f*scale, 0, -4.2f*scale); glVertex3f(0, 2.3f*scale, -4.2f*scale);
    glVertex3f(4.5f*scale, 0, 4.2f*scale); glVertex3f(-4.5f*scale, 0, 4.2f*scale); glVertex3f(0, 2.3f*scale, 4.2f*scale);
    glVertex3f(-4.5f*scale, 0, 4.2f*scale); glVertex3f(-4.5f*scale, 0, -4.2f*scale); glVertex3f(0, 2.3f*scale, 0);
    glVertex3f(4.5f*scale, 0, -4.2f*scale); glVertex3f(4.5f*scale, 0, 4.2f*scale); glVertex3f(0, 2.3f*scale, 0);
    glEnd();
    glPopMatrix();
}

static void draw_environment(void) {
    int i;
    /* Settlement belt: deterministic, cheap original modular houses and palms. */
    for (i = 0; i < 68; ++i) {
        float a = (float)i / 68.0f * 2.0f * (float)M_PI;
        float x, z, x2, z2;
        island_point(a, 0.79f + 0.055f * hashf(i * 11), &x, &z);
        draw_house(x, z, degrees(a) + 90.0f, 0.75f + 0.18f * (hashf(i * 7) + 1.0f));
        island_point(a + 0.018f, 0.72f + 0.06f * hashf(i * 17), &x2, &z2);
        draw_palm(x2, z2, 7.0f + 3.0f * (hashf(i * 13) + 1.0f));
    }
    for (i = 0; i < 92; ++i) {
        float a = (float)i * 2.399f;
        float distance = 0.26f + 0.48f * (hashf(i * 37) + 1.0f) * 0.5f;
        float x, z;
        island_point(a, distance, &x, &z);
        if (coast_distance(x, z) > 180.0f) draw_palm(x, z, 5.5f + (hashf(i * 5) + 1.0f) * 2.5f);
    }
    /* Topside phosphate/coral pinnacles. */
    glColor3f(0.43f, 0.40f, 0.30f);
    for (i = 0; i < 95; ++i) {
        float a = (float)i * 2.17f;
        float radius = 180.0f + 1150.0f * (hashf(i * 23) + 1.0f) * 0.5f;
        float x = cosf(a) * radius * 0.93f;
        float z = sinf(a) * radius;
        float h = 5.0f + 13.0f * (hashf(i * 31) + 1.0f) * 0.5f;
        if (coast_distance(x, z) < 500.0f) continue;
        glPushMatrix(); glTranslatef(x, terrain_height(x,z) + h * 0.5f, z); glScalef(2.5f, h, 2.2f); set_box(1,1,1); glPopMatrix();
    }
    /* Airport terminal and control tower. */
    glPushMatrix(); glTranslatef(-760, 7.2f, 1740); glColor3f(0.66f, 0.66f, 0.61f); set_box(92, 6, 22); glTranslatef(34, 8, 0); glColor3f(0.30f,0.39f,0.40f); set_box(8, 16, 8); glPopMatrix();
}

static void draw_wheel(float x, float z, float spin, float steer) {
    glPushMatrix();
    glTranslatef(x, 0.48f, z); glRotatef(steer, 0, 1, 0); glRotatef(spin, 1, 0, 0); glRotatef(90, 0, 0, 1);
    glColor3f(0.04f, 0.05f, 0.05f); cylinder(0.42f, 0.25f, 12);
    glColor3f(0.62f, 0.66f, 0.63f); cylinder(0.18f, 0.27f, 10);
    glPopMatrix();
}

static void draw_car(void) {
    glPushMatrix();
    glTranslatef(g.car_x, g.car_y + 0.14f, g.car_z); glRotatef(g.car_yaw, 0, 1, 0);
    glColor3f(0.87f, 0.58f, 0.15f); glPushMatrix(); glTranslatef(0, 0.73f, 0); set_box(1.85f, 0.52f, 4.05f); glPopMatrix();
    glColor3f(0.16f, 0.27f, 0.29f); glPushMatrix(); glTranslatef(0, 1.42f, -0.28f); set_box(1.56f, 0.72f, 1.82f); glPopMatrix();
    glColor3f(0.12f, 0.16f, 0.17f); glPushMatrix(); glTranslatef(0, 1.83f, -0.30f); set_box(1.66f, 0.12f, 2.02f); glPopMatrix();
    draw_wheel(-0.96f, 1.32f, g.wheel_spin, 0); draw_wheel(0.96f, 1.32f, g.wheel_spin, 0);
    draw_wheel(-0.96f, -1.32f, g.wheel_spin, 0); draw_wheel(0.96f, -1.32f, g.wheel_spin, 0);
    glPopMatrix();
}

static void draw_player(void) {
    float leg = sinf(g.elapsed * (g.in_car ? 0.0f : 7.0f)) * 25.0f;
    glPushMatrix(); glTranslatef(g.player_x, g.player_y, g.player_z); glRotatef(g.player_yaw, 0, 1, 0);
    glColor3f(0.11f, 0.57f, 0.53f); glPushMatrix(); glTranslatef(0, 1.35f, 0); set_box(0.56f, 0.92f, 0.35f); glPopMatrix();
    glColor3f(0.59f, 0.37f, 0.24f); glPushMatrix(); glTranslatef(0, 2.03f, 0); cylinder(0.22f, 0.38f, 10); glPopMatrix();
    glColor3f(0.11f, 0.18f, 0.21f);
    glPushMatrix(); glTranslatef(-0.17f, 0.56f, 0); glRotatef(leg, 1, 0, 0); set_box(0.22f, 0.85f, 0.22f); glPopMatrix();
    glPushMatrix(); glTranslatef(0.17f, 0.56f, 0); glRotatef(-leg, 1, 0, 0); set_box(0.22f, 0.85f, 0.22f); glPopMatrix();
    glPopMatrix();
}

static void draw_rain(void) {
    int i;
    if (g.weather < 2) return;
    glDisable(GL_LIGHTING);
    glColor3f(0.60f, 0.77f, 0.82f);
    glBegin(GL_LINES);
    for (i = 0; i < (g.weather == 3 ? 280 : 120); ++i) {
        float a = hashf(i * 17) * 1000.0f + g.elapsed * 11.0f;
        float x = (g.in_car ? g.car_x : g.player_x) + hashf(i * 29) * 55.0f;
        float z = (g.in_car ? g.car_z : g.player_z) + hashf(i * 41) * 55.0f;
        float y = 4.0f + fmodf(a + (float)i, 27.0f);
        glVertex3f(x, y, z); glVertex3f(x - 0.8f, y - 3.7f, z + 0.5f);
    }
    glEnd();
    glEnable(GL_LIGHTING);
}

static void resize_viewport(int width, int height) {
    if (height < 1) height = 1;
    g.width = width; g.height = height;
    glViewport(0, 0, width, height);
}

static void setup_gl(void) {
    GLfloat ambient[] = { 0.34f, 0.36f, 0.33f, 1.0f };
    GLfloat diffuse[] = { 0.90f, 0.86f, 0.73f, 1.0f };
    GLfloat position[] = { -0.25f, 0.88f, 0.32f, 0.0f };
    glEnable(GL_DEPTH_TEST); glEnable(GL_CULL_FACE); glCullFace(GL_BACK);
    glEnable(GL_COLOR_MATERIAL); glColorMaterial(GL_FRONT_AND_BACK, GL_AMBIENT_AND_DIFFUSE);
    glEnable(GL_LIGHTING); glEnable(GL_LIGHT0); glLightfv(GL_LIGHT0, GL_AMBIENT, ambient); glLightfv(GL_LIGHT0, GL_DIFFUSE, diffuse); glLightfv(GL_LIGHT0, GL_POSITION, position);
    glEnable(GL_FOG); glFogi(GL_FOG_MODE, GL_LINEAR); glFogf(GL_FOG_START, 1050.0f); glFogf(GL_FOG_END, 6100.0f);
    glShadeModel(GL_SMOOTH); glHint(GL_PERSPECTIVE_CORRECTION_HINT, GL_NICEST);
}

static void render(void) {
    float sun = 0.42f + 0.50f * sinf((g.time_of_day - 6.0f) / 24.0f * 2.0f * (float)M_PI);
    float cloud = g.weather == 1 ? 0.17f : (g.weather >= 2 ? 0.33f : 0.0f);
    GLfloat fog[] = { 0.08f + sun * 0.16f - cloud * 0.04f, 0.17f + sun * 0.27f - cloud * 0.04f, 0.20f + sun * 0.30f - cloud * 0.03f, 1.0f };
    GLfloat light[] = { 0.28f + sun * 0.68f, 0.25f + sun * 0.62f, 0.24f + sun * 0.52f, 1.0f };
    float target_x = g.in_car ? g.car_x : g.player_x;
    float target_y = g.in_car ? g.car_y + 1.25f : g.player_y + 1.42f;
    float target_z = g.in_car ? g.car_z : g.player_z;
    float yaw = radians(g.in_car ? g.car_yaw : g.player_yaw);
    float distance = g.in_car ? 12.5f : 7.4f;
    Vec3 eye, centre, up = {0,1,0};

    glClearColor(fog[0], fog[1], fog[2], 1); glFogfv(GL_FOG_COLOR, fog); glLightfv(GL_LIGHT0, GL_DIFFUSE, light);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glMatrixMode(GL_PROJECTION); glLoadIdentity();
    {
        float near_plane = 0.4f, far_plane = 11000.0f, fov = radians(g.map_mode ? 48.0f : 62.0f);
        float top = tanf(fov * 0.5f) * near_plane, right = top * (float)g.width / (float)g.height;
        glFrustum(-right, right, -top, top, near_plane, far_plane);
    }
    glMatrixMode(GL_MODELVIEW); glLoadIdentity();
    if (g.map_mode) {
        eye.x = 0; eye.y = 7000; eye.z = 150;
        centre.x = 0; centre.y = 0; centre.z = 0;
    } else if (g.first_person) {
        eye.x = target_x + sinf(yaw) * 0.4f; eye.y = target_y + 0.35f; eye.z = target_z + cosf(yaw) * 0.4f;
        centre.x = eye.x + sinf(yaw) * 30.0f; centre.y = eye.y + 0.4f; centre.z = eye.z + cosf(yaw) * 30.0f;
    } else {
        eye.x = target_x - sinf(yaw) * distance; eye.y = target_y + (g.in_car ? 5.3f : 3.6f); eye.z = target_z - cosf(yaw) * distance;
        centre.x = target_x + sinf(yaw) * 4.0f; centre.y = target_y + 0.55f; centre.z = target_z + cosf(yaw) * 4.0f;
    }
    look_at(eye, centre, up);
    draw_ocean(); draw_terrain(); draw_roads(); draw_environment(); draw_car(); if (!g.in_car) draw_player(); draw_rain();
    SwapBuffers(g.dc);
}

static int down(int key) { return key >= 0 && key < KEY_COUNT ? g.keys[key] : 0; }

static void reset_game(void) {
    g.player_x = -638; g.player_z = 1760; g.player_y = terrain_height(g.player_x, g.player_z); g.player_yaw = 82.0f; g.player_vertical = 0;
    g.car_x = -632; g.car_z = 1764; g.car_y = terrain_height(g.car_x, g.car_z); g.car_yaw = 82.0f; g.car_speed = 0; g.in_car = 0;
}

static void update_title(void) {
    wchar_t title[256];
    int minutes = (int)(g.time_of_day * 60.0f) % (24 * 60);
    const wchar_t *mode = g.in_car ? L"ISLAND RUNNER" : L"ON FOOT";
    const wchar_t *weather[] = { L"CLEAR", L"CLOUD", L"RAIN", L"STORM" };
    swprintf(title, 256, L"NAURU: THE COUNTRYSIDE  |  %ls  |  %03d km/h  |  %02d:%02d %ls  |  F1 controls", mode, (int)(fabsf(g.car_speed) * 3.6f), minutes / 60, minutes % 60, weather[g.weather]);
    SetWindowTextW(g.window, title);
}

static void update(float dt) {
    float yaw, forward_x, forward_z;
    int accelerating, reversing, left, right;
    if (dt > 0.05f) dt = 0.05f;
    g.elapsed += dt; g.time_of_day += dt * (24.0f / 760.0f); if (g.time_of_day >= 24.0f) g.time_of_day -= 24.0f;
    accelerating = down('W') || down(VK_UP); reversing = down('S') || down(VK_DOWN); left = down('A') || down(VK_LEFT); right = down('D') || down(VK_RIGHT);
    if (g.in_car) {
        float grip = coast_distance(g.car_x, g.car_z) > 120.0f ? 1.0f : 0.54f;
        if (accelerating) g.car_speed += 8.2f * grip * dt;
        if (reversing) g.car_speed -= 7.4f * grip * dt;
        if (!accelerating && !reversing) g.car_speed *= expf(-1.35f * dt);
        g.car_speed *= expf(-0.004f * fabsf(g.car_speed) * dt);
        g.car_speed = clampf(g.car_speed, -12.0f, coast_distance(g.car_x, g.car_z) > 80.0f ? 43.0f : 19.0f);
        if (left) g.car_yaw += (52.0f / (1.0f + fabsf(g.car_speed) * 0.055f)) * dt * (g.car_speed >= 0 ? 1.0f : -1.0f);
        if (right) g.car_yaw -= (52.0f / (1.0f + fabsf(g.car_speed) * 0.055f)) * dt * (g.car_speed >= 0 ? 1.0f : -1.0f);
        yaw = radians(g.car_yaw); forward_x = sinf(yaw); forward_z = cosf(yaw);
        g.car_x += forward_x * g.car_speed * dt; g.car_z += forward_z * g.car_speed * dt;
        g.car_y = terrain_height(g.car_x, g.car_z); g.wheel_spin += g.car_speed * dt / 0.43f * 57.2958f;
        if (coast_distance(g.car_x, g.car_z) < -80.0f) reset_game();
    } else {
        float speed = down(VK_SHIFT) ? 8.3f : 4.8f;
        if (left) g.player_yaw += 115.0f * dt;
        if (right) g.player_yaw -= 115.0f * dt;
        yaw = radians(g.player_yaw); forward_x = sinf(yaw); forward_z = cosf(yaw);
        if (accelerating) { g.player_x += forward_x * speed * dt; g.player_z += forward_z * speed * dt; }
        if (reversing) { g.player_x -= forward_x * speed * 0.65f * dt; g.player_z -= forward_z * speed * 0.65f * dt; }
        g.player_vertical -= 16.5f * dt; g.player_y += g.player_vertical * dt;
        { float ground = terrain_height(g.player_x, g.player_z); if (g.player_y <= ground) { g.player_y = ground; g.player_vertical = 0; } }
        if (coast_distance(g.player_x, g.player_z) < -140.0f) reset_game();
    }
    update_title();
}

static void action_key(WPARAM key) {
    if (key == 'E') {
        if (g.in_car) {
            if (fabsf(g.car_speed) < 1.5f) {
                float yaw = radians(g.car_yaw + 90.0f);
                g.in_car = 0; g.player_x = g.car_x + sinf(yaw) * 2.4f; g.player_z = g.car_z + cosf(yaw) * 2.4f; g.player_y = terrain_height(g.player_x, g.player_z); g.player_yaw = g.car_yaw;
            }
        } else if (length2(g.player_x - g.car_x, g.player_z - g.car_z) < 7.5f) g.in_car = 1;
    }
    if (key == 'R') reset_game();
    if (key == 'M') g.map_mode = !g.map_mode;
    if (key == 'V') g.first_person = !g.first_person;
    if (key == 'T') g.weather = (g.weather + 1) % 4;
    if (key == VK_SPACE && !g.in_car && fabsf(g.player_vertical) < 0.01f) g.player_vertical = 6.3f;
    if (key == VK_F1) MessageBoxW(g.window,
        L"NAURU: THE COUNTRYSIDE — Native Standalone Edition\n\n"
        L"W / S  walk or accelerate / brake\nA / D  turn\nSHIFT  sprint\nSPACE  jump\nE  enter or exit the Island Runner\nV  first-person camera\nM  island overview\nT  cycle weather\nR  reset to airport\nESC  quit\n\n"
        L"This offline desktop build uses the Windows OpenGL runtime and does not launch a browser.",
        L"Controls", MB_OK | MB_ICONINFORMATION);
}

static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    switch (message) {
        case WM_SIZE: if (g.gl) resize_viewport(LOWORD(lparam), HIWORD(lparam)); return 0;
        case WM_CLOSE: DestroyWindow(window); return 0;
        case WM_DESTROY: g.running = 0; PostQuitMessage(0); return 0;
        case WM_KEYDOWN:
            if (wparam < KEY_COUNT) g.keys[wparam] = 1;
            if (!(lparam & (1 << 30))) {
                if (wparam == VK_ESCAPE) DestroyWindow(window); else action_key(wparam);
            }
            return 0;
        case WM_KEYUP: if (wparam < KEY_COUNT) g.keys[wparam] = 0; return 0;
    }
    return DefWindowProcW(window, message, wparam, lparam);
}

static int create_window_and_gl(HINSTANCE instance) {
    WNDCLASSW cls;
    PIXELFORMATDESCRIPTOR pfd;
    int pixel_format;
    memset(&cls, 0, sizeof(cls));
    cls.style = CS_OWNDC; cls.lpfnWndProc = window_proc; cls.hInstance = instance; cls.hCursor = LoadCursor(NULL, IDC_ARROW); cls.lpszClassName = L"NauruCountrysideNative";
    if (!RegisterClassW(&cls)) return 0;
    g.window = CreateWindowExW(0, cls.lpszClassName, L"NAURU: THE COUNTRYSIDE", WS_OVERLAPPEDWINDOW | WS_VISIBLE,
        CW_USEDEFAULT, CW_USEDEFAULT, 1280, 800, NULL, NULL, instance, NULL);
    if (!g.window) return 0;
    g.dc = GetDC(g.window);
    memset(&pfd, 0, sizeof(pfd)); pfd.nSize = sizeof(pfd); pfd.nVersion = 1; pfd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER; pfd.iPixelType = PFD_TYPE_RGBA; pfd.cColorBits = 32; pfd.cDepthBits = 24; pfd.iLayerType = PFD_MAIN_PLANE;
    pixel_format = ChoosePixelFormat(g.dc, &pfd);
    if (!pixel_format || !SetPixelFormat(g.dc, pixel_format, &pfd)) return 0;
    g.gl = wglCreateContext(g.dc);
    if (!g.gl || !wglMakeCurrent(g.dc, g.gl)) return 0;
    setup_gl();
    { RECT rect; GetClientRect(g.window, &rect); resize_viewport(rect.right - rect.left, rect.bottom - rect.top); }
    return 1;
}

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command_line, int show) {
    MSG message;
    (void)previous; (void)command_line; (void)show;
    memset(&g, 0, sizeof(g)); g.running = 1; g.time_of_day = 8.4f;
    if (!create_window_and_gl(instance)) { MessageBoxW(NULL, L"The native OpenGL game window could not be created.", L"NAURU: THE COUNTRYSIDE", MB_ICONERROR); return 1; }
    reset_game(); QueryPerformanceFrequency(&g.clock_frequency); QueryPerformanceCounter(&g.last_counter);
    while (g.running) {
        LARGE_INTEGER now;
        while (PeekMessageW(&message, NULL, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
        QueryPerformanceCounter(&now);
        update((float)(now.QuadPart - g.last_counter.QuadPart) / (float)g.clock_frequency.QuadPart);
        g.last_counter = now;
        render();
    }
    if (g.gl) { wglMakeCurrent(NULL, NULL); wglDeleteContext(g.gl); }
    if (g.dc && g.window) ReleaseDC(g.window, g.dc);
    return 0;
}
