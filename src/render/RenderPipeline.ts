import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  bloomStrengthFor,
  pixelRatioFor,
  shadowMapSizeFor,
  usePostFx,
  type VisualQuality,
  type VisualSettingsValues,
} from './VisualSettings'

/** Filmový grade 2026 — méně „candy“, víc kontrastu / chill teal. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.28 },
    uContrast: { value: 1.08 },
    uSat: { value: 0.98 },
    uWarm: { value: 0.01 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uContrast;
    uniform float uSat;
    uniform float uWarm;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = (col - 0.5) * uContrast + 0.5;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSat);
      col.r += uWarm;
      col.b -= uWarm * 0.65;
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - smoothstep(0.28, 0.98, d) * uVignette;
      gl_FragColor = vec4(col, c.a);
    }
  `,
}

/**
 * Kompletní render stack ve stylu arcade / Forza:
 * ACES tone map · env reflexe · bloom · color grade · stíny.
 */
export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private readonly bloomPass: UnrealBloomPass
  private readonly gradePass: ShaderPass
  private readonly renderPass: RenderPass
  private envRT: THREE.Texture | null = null
  private pmrem: THREE.PMREMGenerator
  private settings: VisualSettingsValues

  constructor(
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    settings: VisualSettingsValues,
  ) {
    this.settings = { ...settings }
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.quality !== 'perf',
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // Default: bez ACES/composer — plynulost. Cinematic zapne ACES + bloom.
    this.renderer.toneMapping = usePostFx(settings)
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = settings.shadows
    this.renderer.shadowMap.type =
      settings.quality === 'perf' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap
    this.renderer.info.autoReset = true
    this.applyPixelRatio(settings.quality)

    this.pmrem = new THREE.PMREMGenerator(this.renderer)

    this.composer = new EffectComposer(this.renderer)
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)

    const size = new THREE.Vector2()
    this.renderer.getSize(size)
    this.bloomPass = new UnrealBloomPass(
      size.clone(),
      bloomStrengthFor(settings.quality),
      0.48,
      0.88,
    )
    this.bloomPass.enabled = settings.bloom
    this.composer.addPass(this.bloomPass)

    this.gradePass = new ShaderPass(GradeShader)
    this.gradePass.enabled = settings.quality !== 'perf'
    this.composer.addPass(this.gradePass)

    this.composer.addPass(new OutputPass())
  }

  /** Env mapa pro balanced+ (lak aut); perf bez. */
  attachEnvironment(scene: THREE.Scene): void {
    if (this.settings.quality === 'perf') {
      scene.environment = null
      return
    }
    this.pmrem.compileEquirectangularShader()
    const envScene = new RoomEnvironment()
    this.envRT = this.pmrem.fromScene(envScene, 0.04).texture
    scene.environment = this.envRT
  }

  getSettings(): VisualSettingsValues {
    return { ...this.settings }
  }

  applySettings(settings: VisualSettingsValues, sun?: THREE.DirectionalLight): void {
    this.settings = { ...settings }
    this.renderer.shadowMap.enabled = settings.shadows
    this.renderer.shadowMap.type =
      settings.quality === 'perf' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap
    this.renderer.toneMapping = usePostFx(settings)
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.bloomPass.enabled = settings.bloom
    this.bloomPass.strength = bloomStrengthFor(settings.quality)
    this.gradePass.enabled = settings.quality !== 'perf'
    this.applyPixelRatio(settings.quality)
    if (sun) this.configureSunShadow(sun, settings)
  }

  configureSunShadow(sun: THREE.DirectionalLight, settings = this.settings): void {
    sun.castShadow = settings.shadows
    const mapSize = shadowMapSizeFor(settings.quality)
    sun.shadow.mapSize.set(mapSize, mapSize)
    // Menší frustum kolem auta (follow v SceneLightRig) = ostřejší stín, bez děr na Hrubý
    sun.shadow.bias = -0.00035
    sun.shadow.normalBias = 0.045
    sun.shadow.radius = settings.quality === 'perf' ? 1 : 2.5
    sun.shadow.camera.near = 10
    sun.shadow.camera.far = 380
    sun.shadow.camera.left = -95
    sun.shadow.camera.right = 95
    sun.shadow.camera.top = 95
    sun.shadow.camera.bottom = -95
    sun.shadow.camera.updateProjectionMatrix()
    if (sun.shadow.map) {
      sun.shadow.map.dispose()
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget
    }
  }

  setSize(cssW: number, cssH: number, internalScale = 1): void {
    const w = Math.max(1, Math.floor(cssW * internalScale))
    const h = Math.max(1, Math.floor(cssH * internalScale))
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = `${cssW}px`
    this.renderer.domElement.style.height = `${cssH}px`
    this.composer.setSize(w, h)
    this.bloomPass.resolution.set(w, h)
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (usePostFx(this.settings)) {
      this.renderPass.scene = scene
      this.renderPass.camera = camera as THREE.PerspectiveCamera
      this.composer.render()
    } else {
      this.renderer.render(scene, camera)
    }
  }

  dispose(): void {
    this.envRT?.dispose()
    this.pmrem.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }

  private applyPixelRatio(quality: VisualQuality): void {
    this.renderer.setPixelRatio(pixelRatioFor(quality))
  }
}
