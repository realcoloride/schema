import { isRecord } from "./record";
import { createProxySetter } from "../Schema";
import { Operation } from '../encoding/enums';

export function createMapProxy<K, V>(
    schema: any, 
    values: Map<object, Map<string, any>>,
    initialized: Map<object, Set<string>>,
    propertyName: string, 
    path: any[], 
    map: Map<K, V>,
    multiplePath: any[]
) {
    return new Proxy(map, {
        get(target, property, receiver) {
            if (typeof target[property as keyof typeof target] === 'function') {
                const methodName = String(property);
                return (...args: any[]) => {
                    let result;

                    if (methodName === 'clear') {
                        const encodeIndex = schema?.__propertyToIndex?.get(propertyName);
                        schema?.__operationManager?.encodeMapMethod(encodeIndex, methodName, Operation.MapClear, [], multiplePath, []);
                        result = target.clear(); // Perform the actual clear operation
                    } else if (methodName === "get") {
                        result = (target[property as keyof typeof target] as Function).apply(target, args);
                        const key = args[0];

                        if (result instanceof Array) {
                            path.push(key);  // Prioritize path for arrays
                        } else if (result instanceof Map || isRecord(result) || result instanceof Set) {
                            multiplePath.push(key);  // Use multiplePath for nested structures
                            result = createProxySetter.call(schema, propertyName, values, initialized, path, multiplePath, result);
                        }
                    } else {
                        result = (target[property as keyof typeof target] as Function).apply(target, args);
                    }

                    return result;
                };
            }

            return Reflect.get(target, property, receiver);
        },

        set(target, property, value, receiver) {
            // Handle regular set operations (not encoded here)
            createProxySetter.call(schema, propertyName, values, initialized, path, multiplePath, value);
            return Reflect.set(target, property, value, receiver);
        },

        deleteProperty(target, property) {
            const encodeIndex = schema?.__propertyToIndex?.get(propertyName);
            schema?.__operationManager?.encodeMapMethod(encodeIndex, "delete", Operation.MapDelete, [property], multiplePath, []);

            return Reflect.deleteProperty(target, property);
        }
    });
}
