import { useEffect, useMemo, useRef } from 'react';
import {
  Scene,
  OrthographicCamera,
  WebGLRenderer,
  PlaneGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
  Vector2,
  Clock
} from 'three';

import './FloatingLines.css';

const vertexShader = `
precision highp float;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3  iResolution;
uniform float animationSpeed;

uniform bool enableTop;
uniform bool enableMiddle;
uniform bool enableBottom;

uniform int topLineCount;
uniform int middleLineCount;
uniform int bottomLineCount;

uniform float topLineDistance;
uniform float middleLineDistance;
uniform float bottomLineDistance;

uniform vec3 topWavePosition;
uniform vec3 middleWavePosition;
uniform vec3 bottomWavePosition;

uniform vec2 iMouse;
uniform bool interactive;
uniform float bendRadius;
uniform float bendStrength;
uniform float bendInfluence;

uniform bool parallax;
uniform float parallaxStrength;
uniform vec2 parallaxOffset;

uniform vec3 lineGradient[8];
uniform int lineGradientCount;

const vec3 BLACK = vec3(0.0);
const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;
const vec3 BLUE  = vec3(47.0,  75.0, 162.0) / 255.0;

mat2 rotate(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

vec3 background_color(vec2 uv) {
  vec3 col = vec3(0.0);

  float y = sin(uv.x - 0.2) * 0.3 - 0.1;
  float m = uv.y - y;

  col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));
  col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));
  return col * 0.5;
}

vec3 getLineColor(float t, vec3 baseColor) {
  if (lineGradientCount <= 0) {
    return baseColor;
  }

  vec3 gradientColor;

  if (lineGradientCount == 1) {
    gradientColor = lineGradient[0];
  } else {
    float clampedT = clamp(t, 0.0, 0.9999);
    float scaled = clampedT * float(lineGradientCount - 1);
    int idx = int(floor(scaled));
    float f = fract(scaled);
    int idx2 = min(idx + 1, lineGradientCount - 1);

    vec3 c1 = lineGradient[idx];
    vec3 c2 = lineGradient[idx2];

    gradientColor = mix(c1, c2, f);
  }

  return gradientColor * 0.5;
}

float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {
  float time = iTime * animationSpeed;

  float x_offset   = offset;
  float x_movement = time * 0.1;
  float amp        = sin(offset + time * 0.2) * 0.3;
  float y          = sin(uv.x + x_offset + x_movement) * amp;

  if (shouldBend) {
    vec2 d = screenUv - mouseUv;
    float influence = exp(-dot(d, d) * bendRadius);
    float bendOffset = (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
    y += bendOffset;
  }

  float m = uv.y - y;
  return 0.0175 / max(abs(m) + 0.01, 1e-3) + 0.01;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  baseUv.y *= -1.0;

  if (parallax) {
    baseUv += parallaxOffset;
  }

  vec3 col = vec3(0.0);

  vec3 b = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);

  vec2 mouseUv = vec2(0.0);
  if (interactive) {
    mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y;
    mouseUv.y *= -1.0;
  }

  if (enableBottom) {
    for (int i = 0; i < bottomLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(bottomLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = bottomWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      col += lineCol * wave(
        ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y),
        1.5 + 0.2 * fi,
        baseUv,
        mouseUv,
        interactive
      ) * 0.2;
    }
  }

  if (enableMiddle) {
    for (int i = 0; i < middleLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(middleLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = middleWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      col += lineCol * wave(
        ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y),
        2.0 + 0.15 * fi,
        baseUv,
        mouseUv,
        interactive
      );
    }
  }

  if (enableTop) {
    for (int i = 0; i < topLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(topLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = topWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      ruv.x *= -1.0;
      col += lineCol * wave(
        ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y),
        1.0 + 0.2 * fi,
        baseUv,
        mouseUv,
        interactive
      ) * 0.1;
    }
  }

  fragColor = vec4(col, 1.0);
}

void main() {
  vec4 color = vec4(0.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}
`;

