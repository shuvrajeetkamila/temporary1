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
    float x, y, z;
    float vx, vy, vz;
    float yaw, pitch, roll;
    float throttle, rotor_rpm, collective, spin;
} VehicleBody;

typedef struct {
    HWND window;
    HDC dc;
    HGLRC gl;
    int width;
    int height;
    int running;
    int keys[KEY_COUNT];
    int active_vehicle; /* 0 on foot, 1 Island Runner, 2 boat, 3 helicopter, 4 aeroplane */
    int in_car;
    int map_mode;
    int first_person;
    int weather;
    float player_x, player_y, player_z, player_yaw, player_vertical;
    float car_x, car_y, car_z, car_yaw, car_speed;
    VehicleBody boat;
    VehicleBody heli;
    VehicleBody plane;
    float elapsed;
    float time_of_day;
    float wheel_spin;
    LARGE_INTEGER clock_frequency;
    LARGE_INTEGER last_counter;
} Game;

typedef struct { float mass, max_thrust, rotor_spool, yaw_torque, cyclic_accel, drag, ground_effect_height; } HelicopterConfig;
typedef struct { float mass, wing_area, max_thrust, air_density, induced_drag, stall_speed, gear_height; } PlaneConfig;
typedef struct { float mass, buoyancy_spring, buoyancy_damping, thrust, water_drag; } BoatConfig;

/* Named, bounded SI force-model constants: forces and accelerations are never teleports. */
static const HelicopterConfig HELI_CONFIG = { 1280.0f, 17700.0f, 1.25f, 42.0f, 6.2f, 0.045f, 9.0f };
static const PlaneConfig PLANE_CONFIG = { 930.0f, 16.2f, 2800.0f, 1.18f, 0.075f, 16.0f, 1.05f };
static const BoatConfig BOAT_CONFIG = { 620.0f, 17360.0f, 6200.0f, 2850.0f, 105.0f };

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

