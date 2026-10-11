import * as THREE from 'three';

export class Ocean {
  constructor(quality) {
    const segments = quality.name === 'LOW' ? 34 : quality.name === 'MEDIUM' ? 52 : quality.name === 'HIGH' ? 76 : 100;
    const geometry = new THREE.PlaneGeometry(24000, 24000, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x063c4e) },
        uShallow: { value: new THREE.Color(0x1a8791) },
        uSky: { value: new THREE.Color(0x7fc2cf) },
        uFogColor: { value: new THREE.Color(0x9bc6c5) },
        uFogNear: { value: 3000 },
        uFogFar: { value: quality.far * 0.8 },
        uSunDirection: { value: new THREE.Vector3(0.2, 0.8, -0.4).normalize() },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        float wave(vec2 p) {
          return sin(p.x * .010 + uTime * .72) * 0.38
               + sin((p.x + p.y) * .006 - uTime * .54) * 0.46
               + sin(p.y * .018 + uTime * .91) * 0.16;
        }
        void main() {
          vec3 p = position;
          p.y += wave(p.xz);
          float e = 1.5;
          float hx = wave(p.xz + vec2(e, 0.0));
          float hz = wave(p.xz + vec2(0.0, e));
          vec3 objectNormal = normalize(vec3(p.y - hx, e, p.y - hz));
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          vNormalW = normalize(mat3(modelMatrix) * objectNormal);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        uniform vec3 uFogColor;
        uniform vec3 uSunDirection;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - max(dot(viewDir, vNormalW), 0.0), 3.0);
          float sun = pow(max(dot(reflect(-uSunDirection, vNormalW), viewDir), 0.0), 96.0);
          float ripple = vNormalW.x * .7 + vNormalW.z * .3;
          vec3 base = mix(uDeep, uShallow, .42 + ripple * .18);
          vec3 color = mix(base, uSky, fresnel * .62) + vec3(1.0, .88, .62) * sun * .65;
          float fog = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vWorld));
          color = mix(color, uFogColor, fog);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'Pacific Ocean';
    this.mesh.position.y = 0;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = -5;
  }

  update(elapsed) { this.material.uniforms.uTime.value = elapsed; }
  setAtmosphere({ fogColor, fogNear, fogFar, skyColor, sunDirection }) {
    this.material.uniforms.uFogColor.value.copy(fogColor);
    this.material.uniforms.uFogNear.value = fogNear;
    this.material.uniforms.uFogFar.value = fogFar;
    this.material.uniforms.uSky.value.copy(skyColor);
    this.material.uniforms.uSunDirection.value.copy(sunDirection);
  }
}
