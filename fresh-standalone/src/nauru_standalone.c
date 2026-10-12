/*
  NAURU: THE COUNTRYSIDE — fresh standalone Windows prototype.
  Generated from scratch for this build. It uses Win32 + system OpenGL only:
  no browser, localhost service, web runtime, image map, or external assets.
*/
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <GL/gl.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#define PI 3.14159265358979323846f
#define KEY_CAP 512
#define FIXED_DT (1.0f / 60.0f)

typedef struct { float x, y, z; } V3;
typedef enum { FOOT, CAR, BOAT, HELI, PLANE } Mode;
typedef struct { float x, y, z, vx, vy, vz, yaw, pitch, roll, power, aux, spin; } Body;
typedef struct {
  HWND hwnd; HDC dc; HGLRC gl; int w, h, running, key[KEY_CAP];
  Mode mode; float time, day, accumulator;
  Body human, car, boat, heli, plane;
  LARGE_INTEGER ticks, freq;
} Game;
static Game g;

static float clamp(float n, float a, float b) { return n < a ? a : n > b ? b : n; }
static float mix(float a, float b, float t) { return a + (b-a)*t; }
static float rad(float d) { return d * PI / 180.0f; }
static float mag2(float x, float z) { return sqrtf(x*x + z*z); }
static int is_down(int k) { return k >= 0 && k < KEY_CAP && g.key[k]; }
static float ease(float a, float b, float n) { float t=clamp((n-a)/(b-a),0,1); return t*t*(3-2*t); }
static float hash(int n) { unsigned x=(unsigned)n; x=(x^61u)^(x>>16); x*=9u; x^=x>>4; x*=0x27d4eb2du; x^=x>>15; return (float)(x&65535u)/32767.5f-1.0f; }

/* Original coastline model in a 5.7 by 6.1 km local metre frame. */
static float island_metric(float x, float z) {
  float a=atan2f(z/3050.0f,x/2850.0f);
  float r=sqrtf(x*x/(2850.0f*2850.0f)+z*z/(3050.0f*3050.0f));
  float contour=1.0f+0.047f*sinf(3*a+0.7f)+0.029f*cosf(6*a-0.9f)+0.014f*sinf(12*a);
  return r/contour;
}
static float coast(float x,float z) { return (1.0f-island_metric(x,z))*2950.0f; }
static float runway_blend(float x,float z) {
  float dx=x+450, dz=z-1840, c=0.985f, s=0.174f;
  float u=dx*c+dz*s, v=-dx*s+dz*c;
  float ox=fabsf(u)-1120, oz=fabsf(v)-115;
  float d=sqrtf((ox>0?ox:0)*(ox>0?ox:0)+(oz>0?oz:0)*(oz>0?oz:0));
  return ox<=0&&oz<=0 ? 1.0f : 1.0f-ease(0,145,d);
}
static float terrain(float x,float z) {
  float c=coast(x,z), p, n, h;
  if(c<0) return -1.1f;
  p=ease(190,790,c); n=hash((int)(x/97)*193+(int)(z/97)*71);
  h=1.2f+ease(5,170,c)*4.0f+p*(31.0f+n*4.2f);
  if(c>650) h+=fabsf(hash((int)(x/65)*11+(int)(z/65)*23))*4.5f-1.2f;
  { float lx=(x+650)/245.0f,lz=(z-420)/138.0f,d=sqrtf(lx*lx+lz*lz); if(d<1.6f) h=mix(h,12.8f,1-ease(.9f,1.6f,d)); }
  return mix(h,4.25f,runway_blend(x,z));
}
static float waves(float x,float z) { return .28f*sinf((x+g.time*20)*.006f)+.18f*cosf((z-g.time*15)*.009f); }
static void normal(float x,float z,V3*o) { float s=4,nx=terrain(x-s,z)-terrain(x+s,z),nz=terrain(x,z-s)-terrain(x,z+s),l=sqrtf(nx*nx+4*s*s+nz*nz); o->x=nx/l;o->y=2*s/l;o->z=nz/l; }

