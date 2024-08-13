import { Operation, OPERATION_ARRAY_METHODS_NAMES, OPERATION_ARRAY_METHODS } from './enums';

// This ensures you dont get results like [[[]]] when using nested arrays and just the result
const cleanNestedArrays = (array: any[], depth: number, count: number = 0): any[] => {
    if (depth == 0 || count == depth) 
        return array;
    
    count++;
    return cleanNestedArrays(array, depth, count);
}

// Determine the depth of an array
const getArrayDepth = (arr: any[]): number => {
    if (!Array.isArray(arr)) return 0;

    return 1 + Math.max(0, ...arr.map(getArrayDepth));
};

export const createArrayProxy = (schema: any, propertyName: string, array: any[], useGet: boolean, path: (string | number)[] = [], extraMultiPath: any[] | undefined, initialDepth: number = getArrayDepth(array)): any => {
    const maxDepth = initialDepth;

    return new Proxy(array, {
        get: (target, property) => {
            // Check if property is a valid array index
            if (!useGet && typeof property === 'string' && !isNaN(Number(property))) {
                const index = Number(property);
                if (Array.isArray(target[index]) && path.length < maxDepth)
                    return createArrayProxy(schema, propertyName, target[index], false, [...path, index], extraMultiPath, maxDepth);
            }
            
            const encodeIndex = schema?.__propertyToIndex.get(propertyName);
            const operationManager = schema?.__operationManager;

            // Check if the property is a function on the target
            if (!useGet && typeof target[property as keyof typeof target] === 'function') {
                // Return a function that logs the call and then calls the original method
                return (...args: any[]) => {
                    console.log(`Method at path [${[...path].join('][')}] ${String(property)} called with arguments: ${args}`);
                    
                    const result = (target[property as keyof any[]] as Function).apply(target, args);
                    operationManager?.encodeArrayMethod(encodeIndex, String(property), Operation.Reset, path, extraMultiPath, cleanNestedArrays(args, maxDepth));
                    return result;
                };
            }

            // Otherwise, return the property value
            return target[property as keyof any[]];
        },
        set: (target: any[], property: string | symbol, value: any) => {
            if (property === Symbol.unscopables) {
                console.warn(`Cannot assign to '${String(property)}' because it is a read-only property.`);
                return true;
            }

            const encodeIndex = schema?.__propertyToIndex.get(propertyName);
            const operationManager = schema?.__operationManager;

            // Check if property is a valid array index
            if (typeof property === 'string' && !isNaN(Number(property))) {
                const index = Number(property);
                // Log the change
                console.log(`Setting value at path [${[...path, index].join('][')}] to "${value}"`);
                if (Array.isArray(target) && Array.isArray(value)) {
                    const isDeep = path.length <= maxDepth;

                    // Handle nesting nested new arrays
                    if (value.length > 0) {
                        value.forEach((child) => {
                            if (Array.isArray(child) && isDeep)
                                value[index] = createArrayProxy(schema, propertyName, child, false, [...path, index], extraMultiPath, maxDepth);
                        });
                    }

                    // Check if current depth is less than maxDepth
                    target[index] = isDeep || Array.isArray(value) ? createArrayProxy(schema, propertyName, value, false, [...path, index], extraMultiPath, maxDepth) : value;

                }
                else target[index] = value;
                
                operationManager?.encodeArrayMethod(encodeIndex, undefined, Operation.Reset, [...path, index], extraMultiPath, cleanNestedArrays(value, maxDepth));
            } else (target as any)[property as keyof typeof target] = value;

            if (property === 'length') {
                console.log(`Array length changed to ${value}`);
                operationManager?.encodeArrayMethod(encodeIndex, undefined, Operation.ArrayResize, path, extraMultiPath, value);
            }

            return true;
        }
    });
};