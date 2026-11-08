# Klec Engine

Lehký **free** runtime ve stylu **Unity / Unreal**, postavený na Three.js. Žádný Unity/Unreal licence — jen vlastní jádro v `src/engine/`.

## Mapa pojmů

| Klec Engine | Unreal | Unity |
|-------------|--------|-------|
| `Engine` | GameInstance | Runtime / Application |
| `World` | UWorld | Scene |
| `Actor` | AActor | GameObject |
| `Component` | ActorComponent | MonoBehaviour |
| `RenderSubsystem` | Renderer module | URP / HDRP |
| `SceneLightRig` | Light actors | Light components |
| `Game` (GameMode) | GameMode | Scene scripts |

## Render (URP-like)

- ACES Filmic tone mapping  
- RoomEnvironment → PMREM (reflexe na clearcoat laku)  
- UnrealBloomPass + color grade / vignette  
- Soft shadows (PCF) na directional sun  
- Kvalita: Performance / Balanced / Cinematic (menu → Atmosféra)

## LOD / „Blender“

Geometrie je procedurální (ne FBX z Unreal). Vzdálené dekorace řeší `decor` off/simple/rich. Až budeš importovat mesh z Blenderu (free), stačí `Actor` + `Mesh` komponenta a Three.js `LOD`.

## Boot

```ts
const engine = new Engine({ canvas, visual })
// GameMode napojený přes engine.setGameTick + engine.start()
```