static void box(float x,float y,float z) {
  x*=.5f;y*=.5f;z*=.5f; glBegin(GL_QUADS);
  glNormal3f(0,0,1);glVertex3f(-x,-y,z);glVertex3f(x,-y,z);glVertex3f(x,y,z);glVertex3f(-x,y,z);
  glNormal3f(0,0,-1);glVertex3f(x,-y,-z);glVertex3f(-x,-y,-z);glVertex3f(-x,y,-z);glVertex3f(x,y,-z);
  glNormal3f(1,0,0);glVertex3f(x,-y,z);glVertex3f(x,-y,-z);glVertex3f(x,y,-z);glVertex3f(x,y,z);
  glNormal3f(-1,0,0);glVertex3f(-x,-y,-z);glVertex3f(-x,-y,z);glVertex3f(-x,y,z);glVertex3f(-x,y,-z);
  glNormal3f(0,1,0);glVertex3f(-x,y,z);glVertex3f(x,y,z);glVertex3f(x,y,-z);glVertex3f(-x,y,-z);
  glNormal3f(0,-1,0);glVertex3f(-x,-y,-z);glVertex3f(x,-y,-z);glVertex3f(x,-y,z);glVertex3f(-x,-y,z);glEnd();
}
static void tube(float r,float h,int count) { int i; glBegin(GL_QUAD_STRIP); for(i=0;i<=count;i++){float a=2*PI*i/count,x=cosf(a)*r,z=sinf(a)*r;glNormal3f(x/r,0,z/r);glVertex3f(x,-h*.5f,z);glVertex3f(x,h*.5f,z);}glEnd(); }
static void look(V3 eye,V3 center) {
  V3 f={center.x-eye.x,center.y-eye.y,center.z-eye.z},u={0,1,0},s,uu; float l=sqrtf(f.x*f.x+f.y*f.y+f.z*f.z); GLfloat m[16];
  f.x/=l;f.y/=l;f.z/=l;s.x=f.y*u.z-f.z*u.y;s.y=f.z*u.x-f.x*u.z;s.z=f.x*u.y-f.y*u.x;l=sqrtf(s.x*s.x+s.y*s.y+s.z*s.z);s.x/=l;s.y/=l;s.z/=l;uu.x=s.y*f.z-s.z*f.y;uu.y=s.z*f.x-s.x*f.z;uu.z=s.x*f.y-s.y*f.x;
  m[0]=s.x;m[1]=uu.x;m[2]=-f.x;m[3]=0;m[4]=s.y;m[5]=uu.y;m[6]=-f.y;m[7]=0;m[8]=s.z;m[9]=uu.z;m[10]=-f.z;m[11]=0;m[12]=m[13]=m[14]=0;m[15]=1;glMultMatrixf(m);glTranslatef(-eye.x,-eye.y,-eye.z);
}
static void draw_water(void) { int i,j; glDisable(GL_LIGHTING);glColor3f(.035f,.29f,.38f);glBegin(GL_QUADS);for(j=-27;j<27;j++)for(i=-27;i<27;i++){float x=i*300,z=j*300;glVertex3f(x,waves(x,z),z);glVertex3f(x+300,waves(x+300,z),z);glVertex3f(x+300,waves(x+300,z+300),z+300);glVertex3f(x,waves(x,z+300),z+300);}glEnd();glEnable(GL_LIGHTING); }
static void vertex(float x,float z) { V3 n;float h=terrain(x,z),c=coast(x,z);normal(x,z,&n);if(c<135)glColor3f(.65f,.55f,.34f);else if(c>630)glColor3f(.43f,.40f,.31f);else glColor3f(.18f,.39f,.15f);glNormal3f(n.x,n.y,n.z);glVertex3f(x,h,z); }
static void draw_land(void) { int x,z;glBegin(GL_QUADS);for(z=-3100;z<3100;z+=95)for(x=-2900;x<2900;x+=95){if(coast(x,z)<0||coast(x+95,z)<0||coast(x+95,z+95)<0||coast(x,z+95)<0)continue;vertex(x,z);vertex(x+95,z);vertex(x+95,z+95);vertex(x,z+95);}glEnd(); }
static void road_piece(float ax,float az,float bx,float bz,float width){float dx=bx-ax,dz=bz-az,l=sqrtf(dx*dx+dz*dz),nx=-dz/l*width*.5f,nz=dx/l*width*.5f;float ay=terrain(ax,az)+.25f,by=terrain(bx,bz)+.25f;glBegin(GL_QUADS);glVertex3f(ax+nx,ay,az+nz);glVertex3f(ax-nx,ay,az-nz);glVertex3f(bx-nx,by,bz-nz);glVertex3f(bx+nx,by,bz+nz);glEnd();}
static void shore_point(float a,float scale,float *x,float*z){float r=1+.047f*sinf(3*a+.7f)+.029f*cosf(6*a-.9f)+.014f*sinf(12*a);*x=cosf(a)*2850*r*scale;*z=sinf(a)*3050*r*scale;}
static void draw_roads(void){int i;glDisable(GL_LIGHTING);glColor3f(.14f,.16f,.16f);for(i=0;i<220;i++){float ax,az,bx,bz;shore_point(2*PI*i/220,.9f,&ax,&az);shore_point(2*PI*(i+1)/220,.9f,&bx,&bz);road_piece(ax,az,bx,bz,10);}glPushMatrix();glTranslatef(-450,4.37f,1840);glRotatef(-10,0,1,0);glColor3f(.15f,.17f,.17f);box(2200,.2f,48);glColor3f(.82f,.79f,.65f);for(i=-12;i<13;i++){glPushMatrix();glTranslatef(i*82,.13f,0);box(24,.04f,.4f);glPopMatrix();}glPopMatrix();glEnable(GL_LIGHTING);}
static void palm(float x,float z,float size){int i;if(coast(x,z)<80)return;glPushMatrix();glTranslatef(x,terrain(x,z),z);glColor3f(.28f,.18f,.08f);glPushMatrix();glScalef(1,size,1);tube(.2f,1,6);glPopMatrix();glTranslatef(0,size*.5f,0);glColor3f(.12f,.34f,.12f);for(i=0;i<7;i++){glPushMatrix();glRotatef(i*51.4f,0,1,0);glRotatef(-27,1,0,0);glBegin(GL_TRIANGLES);glVertex3f(0,0,0);glVertex3f(-.3f,0,size*.52f);glVertex3f(.3f,0,size*.52f);glEnd();glPopMatrix();}glPopMatrix();}
static void house(float x,float z,float yaw){float y=terrain(x,z);glPushMatrix();glTranslatef(x,y+2,z);glRotatef(yaw,0,1,0);glColor3f(.58f,.58f,.49f);box(8,4,7);glTranslatef(0,2.1f,0);glColor3f(.27f,.14f,.1f);glBegin(GL_TRIANGLES);glVertex3f(-4.5f,0,-4);glVertex3f(4.5f,0,-4);glVertex3f(0,2.3f,-4);glVertex3f(4.5f,0,4);glVertex3f(-4.5f,0,4);glVertex3f(0,2.3f,4);glEnd();glPopMatrix();}
static void draw_scene_props(void){int i;for(i=0;i<56;i++){float a=2*PI*i/56,x,z;shore_point(a,.78f+hash(i*7)*.035f,&x,&z);house(x,z,a*180/PI+90);shore_point(a+.03f,.69f,&x,&z);palm(x,z,7+2*(hash(i*9)+1));}for(i=0;i<80;i++){float a=i*2.31f,x,z;shore_point(a,.2f+.5f*(hash(i*17)+1)*.5f,&x,&z);palm(x,z,5+2*(hash(i*19)+1));}glPushMatrix();glTranslatef(-750,7,1740);glColor3f(.65f,.65f,.6f);box(90,6,24);glTranslatef(32,8,0);glColor3f(.25f,.37f,.39f);box(8,16,8);glPopMatrix();}

