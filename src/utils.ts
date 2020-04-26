import uuidV4 from 'uuid/v4';

/** Dummy GIF Data URI */
export const EMPTY_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

/** Generates a unique id. */
export const generateUniqueId = uuidV4;

/** Lazily binds a method in a class and overrides as bound results in instances. */
export const Bind: MethodDecorator = (target, key, descriptor) => {
  if(descriptor.get || descriptor.set)
    throw new TypeError(
      formatName(target, key) +
      ' has already defined a getter/setter, ' +
      'which is not suppported to use decorator to bind it, ' +
      'consider to manually use Function.bind() in the getter/setter.',
    );
  const { value: originalValue } = descriptor;
  if(typeof originalValue !== 'function')
    throw new TypeError(formatName(target, key) + ' is not a function.');
  const { writable, enumerable } = descriptor;
  const defineValue = (instance: any, value: any) => instance !== target && 
    Object.defineProperty(instance, key, {
      value, configurable: true, writable, enumerable,
    });
  descriptor.get = function(this: any) {
    const value = originalValue.bind(this);
    defineValue(this, value);
    return value;
  };
  if(writable) {
    descriptor.set = function(this: any, value: any) {
      defineValue(this, value);
    };
    delete descriptor.writable;
  }
  delete descriptor.value;
  return descriptor;
}

function formatName(target: unknown, key: PropertyKey) {
  if(target instanceof Function)
    return `${target.name}.${key.toString()}`;
  return `<${typeof target}>.${key.toString()}`;
}

export function mapClone<T>(value: T): T {
  return Object.assign({}, value);
}

export function mapRun<T, K extends keyof T>(this: K, value: T): void;
export function mapRun(this: PropertyKey, value: any) {
  return value[this]();
}

export function delay(ms: number): Promise<void>;
export function delay<T>(ms: number, value: T): Promise<T>;
export function delay(ms: number, value?: unknown) {
  return new Promise(resolve => setTimeout(resolve, ms, value));
}

export function delayFrame() {
  return new Promise<number>(resolve => requestAnimationFrame(resolve));
}

export function canvasToBlobAsync(canvas: HTMLCanvasElement | OffscreenCanvas, type?: string, quality?: number) {
  return canvas instanceof OffscreenCanvas ?
    canvas.convertToBlob({ type, quality }) :
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
}

export function preventDefault(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}
