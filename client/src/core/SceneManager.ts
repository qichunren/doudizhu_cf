import { Application, Container } from 'pixi.js'

export abstract class Scene {
  container = new Container()
  constructor(protected app: Application) {}
  onEnter(): void {}
  onExit(): void {}
  onResize(): void {}
}

export class SceneManager {
  private scenes = new Map<string, Scene>()
  private currentScene: Scene | null = null
  private isTransitioning = false

  constructor(private app: Application) {
    window.addEventListener('resize', this.handleResize)
  }

  add(name: string, scene: Scene): void {
    this.scenes.set(name, scene)
    scene.container.visible = false
    scene.container.alpha = 0
    this.app.stage.addChild(scene.container)
  }

  async switchTo(name: string): Promise<void> {
    if (this.isTransitioning) return
    const next = this.scenes.get(name)
    if (!next || next === this.currentScene) return

    this.isTransitioning = true
    const prev = this.currentScene

    prev?.onExit()
    next.onEnter()

    next.container.visible = true
    next.container.alpha = 0

    this.app.stage.removeChild(next.container)
    this.app.stage.addChild(next.container)

    const duration = 200
    const startTime = performance.now()

    return new Promise((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - startTime
        const t = Math.min(elapsed / duration, 1)
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        if (prev) prev.container.alpha = 1 - eased
        next.container.alpha = eased

        if (t < 1) {
          requestAnimationFrame(tick)
        } else {
          if (prev) {
            prev.container.visible = false
            prev.container.alpha = 0
          }
          this.currentScene = next
          this.isTransitioning = false
          resolve()
        }
      }
      requestAnimationFrame(tick)
    })
  }

  private handleResize = (): void => {
    this.currentScene?.onResize()
  }
}