static void wheel(float x,float z,float spin){glPushMatrix();glTranslatef(x,.45f,z);glRotatef(spin,1,0,0);glRotatef(90,0,0,1);glColor3f(.04f,.05f,.05f);tube(.4f,.24f,10);glPopMatrix();}
static void draw_car(void){Body*b=&g.car;glPushMatrix();glTranslatef(b->x,b->y+.1f,b->z);glRotatef(b->yaw,0,1,0);glColor3f(.86f,.56f,.14f);glPushMatrix();glTranslatef(0,.7f,0);box(1.85f,.5f,4);glPopMatrix();glColor3f(.16f,.28f,.3f);glPushMatrix();glTranslatef(0,1.4f,-.25f);box(1.55f,.7f,1.8f);glPopMatrix();wheel(-.95f,1.3f,b->spin);wheel(.95f,1.3f,b->spin);wheel(-.95f,-1.3f,b->spin);wheel(.95f,-1.3f,b->spin);glPopMatrix();}
static void draw_boat(void){Body*b=&g.boat;glPushMatrix();glTranslatef(b->x,b->y,b->z);glRotatef(b->yaw,0,1,0);glRotatef(b->pitch,1,0,0);glRotatef(b->roll,0,0,1);glColor3f(.84f,.85f,.8f);glPushMatrix();glTranslatef(0,.2f,0);box(2.2f,.6f,5.1f);glPopMatrix();glColor3f(.08f,.36f,.44f);glPushMatrix();glTranslatef(0,.62f,-.2f);box(1.1f,.7f,1.2f);glPopMatrix();glColor3f(.12f,.14f,.14f);glPushMatrix();glTranslatef(0,.4f,-2.8f);box(.4f,.8f,.3f);glPopMatrix();glPopMatrix();}
static void draw_heli(void){Body*b=&g.heli;glPushMatrix();glTranslatef(b->x,b->y,b->z);glRotatef(b->yaw,0,1,0);glRotatef(b->pitch,1,0,0);glRotatef(b->roll,0,0,1);glColor3f(.16f,.5f,.43f);box(2.1f,1.3f,3);glColor3f(.14f,.25f,.28f);glPushMatrix();glTranslatef(0,.3f,1.45f);box(1.75f,.8f,.9f);glPopMatrix();glColor3f(.16f,.5f,.43f);glPushMatrix();glTranslatef(0,.15f,-3);box(.35f,.35f,3);glPopMatrix();glColor3f(.08f,.09f,.09f);glPushMatrix();glTranslatef(0,1.05f,0);glRotatef(b->spin,0,1,0);box(.1f,.04f,9);glRotatef(90,0,1,0);box(.1f,.04f,9);glPopMatrix();glPopMatrix();}
static void draw_plane(void){Body*b=&g.plane;glPushMatrix();glTranslatef(b->x,b->y,b->z);glRotatef(b->yaw,0,1,0);glRotatef(b->pitch,1,0,0);glRotatef(b->roll,0,0,1);glColor3f(.88f,.77f,.31f);box(1.3f,1.1f,7.2f);glColor3f(.8f,.7f,.28f);glPushMatrix();glTranslatef(0,.1f,.2f);box(11,.15f,1.7f);glPopMatrix();glPushMatrix();glTranslatef(0,.45f,-3.1f);box(3.4f,.1f,1);glPopMatrix();glColor3f(.1f,.1f,.1f);glPushMatrix();glTranslatef(0,0,3.7f);glRotatef(b->spin,0,0,1);box(.05f,3,.1f);glPopMatrix();glPopMatrix();}
static void draw_human(void){Body*b=&g.human;glPushMatrix();glTranslatef(b->x,b->y,b->z);glRotatef(b->yaw,0,1,0);glColor3f(.1f,.56f,.51f);glPushMatrix();glTranslatef(0,1.3f,0);box(.55f,.9f,.35f);glPopMatrix();glColor3f(.58f,.36f,.22f);glPushMatrix();glTranslatef(0,2,.01f);tube(.22f,.38f,10);glPopMatrix();glPopMatrix();}

