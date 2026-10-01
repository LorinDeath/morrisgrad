// shaders.ts - WebGL Post-Processing & Dynamic Lighting / Shader Effects Engine

export interface LightSource {
  screenX: number;
  screenY: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
}

export interface ShockwaveEffect {
  screenX: number;
  screenY: number;
  radius: number;
  maxRadius: number;
  intensity: number;
  life: number;
}

const VERT_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  // Invert Y for canvas texture coords
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG_SHADER_SOURCE = `
precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_phase; // 0.0=day, 0.5=dusk, 1.0=night, 2.0=blood wave
uniform float u_hero_hp_ratio;
uniform vec4 u_shockwave; // x, y, radius, intensity (in screen pixels)

// Up to 8 dynamic lights: pos.xy, radius, intensity
uniform vec4 u_lights[8];
uniform vec3 u_light_colors[8];
uniform int u_num_lights;

void main() {
  vec2 uv = v_uv;
  vec2 pixelPos = v_uv * u_resolution;

  // 1. Shockwave refraction
  if (u_shockwave.w > 0.01) {
    vec2 swCenter = u_shockwave.xy;
    float swDist = distance(pixelPos, swCenter);
    float swDiff = swDist - u_shockwave.z;
    if (abs(swDiff) < 35.0) {
      float factor = sin(swDiff * 0.15) * u_shockwave.w * 0.025;
      vec2 dir = normalize(pixelPos - swCenter);
      uv += dir * factor;
    }
  }

  vec4 sceneColor = texture2D(u_scene, uv);

  // 2. Ambient Day/Night Lighting
  // Day = crisp golden sunlight, Dusk = amber, Night = deep royal blue, Blood = dark crimson
  vec3 dayAmbient = vec3(1.02, 1.02, 1.0);
  vec3 duskAmbient = vec3(1.05, 0.85, 0.7);
  vec3 nightAmbient = vec3(0.18, 0.22, 0.42);
  vec3 bloodAmbient = vec3(0.45, 0.15, 0.22);

  vec3 ambient;
  if (u_phase < 0.5) {
    ambient = mix(dayAmbient, duskAmbient, u_phase * 2.0);
  } else if (u_phase < 1.0) {
    ambient = mix(duskAmbient, nightAmbient, (u_phase - 0.5) * 2.0);
  } else {
    ambient = mix(nightAmbient, bloodAmbient, min(1.0, u_phase - 1.0));
  }

  // 3. Dynamic Point Lights (Torches, Hero aura, Fire arrows, Spells)
  vec3 lightAccum = ambient;

  for (int i = 0; i < 8; i++) {
    if (i >= u_num_lights) break;
    vec2 lightPos = u_lights[i].xy;
    float radius = u_lights[i].z;
    float intensity = u_lights[i].w;

    float d = distance(pixelPos, lightPos);
    if (d < radius) {
      // Natural quadratic light attenuation with warm flicker
      float atten = clamp(1.0 - (d / radius), 0.0, 1.0);
      atten = atten * atten;
      float flicker = 1.0 + sin(u_time * 8.0 + float(i) * 2.3) * 0.06;
      lightAccum += u_light_colors[i] * (atten * intensity * flicker);
    }
  }

  // 4. Low Health Red Pulsing Vignette
  if (u_hero_hp_ratio < 0.35) {
    float vignetteDist = distance(uv, vec2(0.5, 0.5));
    float pulse = 0.5 + 0.5 * sin(u_time * 6.0);
    float vignetteStrength = smoothstep(0.4, 0.85, vignetteDist) * (1.0 - u_hero_hp_ratio / 0.35) * pulse * 0.8;
    sceneColor.rgb = mix(sceneColor.rgb, vec3(0.85, 0.05, 0.05), vignetteStrength);
  }

  // Final composite
  vec3 finalColor = sceneColor.rgb * lightAccum;
  gl_FragColor = vec4(finalColor, sceneColor.a);
}
`;

