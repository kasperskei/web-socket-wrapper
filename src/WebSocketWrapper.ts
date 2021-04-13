import { nanoid } from 'nanoid'
import { EventEmitter, EventName, EventHandler } from './EventEmitter'

export interface IMessage {
  requestId?: string
  eventName?: EventName
  args?: any[],
  data?: Record<string, any>,
  error?: Error | any,
}

export interface RequestPromise extends Promise<any> {
  reject: (value?: any) => void
  resolve: (reason?: any) => void
  id: string
  timeoutId: number
}

export class WebSocketWrapper {
  /** Очередь сообщений для отправки */
  private readonly queue: any[] = []

  /** Запросы, ожидающие ответа */
  private readonly pending: Map<string, RequestPromise> = new Map()

  /** Хранилище состояний для сокет соединения */
  private readonly state: Map<string, any> = new Map()

  private readonly emitter: EventEmitter = new EventEmitter()

  private readonly requestTimeout = 10000

  constructor(
    private socket: WebSocket,
  ) {
    this.bind(socket)
  }

  get connecting() { return this.socket.readyState === this.socket.CONNECTING }
  get connected() { return this.socket.readyState === this.socket.OPEN }
  get closing() { return this.socket.readyState === this.socket.CLOSING }
  get closed() { return this.socket.readyState === this.socket.CLOSED }

  private runQueue() {
    while (this.queue.length) {
      const message = this.queue.shift()
      this.send(message)
    }
  }

  bind(socket: WebSocket) {
    if (this.socket) {
      const s = this.socket
      s.onopen = s.onmessage = s.onerror = s.onclose = null
    }

    this.socket = socket

    socket.onopen = (event) => {
      this.runQueue()
    }

    socket.onmessage = (event) => {
      const message = this.deserialize(event.data)

      if (message.requestId !== undefined && this.pending.has(message.requestId)) {
        const request = this.pending.get(message.requestId)!

        if (message.error !== undefined) {
          request.reject(message.error)
        } else {
          request.resolve(message.data)
        }
      }

      /** @ts-ignore */
      this.emitter.emit(message.eventName ?? '', message)
    }

    /** If the socket is already open, send all pending messages now */
    if (this.connected) {
      this.runQueue()
    }

    return this
  }

  private serialize({
    requestId,
    eventName,
    args = [],
    data,
    error,
  }: IMessage): string {
    return JSON.stringify({
      i: requestId,
      a: [eventName, ...args],
      d: data,
      e: error,
    })
  }

  private deserialize(raw: string): IMessage {
    const m = JSON.parse(raw)

    return {
      requestId: m.i,
      eventName: m.a.shift(),
      args: m.a,
      data: m.d,
      error: m.e,
    }
  }

  send(message: string) {
    if (this.connected) {
      this.socket.send(message)
    } else {
      this.queue.push(message)
    }
    return this
  }

  sendEvent(eventName: EventName, args: any[]) {
    const message = this.serialize({ eventName, args })
    this.send(message)
  }

  sendRequest(eventName: EventName, args: any[]) {
    const requestId = nanoid()
    const message = this.serialize({ requestId, eventName, args })

    let _resolve: (value: any) => void
    let _reject: (reason?: any) => void

    const request = new Promise((resolve, reject) => {
      _resolve = resolve
      _reject = reject
    }) as RequestPromise

    request.id = requestId
    request.resolve = _resolve!
    request.reject = _reject!
    request.timeoutId = this.requestTimeout > 0
      ? setTimeout(() => {
        this.pending.delete(requestId)
        _reject(new Error('Request timed out'))
      }, this.requestTimeout)
      : 0

    this.pending.set(requestId, request)
    this.send(message)

    return request
  }

  sendResolve(requestId: string, data: Record<string, any>): void {
    const message = this.serialize({ requestId, data })
    this.send(message)
  }

  sendReject(requestId: string, error: Error | any): void {
    const message = this.serialize({ requestId, error })
    this.send(message)
  }

  private wrapHandler(handler: EventHandler): (message: IMessage) => void {
    return async (message: IMessage) => {
      const { requestId } = message

      try {
        /** @ts-ignore */
        const data = await handler(...message.args ?? [])

        if (requestId) {
          /** @ts-ignore */
          this.sendResolve(requestId, data as Record<string, any>)
        }
      } catch (error) {
        if (requestId) {
          this.sendReject(requestId, error)
        }

        throw error
      }
    }
  }

  on(eventName: EventName, handler: EventHandler) {
    return this.emitter.on(eventName, this.wrapHandler(handler))
  }

  /**
   * @todo Удалять wrappedListener
   * @returns функция удаления слушателя
   */
  off(eventName: EventName, handler: EventHandler): boolean {
    return this.emitter.off(eventName, handler)
  }

  /** Достать значение состояния сокета по ключу */
  get<T>(key: string): T {
    return this.state.get(key)
  }

  /** Сохранить значение состояния сокета по ключу */
  set<T>(key: string, value: T): void {
    this.state.set(key, value)
  }
}