static void focus(float*x,float*y,float*z,float*yaw,float*speed){Body*b=&g.human;*speed=0;if(g.mode==CAR)b=&g.car;else if(g.mode==BOAT)b=&g.boat;else if(g.mode==HELI)b=&g.heli;else if(g.mode==PLANE)b=&g.plane;*x=b->x;*z=b->z;*yaw=b->yaw;*y=b->y+(g.mode==FOOT?1.4f:1.2f);if(g.mode!=FOOT)*speed=sqrtf(b->vx*b->vx+b->vz*b->vz);}
static void render(void){float x,y,z,yaw,speed,sun=.45f+.45f*sinf((g.day-6)*PI/12),fog[4]={.08f+sun*.15f,.17f+sun*.25f,.2f+sun*.27f,1},fov,top,right;V3 eye,c;focus(&x,&y,&z,&yaw,&speed);glClearColor(fog[0],fog[1],fog[2],1);glFogfv(GL_FOG_COLOR,fog);glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);glMatrixMode(GL_PROJECTION);glLoadIdentity();fov=rad(62);top=tanf(fov*.5f)*.4f;right=top*g.w/g.h;glFrustum(-right,right,-top,top,.4,10500);glMatrixMode(GL_MODELVIEW);glLoadIdentity();if(is_down('M')){eye=(V3){0,7000,0};c=(V3){0,0,0};}else{float q=rad(yaw),d=g.mode==FOOT?7.5f:g.mode==HELI?23:g.mode==PLANE?28:13;eye=(V3){x-sinf(q)*d,y+5,z-cosf(q)*d};c=(V3){x+sinf(q)*4,y+.5f,z+cosf(q)*4};}look(eye,c);draw_water();draw_land();draw_roads();draw_scene_props();draw_car();draw_boat();draw_heli();draw_plane();if(g.mode==FOOT)draw_human();SwapBuffers(g.dc);}

