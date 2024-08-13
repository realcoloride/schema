/**
 * Checks if the object acts like a Record or a JS dictionary object like
 * @param object 
 * @returns If it is a record/dictionary object like
 */
export function isRecord(object: any): boolean {
    return object !== null && typeof object === 'object' && !Array.isArray(object) && !(object instanceof Function);
}

// can be a record<K,V> or a {} dictionary/record like object
export const createRecordProxy = (schema: any, propertyName: string, recordLike: object, useGet: boolean, path: (any)[] = []): any => {

}