
import { Operation } from './encoding/enums';
import { createArrayProxy } from './types/array';
import { createSetProxy } from './types/set';
import { createMapProxy } from './types/map';
import { OperationManager } from './encoding/operationManager';
import { createRecordProxy, isRecord } from './types/record';

export const __propertyToIndex = Symbol('propertyToIndex');
export const __operationManager = Symbol('operationManager');
export const __indexToProperty = Symbol('indexToProperty');

/*
    MESSAGE FORMAT:

    ReferenceId,
    Operation,
    Index,

    === PATH
    BeginPath
    PathLength
    Path
    === NO PATH
    NoPath
    ===

    Object
*/
const SYNCED_PROPERTIES = Symbol('SYNCED_PROPERTIES');

function internallyCreateProxySetter(
    propertyName: string,
    values: Map<object, Map<string, any>>,
    initialized: Map<object, Set<string>>,
    path: any[] = [],
    multiplePath: any[] = []
) {
    return function(this: any, newVal: any) {
        createProxySetter.call(this, propertyName, values, initialized, path, multiplePath, newVal);
    }
}

export function createProxySetter(
    this: any,
    propertyName: string,
    values: Map<object, Map<string, any>>,
    initialized: Map<object, Set<string>>,
    path: any[] = [],
    multiplePath: any[] = [],
    newVal: any
) {

    if (!values.has(this))
        values.set(this, new Map<string, any>());
    if (!initialized.has(this))
        initialized.set(this, new Set<string>());

    const instanceValues = values.get(this)!;
    const instanceInitialized = initialized.get(this)!;
    //const oldValue = instanceValues.get(propertyName);

    if (!instanceInitialized.has(propertyName)) {
        instanceInitialized.add(propertyName);
    } else {
        const encodeIndex = this[__propertyToIndex]?.get(propertyName);
        this[__operationManager]?.encodeAnything(encodeIndex, Operation.Reset, newVal);
    }

    // Wrap arrays, maps, and nested schemas in proxies
    // No need to proxy schemas; since referece ids reference directly to schemas
    //                           through OperationManager

    if (newVal instanceof Array) {
        newVal = createArrayProxy(this, propertyName, newVal, true, path, multiplePath);
    } else if (newVal instanceof Map) {
        newVal = createMapProxy(this, values, initialized, propertyName, path, newVal, multiplePath);
    } else if (newVal instanceof Set) {
        newVal = createSetProxy(this, propertyName, newVal);
    } else if (isRecord(newVal)) {
        newVal = createRecordProxy(this, propertyName, newVal, true);
    } else {
        const encodeIndex = this[__propertyToIndex]?.get(propertyName);
        this[__operationManager]?.encodeAnything(encodeIndex, Operation.Reset, newVal);
    }

    instanceValues.set(propertyName, newVal);
    return newVal;
}

export function sync() {
    const values = new Map<object, Map<string, any>>();
    const initialized = new Map<object, Set<string>>();

    return function(target: any, propertyName: string) {
        // Ensure the target has a SYNCED_PROPERTIES metadata key
        if (!target.constructor[SYNCED_PROPERTIES]) {
            target.constructor[SYNCED_PROPERTIES] = new Set<string>();
        }
        // Add the propertyKey to the SYNCED_PROPERTIES set
        target.constructor[SYNCED_PROPERTIES].add(propertyName);

        const getter = function(this: any) {
            const instanceValues = values.get(this);
            return instanceValues ? instanceValues.get(propertyName) : undefined;
        };


        Object.defineProperty(target, propertyName, {
            get: getter,
            set: internallyCreateProxySetter(propertyName, values, initialized),
            enumerable: true,
            configurable: true
        });
    };
}

function schemaConstructor<T extends { new(...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
        private  [__propertyToIndex]: Map<number, string | symbol> = new Map();
        private [__operationManager]: OperationManager;
        private  [__indexToProperty]: string[] = [];

        constructor(...args: any[]) {
            super(...args);

            // Call the initialValues setting only if there are initial values
            const initialValues = args[0] || {};
            Object.keys(initialValues).forEach(key => (this as any)[key] = initialValues[key]);

            this[__operationManager] = new OperationManager(this as any);
            this.indexProperties();
        }

        private indexProperties() {
            const syncedProperties: Set<string> = (this.constructor as any)[SYNCED_PROPERTIES] || new Set();

            // Assign an index to each property
            let index = 0;
            syncedProperties.forEach(property => {
                this[__indexToProperty].push(property);
                (this as any)[__propertyToIndex].set(property, index);

                index++;
            });
        }
    };
}

@schemaConstructor
export class Schema {
    assign(properties: Record<string, any>) {
        for (const [key, value] of Object.entries(properties))
            this[key] = value;

        // return for chaining
        return this;
    }
}
