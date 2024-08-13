export enum Operation {
    // path
    NoPath = 0,
    UsePath = 1,

    UseSinglePath,
    UseMultiplePath,

    // send the entire schema
    SendWholeSchema,
    // send the entire object
    Reset,

    //UseIndex = 2, 

    // Set<T> operations
    SetAdd = 10,   
    SetDelete,
    SetClear, 

    // Array operations
    ArrayPush = 20,
    ArrayPop,
    ArrayShift,
    ArrayUnshift,
    ArraySplice,
    ArrayReverse,
    ArrayConcat,
    ArrayResize,

    // Map operations
    MapDelete = 30,
    MapClear,
}

export const OPERATION_ARRAY_METHODS_NAMES: { [ key in string ]: Operation } = {
    "push" : Operation.ArrayPush,
    "pop" : Operation.ArrayPop,
    "shift" : Operation.ArrayShift,
    "unshift" : Operation.ArrayUnshift,
    "splice" : Operation.ArraySplice,
    "reverse" : Operation.ArrayReverse,
    "concat": Operation.ArrayConcat,
};

export const OPERATION_ARRAY_METHODS = [
    "push", 
    "pop", 
    "shift",
    "unshift",
    "splice",
    "reverse",
    "concat"
];

export const OPERATION_SET_METHODS_NAMES: { [ key in string ]: Operation } = {
    "add" : Operation.SetAdd,
    "delete" : Operation.SetDelete,
    "clear" : Operation.SetClear,
};

export const OPERATION_SET_METHODS = [
    "add",
    "delete",
    "clear"
];

export const OPERATION_MAP_METHODS_NAMES: { [ key in string ]: Operation } = {
    "delete" : Operation.SetDelete,
    "clear" : Operation.SetClear,
}

export const OPERATION_MAP_METHODS = [
    "delete",
    "clear",
];