export class ShaderRenderer {
  private glCanvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;

  private isSupported: boolean = false;
  private shockwaves: ShockwaveEffect[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.glCanvas = canvas;
    this.initGL();
  }

  private initGL() {
    try {
      this.gl = this.glCanvas.getContext('webgl', { alpha: false, depth: false, antialias: false });
      if (!this.gl) {
        console.warn('[ShaderRenderer] WebGL not supported. Canvas 2D fallback active.');
        this.isSupported = false;
        return;
      }

      this.program = this.createProgram(VERT_SHADER_SOURCE, FRAG_SHADER_SOURCE);
      if (!this.program) {
        this.isSupported = false;
        return;
      }

      this.initBuffers();
      this.initTexture();
      this.isSupported = true;
    } catch (e) {
      this.isSupported = false;
    }
  }

  private createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.warn('[ShaderRenderer] Shader error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram | null {
    if (!this.gl) return null;
    const vert = this.createShader(this.gl.VERTEX_SHADER, vertSrc);
    const frag = this.createShader(this.gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;

    const prog = this.gl.createProgram();
    if (!prog) return null;
    this.gl.attachShader(prog, vert);
    this.gl.attachShader(prog, frag);
    this.gl.linkProgram(prog);

    if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
      console.warn('[ShaderRenderer] Program link error:', this.gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  private initBuffers() {
    if (!this.gl || !this.program) return;
    const posBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer);
    // Full screen triangle strip
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    const aPos = this.gl.getAttribLocation(this.program, 'a_position');
    this.gl.enableVertexAttribArray(aPos);
    this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
  }

  private initTexture() {
    if (!this.gl) return;
    this.texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
  }

  public addShockwave(screenX: number, screenY: number, maxRadius: number = 180) {
    this.shockwaves.push({
      screenX,
      screenY,
      radius: 0,
      maxRadius,
      intensity: 1.0,
      life: 0.45
    });
  }

  public update(dt: number) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      sw.radius += (sw.maxRadius / 0.45) * dt;
      sw.intensity = Math.max(0, sw.life / 0.45);
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  public render(
    sourceCanvas: HTMLCanvasElement, 
    phase: number, 
    heroHpRatio: number, 
    lights: LightSource[],
    time: number
  ) {
    if (!this.isSupported || !this.gl || !this.program) {
      return;
    }

    const gl = this.gl;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.useProgram(this.program);

    // Update scene texture from 2D canvas
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

    // Uniforms
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_scene'), 0);
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.glCanvas.width, this.glCanvas.height);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_time'), time);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_phase'), phase);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_hero_hp_ratio'), heroHpRatio);

    // Shockwave uniform (use latest active shockwave)
    const sw = this.shockwaves[0];
    if (sw) {
      gl.uniform4f(gl.getUniformLocation(this.program, 'u_shockwave'), sw.screenX, sw.screenY, sw.radius, sw.intensity);
    } else {
      gl.uniform4f(gl.getUniformLocation(this.program, 'u_shockwave'), 0, 0, 0, 0);
    }

    // Lights
    const numLights = Math.min(lights.length, 8);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_num_lights'), numLights);

    const lightArr: number[] = [];
    const colorArr: number[] = [];
    for (let i = 0; i < 8; i++) {
      if (i < lights.length) {
        const l = lights[i];
        lightArr.push(l.screenX, l.screenY, l.radius, l.intensity);
        colorArr.push(l.r, l.g, l.b);
      } else {
        lightArr.push(0, 0, 0, 0);
        colorArr.push(0, 0, 0);
      }
    }

    gl.uniform4fv(gl.getUniformLocation(this.program, 'u_lights'), new Float32Array(lightArr));
    gl.uniform3fv(gl.getUniformLocation(this.program, 'u_light_colors'), new Float32Array(colorArr));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
