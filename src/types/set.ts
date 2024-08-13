export function createSetProxy<T>(schema: any, propertyName: string, set: Set<T>): Set<T> {
    return new Proxy(set, {
        get(target, property, receiver) {
            if (typeof target[property as keyof typeof target] === 'function') {
                return (...args: any[]) => {
                    console.log(`Method ${String(property)} called with arguments: ${args}`);
                    
                    const result = ((target as any)[property as keyof any[]] as Function).apply(target, args);
                    const encodeIndex = schema?.__propertyToIndex[propertyName];
                    schema?.__operationManager.encodeSetMethod(encodeIndex, String(property), undefined, args);

                    return result;
                };
            }
            return Reflect.get(target, property, receiver);
        }
    });
}