const MAX_GRADIENT_STOPS = 8;

function hexToVec3(hex) {
  let value = (hex || '').trim();
  if (value.startsWith('#')) value = value.slice(1);

  let r = 255, g = 255, b = 255;

  if (value.length === 3) {
    r = parseInt(value[0] + value[0], 16);
    g = parseInt(value[1] + value[1], 16);
    b = parseInt(value[2] + value[2], 16);
  } else if (value.length === 6) {
    r = parseInt(value.slice(0, 2), 16);
    g = parseInt(value.slice(2, 4), 16);
    b = parseInt(value.slice(4, 6), 16);
  }

  return new Vector3(r / 255, g / 255, b / 255);
}

function computeCounts(enabledWaves, lineCount, lineDistance) {
  const waves = Array.isArray(enabledWaves) ? enabledWaves : ['top', 'middle', 'bottom'];

  const getLineCount = (waveType) => {
    if (typeof lineCount === 'number') return lineCount;
    if (!waves.includes(waveType)) return 0;
    const index = waves.indexOf(waveType);
    return lineCount?.[index] ?? 6;
  };

  const getLineDistance = (waveType) => {
    if (typeof lineDistance === 'number') return lineDistance;
    if (!waves.includes(waveType)) return 0.1;
    const index = waves.indexOf(waveType);
    return lineDistance?.[index] ?? 0.1;
  };

  const topLineCount = waves.includes('top') ? getLineCount('top') : 0;
  const middleLineCount = waves.includes('middle') ? getLineCount('middle') : 0;
  const bottomLineCount = waves.includes('bottom') ? getLineCount('bottom') : 0;

  const topLineDistance = waves.includes('top') ? getLineDistance('top') * 0.01 : 0.01;
  const middleLineDistance = waves.includes('middle') ? getLineDistance('middle') * 0.01 : 0.01;
  const bottomLineDistance = waves.includes('bottom') ? getLineDistance('bottom') * 0.01 : 0.01;

  return {
    waves,
    topLineCount,
    middleLineCount,
    bottomLineCount,
    topLineDistance,
    middleLineDistance,
    bottomLineDistance
  };
}

