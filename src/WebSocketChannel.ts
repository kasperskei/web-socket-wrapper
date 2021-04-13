import { WebSocketWrapper } from './WebSocketWrapper'
import { EventName, EventHandler } from './EventEmitter'

export type ChannelName = string

export class WebSocketChannel {
  private readonly children: Map<ChannelName, WebSocketChannel> = new Map()

  constructor(
    private readonly wrapper: WebSocketWrapper,
    readonly name?: ChannelName,
    private readonly parent?: WebSocketChannel,
  ) {
  }

  get path(): string {
    return [this.parent?.path, this.name].filter(Boolean).join('/')
  }

  joinPath(eventName: EventName) {
    return [this.path, eventName].filter(Boolean).join('/')
  }

  emit(eventName: EventName, ...args: any[]) {
    this.wrapper.sendEvent(this.joinPath(eventName), args)
  }

  request(eventName: EventName, ...args: any[]) {
    return this.wrapper.sendRequest(this.joinPath(eventName), args)
  }

  on(eventName: EventName, handler: EventHandler) {
    return this.wrapper.on(this.joinPath(eventName), handler)
  }

  off(eventName: EventName, handler: EventHandler) {
    return this.wrapper.off(this.joinPath(eventName), handler)
  }

  of(name: ChannelName): WebSocketChannel {
    if (this.children.has(name)) {
      return this.children.get(name)!
    }

    const channel = new WebSocketChannel(this.wrapper, name, this)

    this.children.set(name, channel)

    return channel
  }
}
