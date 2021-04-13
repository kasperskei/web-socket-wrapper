export type EventName = string
export type EventHandler = <A extends unknown[], R extends unknown>(...args: A) => R

export class EventEmitter {
  constructor(
    private readonly handlers: Map<EventName, Set<EventHandler>> = new Map(),
  ) {
  }

  get eventNames(): string[] {
    return [...this.handlers]
      .filter(([, handlers]) => handlers.size)
      .map(([name]) => name)
  }

  emit(name: EventName, ...args: any[]): void {
    this.handlers.get(name)?.forEach((handler) => handler(...args))
  }

  /**
   * Если не переданы аргументы, то удаляет все слушатели
   * Если передано только название события, то удаляет все слушатели для указанного события
   * Если переданы оба аргумента, то удаляет все слушатель для указанного события
   * @returns флаг удаления слушателей
   */
  off(name?: EventName, handler?: EventHandler): boolean {
    if (name == undefined) {
      return this.handlers.clear(), true
    }

    if (handler == undefined) {
      return this.handlers.delete(name)
    }

    return this.handlers.get(name)?.delete(handler) ?? false
  }

  /**
   * @returns функция удаления слушателя
   */
  on(name: EventName, handler: EventHandler): () => boolean {
    if (this.handlers.has(name)) {
      this.handlers.get(name)!.add(handler)
    } else {
      this.handlers.set(name, new Set([handler]))
    }

    return () => this.off(name, handler)
  }
}