/* One shared analytic wave field drives both ocean rendering and boat buoyancy. */
static float water_height(float x, float z) {
    return 0.32f * sinf((x + g.elapsed * 27.0f) * 0.006f) + 0.21f * cosf((z - g.elapsed * 18.0f) * 0.008f);
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
            float y0 = water_height(x0, z0);
            float y1 = water_height(x1, z0);
            float y2 = water_height(x1, z1);
            float y3 = water_height(x0, z1);
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

static void draw_boat(void) {
    VehicleBody *boat = &g.boat;
    glPushMatrix();
    glTranslatef(boat->x, boat->y, boat->z); glRotatef(boat->yaw, 0, 1, 0); glRotatef(boat->pitch, 1, 0, 0); glRotatef(boat->roll, 0, 0, 1);
    /* Original island workboat: shallow hull, center console, outboard and railing. */
    glColor3f(0.82f, 0.84f, 0.80f); glPushMatrix(); glTranslatef(0, 0.22f, 0); set_box(2.25f, 0.62f, 5.25f); glPopMatrix();
    glColor3f(0.10f, 0.38f, 0.46f); glPushMatrix(); glTranslatef(0, 0.60f, -0.25f); set_box(1.2f, 0.68f, 1.20f); glPopMatrix();
    glColor3f(0.20f, 0.24f, 0.23f); glPushMatrix(); glTranslatef(0, 0.45f, -2.80f); set_box(0.45f, 0.85f, 0.28f); glPopMatrix();
    glColor3f(0.92f, 0.92f, 0.88f); glPushMatrix(); glTranslatef(0, 1.18f, -0.18f); glRotatef(90, 1, 0, 0); cylinder(0.055f, 2.25f, 6); glPopMatrix();
    glPopMatrix();
}

static void draw_helicopter(void) {
    VehicleBody *heli = &g.heli;
    glPushMatrix();
    glTranslatef(heli->x, heli->y, heli->z); glRotatef(heli->yaw, 0, 1, 0); glRotatef(heli->pitch, 1, 0, 0); glRotatef(heli->roll, 0, 0, 1);
    /* Original light utility helicopter: compact cabin, boom, skids and independent rotors. */
    glColor3f(0.18f, 0.48f, 0.43f); glPushMatrix(); glTranslatef(0, 0.2f, 0.15f); set_box(2.15f, 1.30f, 3.10f); glPopMatrix();
    glColor3f(0.13f, 0.24f, 0.28f); glPushMatrix(); glTranslatef(0, 0.35f, 1.52f); set_box(1.78f, 0.86f, 0.92f); glPopMatrix();
    glColor3f(0.18f, 0.48f, 0.43f); glPushMatrix(); glTranslatef(0, 0.22f, -3.05f); set_box(0.38f, 0.38f, 3.2f); glPopMatrix();
    glColor3f(0.14f, 0.17f, 0.18f);
    glPushMatrix(); glTranslatef(-0.82f, -0.85f, 0); glScalef(1, 0.15f, 1); cylinder(0.14f, 4.5f, 8); glPopMatrix();
    glPushMatrix(); glTranslatef(0.82f, -0.85f, 0); glScalef(1, 0.15f, 1); cylinder(0.14f, 4.5f, 8); glPopMatrix();
    glColor3f(0.09f, 0.10f, 0.10f); glPushMatrix(); glTranslatef(0, 1.08f, 0); glRotatef(heli->spin, 0,1,0); set_box(0.10f, 0.04f, 9.2f); glRotatef(90,0,1,0); set_box(0.10f,0.04f,9.2f); glPopMatrix();
    glPushMatrix(); glTranslatef(0,0.38f,-4.75f); glRotatef(heli->spin * 1.8f, 0,0,1); set_box(0.04f, 1.6f, 0.10f); glRotatef(90,0,0,1); set_box(0.04f,1.6f,0.10f); glPopMatrix();
    glPopMatrix();
}

static void draw_plane(void) {
    VehicleBody *plane = &g.plane;
    glPushMatrix();
    glTranslatef(plane->x, plane->y, plane->z); glRotatef(plane->yaw, 0, 1, 0); glRotatef(plane->pitch, 1, 0, 0); glRotatef(plane->roll, 0, 0, 1);
    /* Original high-wing STOL propeller aircraft. */
    glColor3f(0.88f, 0.78f, 0.34f); glPushMatrix(); glTranslatef(0, 0, 0); set_box(1.35f, 1.15f, 7.30f); glPopMatrix();
    glColor3f(0.18f, 0.34f, 0.37f); glPushMatrix(); glTranslatef(0, 0.36f, 1.02f); set_box(1.12f, 0.52f, 1.58f); glPopMatrix();
    glColor3f(0.83f, 0.74f, 0.31f); glPushMatrix(); glTranslatef(0, 0.13f, 0.25f); set_box(11.2f, 0.16f, 1.72f); glPopMatrix();
    glPushMatrix(); glTranslatef(0, 0.44f, -3.15f); set_box(3.45f, 0.12f, 1.10f); glPopMatrix();
    glColor3f(0.12f, 0.14f, 0.14f); glPushMatrix(); glTranslatef(0, 0, 3.75f); glRotatef(plane->spin, 0,0,1); set_box(0.05f, 3.1f, 0.12f); glPopMatrix();
    glColor3f(0.08f, 0.09f, 0.09f);
    glPushMatrix(); glTranslatef(-0.82f, -0.85f, 0.9f); glRotatef(90,0,0,1); cylinder(0.30f, 0.18f, 10); glPopMatrix();
    glPushMatrix(); glTranslatef(0.82f, -0.85f, 0.9f); glRotatef(90,0,0,1); cylinder(0.30f, 0.18f, 10); glPopMatrix();
    glPushMatrix(); glTranslatef(0, -0.75f, -2.4f); glRotatef(90,0,0,1); cylinder(0.22f, 0.16f, 10); glPopMatrix();
    glPopMatrix();
}

static void draw_player(void) {
    float leg = sinf(g.elapsed * (g.active_vehicle == 0 ? 7.0f : 0.0f)) * 25.0f;
    glPushMatrix(); glTranslatef(g.player_x, g.player_y, g.player_z); glRotatef(g.player_yaw, 0, 1, 0);
    glColor3f(0.11f, 0.57f, 0.53f); glPushMatrix(); glTranslatef(0, 1.35f, 0); set_box(0.56f, 0.92f, 0.35f); glPopMatrix();
    glColor3f(0.59f, 0.37f, 0.24f); glPushMatrix(); glTranslatef(0, 2.03f, 0); cylinder(0.22f, 0.38f, 10); glPopMatrix();
    glColor3f(0.11f, 0.18f, 0.21f);
    glPushMatrix(); glTranslatef(-0.17f, 0.56f, 0); glRotatef(leg, 1, 0, 0); set_box(0.22f, 0.85f, 0.22f); glPopMatrix();
    glPushMatrix(); glTranslatef(0.17f, 0.56f, 0); glRotatef(-leg, 1, 0, 0); set_box(0.22f, 0.85f, 0.22f); glPopMatrix();
    glPopMatrix();
}

static void active_focus(float *x, float *y, float *z, float *yaw, float *speed) {
    *x = g.player_x; *y = g.player_y + 1.42f; *z = g.player_z; *yaw = g.player_yaw; *speed = 0;
    if (g.active_vehicle == 1) { *x = g.car_x; *y = g.car_y + 1.25f; *z = g.car_z; *yaw = g.car_yaw; *speed = g.car_speed; }
    if (g.active_vehicle == 2) { *x = g.boat.x; *y = g.boat.y + 1.1f; *z = g.boat.z; *yaw = g.boat.yaw; *speed = sqrtf(g.boat.vx*g.boat.vx + g.boat.vz*g.boat.vz); }
    if (g.active_vehicle == 3) { *x = g.heli.x; *y = g.heli.y + 1.1f; *z = g.heli.z; *yaw = g.heli.yaw; *speed = sqrtf(g.heli.vx*g.heli.vx + g.heli.vz*g.heli.vz); }
    if (g.active_vehicle == 4) { *x = g.plane.x; *y = g.plane.y + 1.0f; *z = g.plane.z; *yaw = g.plane.yaw; *speed = sqrtf(g.plane.vx*g.plane.vx + g.plane.vz*g.plane.vz); }
}

static void draw_rain(void) {
    int i; float focus_x, focus_y, focus_z, yaw, speed;
    if (g.weather < 2) return;
    active_focus(&focus_x, &focus_y, &focus_z, &yaw, &speed);
    glDisable(GL_LIGHTING);
    glColor3f(0.60f, 0.77f, 0.82f);
    glBegin(GL_LINES);
    for (i = 0; i < (g.weather == 3 ? 280 : 120); ++i) {
        float a = hashf(i * 17) * 1000.0f + g.elapsed * 11.0f;
        float x = focus_x + hashf(i * 29) * 55.0f;
        float z = focus_z + hashf(i * 41) * 55.0f;
        float y = focus_y + 4.0f + fmodf(a + (float)i, 27.0f);
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
    float target_x, target_y, target_z, yaw_degrees, speed;
    float distance;
    Vec3 eye, centre, up = {0,1,0};

    active_focus(&target_x, &target_y, &target_z, &yaw_degrees, &speed);
    distance = g.active_vehicle == 3 ? 23.0f : (g.active_vehicle == 4 ? 28.0f : (g.active_vehicle ? 12.5f : 7.4f));
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
    } else {
        float yaw = radians(yaw_degrees);
        if (g.first_person) {
            eye.x = target_x + sinf(yaw) * 0.4f; eye.y = target_y + 0.35f; eye.z = target_z + cosf(yaw) * 0.4f;
            centre.x = eye.x + sinf(yaw) * 30.0f; centre.y = eye.y + (g.active_vehicle == 4 ? 0.0f : 0.4f); centre.z = eye.z + cosf(yaw) * 30.0f;
        } else {
            eye.x = target_x - sinf(yaw) * distance; eye.y = target_y + (g.active_vehicle ? 5.3f : 3.6f); eye.z = target_z - cosf(yaw) * distance;
            centre.x = target_x + sinf(yaw) * 4.0f; centre.y = target_y + 0.55f; centre.z = target_z + cosf(yaw) * 4.0f;
        }
    }
    look_at(eye, centre, up);
    draw_ocean(); draw_terrain(); draw_roads(); draw_environment();
    draw_car(); draw_boat(); draw_helicopter(); draw_plane();
    if (g.active_vehicle == 0) draw_player();
    draw_rain();
    SwapBuffers(g.dc);
}

static int down(int key) { return key >= 0 && key < KEY_COUNT ? g.keys[key] : 0; }

static void set_active_vehicle(int type) {
    g.active_vehicle = type;
    g.in_car = type == 1;
    g.first_person = 0;
}

static void reset_game(void) {
    g.player_x = -638; g.player_z = 1760; g.player_y = terrain_height(g.player_x, g.player_z); g.player_yaw = 82.0f; g.player_vertical = 0;
    g.car_x = -632; g.car_z = 1764; g.car_y = terrain_height(g.car_x, g.car_z); g.car_yaw = 82.0f; g.car_speed = 0;
    memset(&g.boat, 0, sizeof(g.boat)); g.boat.x = -2940; g.boat.z = 355; g.boat.y = water_height(g.boat.x, g.boat.z) + 0.55f; g.boat.yaw = 90;
    memset(&g.heli, 0, sizeof(g.heli)); g.heli.x = -805; g.heli.z = 1745; g.heli.y = terrain_height(g.heli.x, g.heli.z) + 1.15f; g.heli.yaw = 82;
    memset(&g.plane, 0, sizeof(g.plane)); g.plane.x = -1320; g.plane.z = 1720; g.plane.y = terrain_height(g.plane.x, g.plane.z) + PLANE_CONFIG.gear_height; g.plane.yaw = 80;
    set_active_vehicle(0);
}

static void update_car(float dt, int accelerating, int reversing, int left, int right) {
    float yaw, forward_x, forward_z;
    float grip = coast_distance(g.car_x, g.car_z) > 120.0f ? 1.0f : 0.54f;
    if (accelerating) g.car_speed += 8.2f * grip * dt;
    if (reversing) g.car_speed -= 7.4f * grip * dt;
    if (!accelerating && !reversing) g.car_speed *= expf(-1.35f * dt);
    if (down(VK_SPACE)) g.car_speed *= expf(-8.0f * dt);
    g.car_speed *= expf(-0.004f * fabsf(g.car_speed) * dt);
    g.car_speed = clampf(g.car_speed, -12.0f, coast_distance(g.car_x, g.car_z) > 80.0f ? 43.0f : 19.0f);
    if (left) g.car_yaw += (52.0f / (1.0f + fabsf(g.car_speed) * 0.055f)) * dt * (g.car_speed >= 0 ? 1.0f : -1.0f);
    if (right) g.car_yaw -= (52.0f / (1.0f + fabsf(g.car_speed) * 0.055f)) * dt * (g.car_speed >= 0 ? 1.0f : -1.0f);
    yaw = radians(g.car_yaw); forward_x = sinf(yaw); forward_z = cosf(yaw);
    g.car_x += forward_x * g.car_speed * dt; g.car_z += forward_z * g.car_speed * dt;
    g.car_y = terrain_height(g.car_x, g.car_z); g.wheel_spin += g.car_speed * dt / 0.43f * 57.2958f;
    if (coast_distance(g.car_x, g.car_z) < -80.0f) reset_game();
}

static void update_boat(float dt, int accelerating, int reversing, int left, int right) {
    VehicleBody *boat = &g.boat;
    float yaw = radians(boat->yaw), fx = sinf(yaw), fz = cosf(yaw);
    float forward_speed = boat->vx * fx + boat->vz * fz;
    float desired_water = (water_height(boat->x - 1.0f, boat->z) + water_height(boat->x + 1.0f, boat->z) + water_height(boat->x, boat->z - 2.0f) + water_height(boat->x, boat->z + 2.0f)) * 0.25f + 0.54f;
    if (accelerating) boat->throttle = clampf(boat->throttle + dt * 0.65f, -1.0f, 1.0f);
    if (reversing) boat->throttle = clampf(boat->throttle - dt * 0.65f, -1.0f, 1.0f);
    /* Four-point averaged buoyancy / vertical damping, sharing the rendered wave field. */
    boat->vy += ((BOAT_CONFIG.mass * 9.81f + (desired_water - boat->y) * BOAT_CONFIG.buoyancy_spring - boat->vy * BOAT_CONFIG.buoyancy_damping) / BOAT_CONFIG.mass - 9.81f) * dt;
    { float drive_force = boat->throttle * BOAT_CONFIG.thrust - forward_speed * fabsf(forward_speed) * BOAT_CONFIG.water_drag;
      boat->vx += fx * drive_force / BOAT_CONFIG.mass * dt;
      boat->vz += fz * drive_force / BOAT_CONFIG.mass * dt; }
    boat->vx *= expf(-0.18f * dt); boat->vz *= expf(-0.18f * dt);
    if (left) boat->yaw += forward_speed * 8.0f * dt;
    if (right) boat->yaw -= forward_speed * 8.0f * dt;
    boat->x += boat->vx * dt; boat->y += boat->vy * dt; boat->z += boat->vz * dt;
    boat->pitch = clampf((water_height(boat->x, boat->z + 2.0f) - water_height(boat->x, boat->z - 2.0f)) * 12.0f, -13.0f, 13.0f);
    boat->roll = clampf((water_height(boat->x + 1.0f, boat->z) - water_height(boat->x - 1.0f, boat->z)) * 18.0f, -16.0f, 16.0f);
    boat->spin += forward_speed * dt * 75.0f;
    if (coast_distance(boat->x, boat->z) > -8.0f) { boat->vx *= 0.60f; boat->vz *= 0.60f; boat->throttle *= 0.65f; }
}

static void update_helicopter(float dt, int left, int right) {
    VehicleBody *heli = &g.heli;
    float ground = terrain_height(heli->x, heli->z);
    float thrust, ground_effect, yaw = radians(heli->yaw), fx = sinf(yaw), fz = cosf(yaw);
    float cyclic_pitch = (down(VK_UP) ? 1.0f : 0.0f) - (down(VK_DOWN) ? 1.0f : 0.0f);
    float cyclic_roll = (down(VK_RIGHT) ? 1.0f : 0.0f) - (down(VK_LEFT) ? 1.0f : 0.0f);
    if (down('W')) heli->collective = clampf(heli->collective + dt * 0.46f, 0.0f, 1.0f);
    if (down('S')) heli->collective = clampf(heli->collective - dt * 0.46f, 0.0f, 1.0f);
    { float target_rpm = heli->throttle > 0.5f ? 1.0f : 0.0f; heli->rotor_rpm += (target_rpm - heli->rotor_rpm) * HELI_CONFIG.rotor_spool * dt; }
    heli->rotor_rpm = clampf(heli->rotor_rpm, 0.0f, 1.0f);
    ground_effect = 1.0f + (heli->y - ground < HELI_CONFIG.ground_effect_height ? 0.12f * (1.0f - (heli->y - ground) / HELI_CONFIG.ground_effect_height) : 0.0f);
    thrust = HELI_CONFIG.max_thrust * heli->rotor_rpm * heli->rotor_rpm * heli->collective * ground_effect / HELI_CONFIG.mass;
    heli->vy += (thrust - 9.81f - HELI_CONFIG.drag * heli->vy * fabsf(heli->vy)) * dt;
    heli->vx += (fx * cyclic_pitch + cosf(yaw) * cyclic_roll) * HELI_CONFIG.cyclic_accel * heli->rotor_rpm * dt;
    heli->vz += (fz * cyclic_pitch - sinf(yaw) * cyclic_roll) * HELI_CONFIG.cyclic_accel * heli->rotor_rpm * dt;
    heli->vx *= expf(-HELI_CONFIG.drag * dt); heli->vz *= expf(-HELI_CONFIG.drag * dt);
    if (left) heli->yaw += HELI_CONFIG.yaw_torque * heli->rotor_rpm * dt;
    if (right) heli->yaw -= HELI_CONFIG.yaw_torque * heli->rotor_rpm * dt;
    heli->pitch = lerpf(heli->pitch, -cyclic_pitch * 12.0f, 4.0f * dt); heli->roll = lerpf(heli->roll, cyclic_roll * 12.0f, 4.0f * dt);
    heli->x += heli->vx * dt; heli->y += heli->vy * dt; heli->z += heli->vz * dt; heli->spin += heli->rotor_rpm * dt * 1500.0f;
    if (heli->y < ground + 1.05f) { heli->y = ground + 1.05f; if (heli->vy < 0) heli->vy *= -0.12f; heli->vx *= 0.82f; heli->vz *= 0.82f; }
}

static void update_plane(float dt, int left, int right) {
    VehicleBody *plane = &g.plane;
    float yaw = radians(plane->yaw), fx = sinf(yaw), fz = cosf(yaw);
    float forward_speed = plane->vx * fx + plane->vz * fz;
    float pitch_control = (down(VK_UP) ? 1.0f : 0.0f) - (down(VK_DOWN) ? 1.0f : 0.0f);
    float lift_coefficient, lift, drag, dynamic_pressure, ground = terrain_height(plane->x, plane->z) + PLANE_CONFIG.gear_height;
    if (down('W')) plane->throttle = clampf(plane->throttle + dt * 0.45f, 0.0f, 1.0f);
    if (down('S')) plane->throttle = clampf(plane->throttle - dt * 0.45f, 0.0f, 1.0f);
    if (left) plane->roll = clampf(plane->roll + 38.0f * dt, -38.0f, 38.0f);
    if (right) plane->roll = clampf(plane->roll - 38.0f * dt, -38.0f, 38.0f);
    if (!left && !right) plane->roll *= expf(-1.8f * dt);
    plane->pitch = clampf(plane->pitch + pitch_control * 27.0f * dt, -10.0f, 20.0f);
    if (!pitch_control) plane->pitch *= expf(-0.35f * dt);
    plane->yaw += -plane->roll * clampf(forward_speed / 35.0f, 0.0f, 1.0f) * 0.75f * dt;
    lift_coefficient = 0.18f + radians(plane->pitch) * 2.2f;
    if (forward_speed < PLANE_CONFIG.stall_speed && lift_coefficient > 0.3f) lift_coefficient *= 0.32f;
    lift_coefficient = clampf(lift_coefficient, -0.25f, 0.82f);
    dynamic_pressure = 0.5f * PLANE_CONFIG.air_density * forward_speed * forward_speed;
    lift = dynamic_pressure * PLANE_CONFIG.wing_area * lift_coefficient;
    drag = dynamic_pressure * PLANE_CONFIG.wing_area * (0.034f + PLANE_CONFIG.induced_drag * lift_coefficient * lift_coefficient);
    plane->vx += fx * (plane->throttle * PLANE_CONFIG.max_thrust - drag) / PLANE_CONFIG.mass * dt;
    plane->vz += fz * (plane->throttle * PLANE_CONFIG.max_thrust - drag) / PLANE_CONFIG.mass * dt;
    plane->vy += (lift / PLANE_CONFIG.mass - 9.81f) * dt;
    plane->x += plane->vx * dt; plane->y += plane->vy * dt; plane->z += plane->vz * dt; plane->spin += plane->throttle * dt * 1850.0f;
    if (plane->y < ground) { plane->y = ground; if (plane->vy < 0) plane->vy *= -0.10f; plane->vx *= expf(-0.85f * dt); plane->vz *= expf(-0.85f * dt); }
    if (plane->y < water_height(plane->x, plane->z) + PLANE_CONFIG.gear_height) { plane->y = water_height(plane->x, plane->z) + PLANE_CONFIG.gear_height; plane->vy = 0; plane->vx *= 0.70f; plane->vz *= 0.70f; }
}

static void update_title(void) {
    wchar_t title[256];
    int minutes = (int)(g.time_of_day * 60.0f) % (24 * 60);
    float x, y, z, yaw, speed; active_focus(&x, &y, &z, &yaw, &speed);
    const wchar_t *mode[] = { L"ON FOOT", L"ISLAND RUNNER", L"REEF WORKBOAT", L"ISLAND KESTREL HELI", L"COASTAL STOL" };
    const wchar_t *weather[] = { L"CLEAR", L"CLOUD", L"RAIN", L"STORM" };
    swprintf(title, 256, L"NAURU: THE COUNTRYSIDE  |  %ls  |  %03d km/h  |  %02d:%02d %ls  |  F1 controls", mode[g.active_vehicle], (int)(fabsf(speed) * 3.6f), minutes / 60, minutes % 60, weather[g.weather]);
    SetWindowTextW(g.window, title);
}

static void update(float dt) {
    float yaw, forward_x, forward_z;
    int accelerating, reversing, left, right;
    if (dt > 0.05f) dt = 0.05f;
    g.elapsed += dt; g.time_of_day += dt * (24.0f / 760.0f); if (g.time_of_day >= 24.0f) g.time_of_day -= 24.0f;
    accelerating = down('W'); reversing = down('S'); left = down('A'); right = down('D');
    if (g.active_vehicle == 1) update_car(dt, accelerating, reversing, left, right);
    else if (g.active_vehicle == 2) update_boat(dt, accelerating, reversing, left, right);
    else if (g.active_vehicle == 3) update_helicopter(dt, left, right);
    else if (g.active_vehicle == 4) update_plane(dt, left, right);
    else {
        float speed = down(VK_SHIFT) ? 8.3f : 4.8f;
        if (left) g.player_yaw += 115.0f * dt;
        if (right) g.player_yaw -= 115.0f * dt;
        yaw = radians(g.player_yaw); forward_x = sinf(yaw); forward_z = cosf(yaw);
        if (accelerating || down(VK_UP)) { g.player_x += forward_x * speed * dt; g.player_z += forward_z * speed * dt; }
        if (reversing || down(VK_DOWN)) { g.player_x -= forward_x * speed * 0.65f * dt; g.player_z -= forward_z * speed * 0.65f * dt; }
        g.player_vertical -= 16.5f * dt; g.player_y += g.player_vertical * dt;
        { float ground = terrain_height(g.player_x, g.player_z); if (g.player_y <= ground) { g.player_y = ground; g.player_vertical = 0; } }
        if (coast_distance(g.player_x, g.player_z) < -140.0f) reset_game();
    }
    update_title();
}

static float planar_distance(float ax, float az, float bx, float bz) { return sqrtf((ax - bx)*(ax - bx) + (az - bz)*(az - bz)); }

static void exit_active_vehicle(void) {
    float x, y, z, yaw, speed;
    active_focus(&x, &y, &z, &yaw, &speed);
    if ((g.active_vehicle == 2 && coast_distance(g.boat.x, g.boat.z) < -8.0f) ||
        (g.active_vehicle == 3 && g.heli.y > terrain_height(g.heli.x, g.heli.z) + 1.35f) ||
        (g.active_vehicle == 4 && (fabsf(speed) > 2.0f || g.plane.y > terrain_height(g.plane.x, g.plane.z) + 1.4f))) return;
    g.player_x = x + cosf(radians(yaw)) * 2.5f; g.player_z = z - sinf(radians(yaw)) * 2.5f;
    g.player_y = terrain_height(g.player_x, g.player_z); g.player_yaw = yaw; g.player_vertical = 0; set_active_vehicle(0);
}

static void action_key(WPARAM key) {
    if (key == 'E') {
        if (g.active_vehicle) exit_active_vehicle();
        else if (planar_distance(g.player_x, g.player_z, g.car_x, g.car_z) < 7.5f) set_active_vehicle(1);
        else if (planar_distance(g.player_x, g.player_z, g.boat.x, g.boat.z) < 7.5f) set_active_vehicle(2);
        else if (planar_distance(g.player_x, g.player_z, g.heli.x, g.heli.z) < 7.5f) set_active_vehicle(3);
        else if (planar_distance(g.player_x, g.player_z, g.plane.x, g.plane.z) < 7.5f) set_active_vehicle(4);
    }
    if (key == 'Z' && g.active_vehicle == 3) g.heli.throttle = g.heli.throttle > 0.5f ? 0.0f : 1.0f;
    if (key == 'R') reset_game();
    if (key == 'M') g.map_mode = !g.map_mode;
    if (key == 'V') g.first_person = !g.first_person;
    if (key == 'T') g.weather = (g.weather + 1) % 4;
    if (key == VK_SPACE && g.active_vehicle == 0 && fabsf(g.player_vertical) < 0.01f) g.player_vertical = 6.3f;
    if (key == VK_F1) MessageBoxW(g.window,
        L"NAURU: THE COUNTRYSIDE — Native Standalone Edition\n\n"
        L"ON FOOT: W/S move, A/D turn, SHIFT sprint, SPACE jump, E enter.\n"
        L"CAR / BOAT: W/S throttle, A/D steer, E exit.\n"
        L"HELICOPTER: E enter, Z start rotor, W/S collective, A/D yaw, ARROWS cyclic.\n"
        L"AEROPLANE: E enter, W/S throttle, A/D roll, UP/DOWN pitch.\n"
        L"V camera, M island overview, T weather, R reset, ESC quit.\n\n"
        L"Every controllable vehicle uses force/velocity integration; this offline Win32 build does not launch a browser.",
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