static void reset(void){memset(&g.human,0,sizeof(Body));memset(&g.car,0,sizeof(Body));memset(&g.boat,0,sizeof(Body));memset(&g.heli,0,sizeof(Body));memset(&g.plane,0,sizeof(Body));g.human.x=-640;g.human.z=1758;g.human.y=terrain(g.human.x,g.human.z);g.human.yaw=82;g.car.x=-632;g.car.z=1764;g.car.y=terrain(g.car.x,g.car.z);g.car.yaw=82;g.boat.x=-2920;g.boat.z=360;g.boat.y=waves(g.boat.x,g.boat.z)+.55f;g.boat.yaw=90;g.heli.x=-800;g.heli.z=1740;g.heli.y=terrain(g.heli.x,g.heli.z)+1.1f;g.heli.yaw=82;g.plane.x=-1300;g.plane.z=1725;g.plane.y=terrain(g.plane.x,g.plane.z)+1.05f;g.plane.yaw=80;g.mode=FOOT;}
static void car_step(float dt){Body*b=&g.car;float f=cosf(rad(b->yaw))*b->vz+sinf(rad(b->yaw))*b->vx;if(is_down('W'))b->power+=8*dt;if(is_down('S'))b->power-=9*dt;if(!is_down('W')&&!is_down('S'))b->power*=expf(-1.4f*dt);b->power=clamp(b->power,-12,42);if(is_down('A'))b->yaw+=48*dt*(b->power>=0?1:-1);if(is_down('D'))b->yaw-=48*dt*(b->power>=0?1:-1);b->vx=sinf(rad(b->yaw))*b->power;b->vz=cosf(rad(b->yaw))*b->power;b->x+=b->vx*dt;b->z+=b->vz*dt;b->y=terrain(b->x,b->z);b->spin+=b->power*dt*130;if(coast(b->x,b->z)<-70)reset();(void)f;}
static void boat_step(float dt){Body*b=&g.boat;float q=rad(b->yaw),fx=sinf(q),fz=cosf(q),v=b->vx*fx+b->vz*fz,water=(waves(b->x-1,b->z)+waves(b->x+1,b->z)+waves(b->x,b->z-2)+waves(b->x,b->z+2))*.25f+.55f,force;if(is_down('W'))b->power=clamp(b->power+.7f*dt,-1,1);if(is_down('S'))b->power=clamp(b->power-.7f*dt,-1,1);force=b->power*2850-v*fabsf(v)*105;b->vx+=fx*force/620*dt;b->vz+=fz*force/620*dt;b->vy+=(9.81f+(water-b->y)*28-b->vy*10-9.81f)*dt;if(is_down('A'))b->yaw+=v*8*dt;if(is_down('D'))b->yaw-=v*8*dt;b->x+=b->vx*dt;b->y+=b->vy*dt;b->z+=b->vz*dt;b->vx*=expf(-.18f*dt);b->vz*=expf(-.18f*dt);b->pitch=clamp((waves(b->x,b->z+2)-waves(b->x,b->z-2))*12,-12,12);b->roll=clamp((waves(b->x+1,b->z)-waves(b->x-1,b->z))*18,-15,15);if(coast(b->x,b->z)>-7){b->vx*=.6f;b->vz*=.6f;b->power*=.6f;}}
static void heli_step(float dt){Body*b=&g.heli;float ground=terrain(b->x,b->z),q=rad(b->yaw),cp=(is_down(VK_UP)?1:0)-(is_down(VK_DOWN)?1:0),cr=(is_down(VK_RIGHT)?1:0)-(is_down(VK_LEFT)?1:0),ge=1+(b->y-ground<9?.12f*(1-(b->y-ground)/9):0),thrust;if(is_down('W'))b->aux=clamp(b->aux+.46f*dt,0,1);if(is_down('S'))b->aux=clamp(b->aux-.46f*dt,0,1);b->power+=((is_down('Z')?1:0)-b->power)*1.25f*dt;thrust=17700*b->power*b->power*b->aux*ge/1280;b->vy+=(thrust-9.81f-.045f*b->vy*fabsf(b->vy))*dt;b->vx+=(sinf(q)*cp+cosf(q)*cr)*6.2f*b->power*dt;b->vz+=(cosf(q)*cp-sinf(q)*cr)*6.2f*b->power*dt;if(is_down('A'))b->yaw+=42*b->power*dt;if(is_down('D'))b->yaw-=42*b->power*dt;b->pitch=mix(b->pitch,-cp*12,dt*4);b->roll=mix(b->roll,cr*12,dt*4);b->x+=b->vx*dt;b->y+=b->vy*dt;b->z+=b->vz*dt;b->vx*=expf(-.045f*dt);b->vz*=expf(-.045f*dt);b->spin+=b->power*dt*1500;if(b->y<ground+1.05f){b->y=ground+1.05f;if(b->vy<0)b->vy*=-.1f;}}
static void plane_step(float dt){Body*b=&g.plane;float q=rad(b->yaw),fx=sinf(q),fz=cosf(q),v=b->vx*fx+b->vz*fz,p=(is_down(VK_UP)?1:0)-(is_down(VK_DOWN)?1:0),cl,dyn,lift,drag,ground=terrain(b->x,b->z)+1.05f;if(is_down('W'))b->power=clamp(b->power+.45f*dt,0,1);if(is_down('S'))b->power=clamp(b->power-.45f*dt,0,1);if(is_down('A'))b->roll=clamp(b->roll+38*dt,-38,38);if(is_down('D'))b->roll=clamp(b->roll-38*dt,-38,38);if(!is_down('A')&&!is_down('D'))b->roll*=expf(-1.8f*dt);b->pitch=clamp(b->pitch+p*27*dt,-10,20);b->yaw-=b->roll*clamp(v/35,0,1)*.75f*dt;cl=clamp(.18f+rad(b->pitch)*2.2f,-.25f,.82f);if(v<16&&cl>.3f)cl*=.32f;dyn=.5f*1.18f*v*v;lift=dyn*16.2f*cl;drag=dyn*16.2f*(.034f+.075f*cl*cl);b->vx+=fx*(b->power*2800-drag)/930*dt;b->vz+=fz*(b->power*2800-drag)/930*dt;b->vy+=(lift/930-9.81f)*dt;b->x+=b->vx*dt;b->y+=b->vy*dt;b->z+=b->vz*dt;b->spin+=b->power*dt*1850;if(b->y<ground){b->y=ground;if(b->vy<0)b->vy*=-.1f;b->vx*=expf(-.85f*dt);b->vz*=expf(-.85f*dt);}}
static float proximity(Body*a,Body*b){return mag2(a->x-b->x,a->z-b->z);}
static Body *occupied_body(void){
  if(g.mode==CAR)return &g.car;
  if(g.mode==BOAT)return &g.boat;
  if(g.mode==HELI)return &g.heli;
  if(g.mode==PLANE)return &g.plane;
  return &g.human;
}
static void action(WPARAM k){
  if(k=='R') reset();
  if(k=='E'){
    if(g.mode!=FOOT){
      Body *v=occupied_body();
      if((g.mode==BOAT && coast(v->x,v->z)<-7.0f) ||
         (g.mode==HELI && v->y>terrain(v->x,v->z)+1.35f) ||
         (g.mode==PLANE && mag2(v->vx,v->vz)>2.0f)) return;
      g.human.x=v->x+cosf(rad(v->yaw))*2.4f; g.human.z=v->z-sinf(rad(v->yaw))*2.4f;
      g.human.y=terrain(g.human.x,g.human.z); g.human.yaw=v->yaw; g.mode=FOOT;
    } else if(proximity(&g.human,&g.car)<8) g.mode=CAR;
      else if(proximity(&g.human,&g.boat)<8) g.mode=BOAT;
      else if(proximity(&g.human,&g.heli)<8) g.mode=HELI;
      else if(proximity(&g.human,&g.plane)<8) g.mode=PLANE;
  }
  if(k==VK_SPACE&&g.mode==FOOT&&fabsf(g.human.vy)<.01f) g.human.vy=sqrtf(2*9.81f*1.15f);
  if(k==VK_F1) MessageBoxW(g.hwnd,
    L"NAURU: THE COUNTRYSIDE — standalone build\n\n"
    L"Walk to a vehicle and press E.\n"
    L"Foot: W/S move, A/D turn, SHIFT sprint, SPACE jump.\n"
    L"Car/boat: W/S throttle, A/D steer.\n"
    L"Helicopter: hold Z to spool rotor, W/S collective, A/D yaw, arrows cyclic.\n"
    L"Plane: W/S throttle, A/D roll, arrows pitch.\n"
    L"R resets all vehicles. ESC quits.\n\n"
    L"This native executable opens no browser.", L"Controls", MB_OK);
}
static void step(float dt){g.time+=dt;g.day+=dt*24/760;if(g.day>24)g.day-=24;if(g.mode==CAR)car_step(dt);else if(g.mode==BOAT)boat_step(dt);else if(g.mode==HELI)heli_step(dt);else if(g.mode==PLANE)plane_step(dt);else{Body*b=&g.human;float s=is_down(VK_SHIFT)?8.3f:4.8f,q;if(is_down('A'))b->yaw+=115*dt;if(is_down('D'))b->yaw-=115*dt;q=rad(b->yaw);if(is_down('W')){b->x+=sinf(q)*s*dt;b->z+=cosf(q)*s*dt;}if(is_down('S')){b->x-=sinf(q)*s*.65f*dt;b->z-=cosf(q)*s*.65f*dt;}b->vy-=9.81f*dt;b->y+=b->vy*dt;if(b->y<terrain(b->x,b->z)){b->y=terrain(b->x,b->z);b->vy=0;}}}
static void title(void){const wchar_t*names[]={L"ON FOOT",L"ISLAND RUNNER",L"REEF WORKBOAT",L"KESTREL HELI",L"COASTAL STOL"};wchar_t out[180];swprintf(out,180,L"NAURU: THE COUNTRYSIDE | %ls | fixed 60 Hz physics | F1 controls",names[g.mode]);SetWindowTextW(g.hwnd,out);}
static LRESULT CALLBACK proc(HWND h,UINT m,WPARAM w,LPARAM l){if(m==WM_SIZE){g.w=LOWORD(l);g.h=HIWORD(l);glViewport(0,0,g.w,g.h);return 0;}if(m==WM_DESTROY){g.running=0;PostQuitMessage(0);return 0;}if(m==WM_KEYDOWN){if(w<KEY_CAP)g.key[w]=1;if(!(l&(1<<30))){if(w==VK_ESCAPE)DestroyWindow(h);else action(w);}return 0;}if(m==WM_KEYUP){if(w<KEY_CAP)g.key[w]=0;return 0;}return DefWindowProcW(h,m,w,l);}
int WINAPI WinMain(HINSTANCE hi,HINSTANCE p,LPSTR cmd,int show){WNDCLASSW wc={0};PIXELFORMATDESCRIPTOR pd={0};MSG msg;int fmt;LARGE_INTEGER now;float frame; (void)p;(void)cmd;(void)show;wc.style=CS_OWNDC;wc.lpfnWndProc=proc;wc.hInstance=hi;wc.hCursor=LoadCursor(NULL,IDC_ARROW);wc.lpszClassName=L"FreshNauruStandalone";RegisterClassW(&wc);g.hwnd=CreateWindowW(wc.lpszClassName,L"NAURU: THE COUNTRYSIDE",WS_OVERLAPPEDWINDOW|WS_VISIBLE,CW_USEDEFAULT,CW_USEDEFAULT,1280,800,0,0,hi,0);g.dc=GetDC(g.hwnd);pd.nSize=sizeof(pd);pd.nVersion=1;pd.dwFlags=PFD_DRAW_TO_WINDOW|PFD_SUPPORT_OPENGL|PFD_DOUBLEBUFFER;pd.iPixelType=PFD_TYPE_RGBA;pd.cColorBits=32;pd.cDepthBits=24;pd.iLayerType=PFD_MAIN_PLANE;fmt=ChoosePixelFormat(g.dc,&pd);SetPixelFormat(g.dc,fmt,&pd);g.gl=wglCreateContext(g.dc);wglMakeCurrent(g.dc,g.gl);g.w=1280;g.h=800;glEnable(GL_DEPTH_TEST);glEnable(GL_CULL_FACE);glEnable(GL_LIGHTING);glEnable(GL_LIGHT0);glEnable(GL_COLOR_MATERIAL);glColorMaterial(GL_FRONT_AND_BACK,GL_AMBIENT_AND_DIFFUSE);glEnable(GL_FOG);glFogi(GL_FOG_MODE,GL_LINEAR);glFogf(GL_FOG_START,1000);glFogf(GL_FOG_END,6000);g.running=1;g.day=8.5f;reset();QueryPerformanceFrequency(&g.freq);QueryPerformanceCounter(&g.ticks);while(g.running){while(PeekMessageW(&msg,0,0,0,PM_REMOVE)){TranslateMessage(&msg);DispatchMessageW(&msg);}QueryPerformanceCounter(&now);frame=(float)(now.QuadPart-g.ticks.QuadPart)/(float)g.freq.QuadPart;g.ticks=now;g.accumulator+=clamp(frame,0,.1f);while(g.accumulator>=FIXED_DT){step(FIXED_DT);g.accumulator-=FIXED_DT;}title();render();}wglMakeCurrent(0,0);wglDeleteContext(g.gl);ReleaseDC(g.hwnd,g.dc);return 0;}