export default function FloatingLines({
  linesGradient,
  enabledWaves = ['top', 'middle', 'bottom'],
  lineCount = [6],
  lineDistance = [5],
  topWavePosition,
  middleWavePosition,
  bottomWavePosition = { x: 2.0, y: -0.7, rotate: -1 },
  animationSpeed = 1,
  interactive = true,
  bendRadius = 5.0,
  bendStrength = -0.5,
  mouseDamping = 0.05,
  parallax = true,
  parallaxStrength = 0.2,
  mixBlendMode = 'screen'
}) {
  const containerRef = useRef(null);

  // souris & parallax (refs pour ne pas recréer les handlers)
  const targetMouseRef = useRef(new Vector2(-1000, -1000));
  const currentMouseRef = useRef(new Vector2(-1000, -1000));
  const targetInfluenceRef = useRef(0);
  const currentInfluenceRef = useRef(0);

  const targetParallaxRef = useRef(new Vector2(0, 0));
  const currentParallaxRef = useRef(new Vector2(0, 0));

  // settings dynamiques (évite de relancer le WebGL)
  const settingsRef = useRef({
    interactive,
    parallax,
    parallaxStrength,
    mouseDamping
  });

  // objets Three persistants
  const threeRef = useRef({
    renderer: null,
    scene: null,
    camera: null,
    geometry: null,
    material: null,
    mesh: null,
    uniforms: null,
    clock: null,
    ro: null,
    raf: 0,
    disposed: false
  });

  // initialisation WebGL — 1 fois
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    // guard StrictMode: si el a disparu
    if (!containerRef.current) {
      renderer.dispose();
      return;
    }
    containerRef.current.appendChild(renderer.domElement);

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Vector3(1, 1, 1) },
      animationSpeed: { value: animationSpeed },

      enableTop: { value: true },
      enableMiddle: { value: true },
      enableBottom: { value: true },

      topLineCount: { value: 6 },
      middleLineCount: { value: 6 },
      bottomLineCount: { value: 6 },

      topLineDistance: { value: 0.05 },
      middleLineDistance: { value: 0.05 },
      bottomLineDistance: { value: 0.05 },

      topWavePosition: { value: new Vector3(10.0, 0.5, -0.4) },
      middleWavePosition: { value: new Vector3(5.0, 0.0, 0.2) },
      bottomWavePosition: { value: new Vector3(2.0, -0.7, 0.4) },

      iMouse: { value: new Vector2(-1000, -1000) },
      interactive: { value: interactive },
      bendRadius: { value: bendRadius },
      bendStrength: { value: bendStrength },
      bendInfluence: { value: 0 },

      parallax: { value: parallax },
      parallaxStrength: { value: parallaxStrength },
      parallaxOffset: { value: new Vector2(0, 0) },

      lineGradient: {
        value: Array.from({ length: MAX_GRADIENT_STOPS }, () => new Vector3(1, 1, 1))
      },
      lineGradientCount: { value: 0 }
    };

    const material = new ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader
    });

    const geometry = new PlaneGeometry(2, 2);
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    const clock = new Clock();

    const setSize = () => {
      const host = containerRef.current;
      if (!host || threeRef.current.disposed) return;

      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;

      renderer.setSize(w, h, false);

      const cw = renderer.domElement.width;
      const ch = renderer.domElement.height;
      uniforms.iResolution.value.set(cw, ch, 1);
    };

    setSize();

    // ResizeObserver safe
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!containerRef.current || threeRef.current.disposed) return;
          setSize();
        })
      : null;

    if (ro) ro.observe(containerRef.current);

    const handlePointerMove = (event) => {
      const { interactive: inter, parallax: para, parallaxStrength: ps } = settingsRef.current;
      if (!inter && !para) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dpr = renderer.getPixelRatio();

      if (inter) {
        targetMouseRef.current.set(x * dpr, (rect.height - y) * dpr);
        targetInfluenceRef.current = 1.0;
      }

      if (para) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetX = (x - centerX) / rect.width;
        const offsetY = -(y - centerY) / rect.height;
        targetParallaxRef.current.set(offsetX * ps, offsetY * ps);
      }
    };

    const handlePointerLeave = () => {
      if (!settingsRef.current.interactive) return;
      targetInfluenceRef.current = 0.0;
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    const renderLoop = () => {
      if (threeRef.current.disposed) return;

      uniforms.iTime.value = clock.getElapsedTime();

      const { interactive: inter, parallax: para, mouseDamping: md } = settingsRef.current;

      if (inter) {
        currentMouseRef.current.lerp(targetMouseRef.current, md);
        uniforms.iMouse.value.copy(currentMouseRef.current);

        currentInfluenceRef.current += (targetInfluenceRef.current - currentInfluenceRef.current) * md;
        uniforms.bendInfluence.value = currentInfluenceRef.current;
      } else {
        // pas d'interaction : influence = 0 (stable)
        uniforms.bendInfluence.value = 0;
      }

      if (para) {
        currentParallaxRef.current.lerp(targetParallaxRef.current, md);
        uniforms.parallaxOffset.value.copy(currentParallaxRef.current);
      } else {
        uniforms.parallaxOffset.value.set(0, 0);
      }

      renderer.render(scene, camera);
      threeRef.current.raf = requestAnimationFrame(renderLoop);
    };

    // stocke refs
    threeRef.current.renderer = renderer;
    threeRef.current.scene = scene;
    threeRef.current.camera = camera;
    threeRef.current.geometry = geometry;
    threeRef.current.material = material;
    threeRef.current.mesh = mesh;
    threeRef.current.uniforms = uniforms;
    threeRef.current.clock = clock;
    threeRef.current.ro = ro;
    threeRef.current.disposed = false;

    threeRef.current.raf = requestAnimationFrame(renderLoop);

    return () => {
      // cleanup StrictMode-safe
      threeRef.current.disposed = true;

      cancelAnimationFrame(threeRef.current.raf);

      if (ro) ro.disconnect();

      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);

      geometry.dispose();
      material.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }

      // reset refs
      threeRef.current.renderer = null;
      threeRef.current.scene = null;
      threeRef.current.camera = null;
      threeRef.current.geometry = null;
      threeRef.current.material = null;
      threeRef.current.mesh = null;
      threeRef.current.uniforms = null;
      threeRef.current.clock = null;
      threeRef.current.ro = null;
      threeRef.current.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Mise à jour des uniforms quand les props changent (sans recréer WebGL)
  useEffect(() => {
    // update settings refs (utilisées dans handlers/loop)
    settingsRef.current = {
      interactive,
      parallax,
      parallaxStrength,
      mouseDamping
    };

    const el = containerRef.current;
    if (el) el.style.mixBlendMode = mixBlendMode || 'screen';

    const uniforms = threeRef.current.uniforms;
    if (!uniforms) return;

    const counts = computeCounts(enabledWaves, lineCount, lineDistance);

    uniforms.animationSpeed.value = animationSpeed;

    uniforms.enableTop.value = counts.waves.includes('top');
    uniforms.enableMiddle.value = counts.waves.includes('middle');
    uniforms.enableBottom.value = counts.waves.includes('bottom');

    uniforms.topLineCount.value = counts.topLineCount;
    uniforms.middleLineCount.value = counts.middleLineCount;
    uniforms.bottomLineCount.value = counts.bottomLineCount;

    uniforms.topLineDistance.value = counts.topLineDistance;
    uniforms.middleLineDistance.value = counts.middleLineDistance;
    uniforms.bottomLineDistance.value = counts.bottomLineDistance;

    uniforms.topWavePosition.value.set(
      topWavePosition?.x ?? 10.0,
      topWavePosition?.y ?? 0.5,
      topWavePosition?.rotate ?? -0.4
    );

    uniforms.middleWavePosition.value.set(
      middleWavePosition?.x ?? 5.0,
      middleWavePosition?.y ?? 0.0,
      middleWavePosition?.rotate ?? 0.2
    );

    uniforms.bottomWavePosition.value.set(
      bottomWavePosition?.x ?? 2.0,
      bottomWavePosition?.y ?? -0.7,
      bottomWavePosition?.rotate ?? 0.4
    );

    uniforms.interactive.value = !!interactive;
    uniforms.bendRadius.value = bendRadius;
    uniforms.bendStrength.value = bendStrength;

    uniforms.parallax.value = !!parallax;
    uniforms.parallaxStrength.value = parallaxStrength;

    // gradient lines
    if (linesGradient && Array.isArray(linesGradient) && linesGradient.length > 0) {
      const stops = linesGradient.slice(0, MAX_GRADIENT_STOPS);
      uniforms.lineGradientCount.value = stops.length;

      stops.forEach((hex, i) => {
        const c = hexToVec3(hex);
        uniforms.lineGradient.value[i].set(c.x, c.y, c.z);
      });

      for (let i = stops.length; i < MAX_GRADIENT_STOPS; i++) {
        uniforms.lineGradient.value[i].set(1, 1, 1);
      }
    } else {
      uniforms.lineGradientCount.value = 0;
      for (let i = 0; i < MAX_GRADIENT_STOPS; i++) {
        uniforms.lineGradient.value[i].set(1, 1, 1);
      }
    }
  }, [
    linesGradient,
    enabledWaves,
    lineCount,
    lineDistance,
    topWavePosition,
    middleWavePosition,
    bottomWavePosition,
    animationSpeed,
    interactive,
    bendRadius,
    bendStrength,
    mouseDamping,
    parallax,
    parallaxStrength,
    mixBlendMode
  ]);

  return (
    <div ref={containerRef} className="floating-lines-container" />
  );
}
