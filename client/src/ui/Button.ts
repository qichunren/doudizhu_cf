import { Container, Graphics, Text, TextStyle } from 'pixi.js'

interface ButtonOptions {
  text: string
  width?: number
  height?: number
  onClick: () => void
}

export class Button extends Container {
  private bg: Graphics
  private label: Text
  private onClick: () => void

  constructor({ text, width = 240, height = 56, onClick }: ButtonOptions) {
    super()
    this.onClick = onClick

    this.bg = new Graphics()
    this.bg.roundRect(0, 0, width, height, 12)
    this.bg.fill({ color: 0x4a90d9 })
    this.addChild(this.bg)

    this.label = new Text({
      text,
      style: new TextStyle({
        fontFamily: 'Arial',
        fontSize: 24,
        fill: '#ffffff',
        fontWeight: 'bold',
      }),
    })
    this.label.anchor.set(0.5)
    this.label.x = width / 2
    this.label.y = height / 2
    this.addChild(this.label)

    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.on('pointerover', () => {
      this.bg.tint = 0xcccccc
    })
    this.on('pointerout', () => {
      this.bg.tint = 0xffffff
    })
    this.on('pointertap', () => {
      this.onClick()
    })
  }
}
