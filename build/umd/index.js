(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('msgpackr')) :
    typeof define === 'function' && define.amd ? define(['exports', 'msgpackr'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.schema = {}, global.msgpackr));
})(this, (function (exports, msgpackr) { 'use strict';

    /******************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise, SuppressedError, Symbol */


    function __decorate(decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    }

    typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };

    var Operation;
    (function (Operation) {
        // path
        Operation[Operation["NoPath"] = 0] = "NoPath";
        Operation[Operation["UsePath"] = 1] = "UsePath";
        Operation[Operation["UseSinglePath"] = 2] = "UseSinglePath";
        Operation[Operation["UseMultiplePath"] = 3] = "UseMultiplePath";
        // send the entire schema
        Operation[Operation["SendWholeSchema"] = 4] = "SendWholeSchema";
        // send the entire object
        Operation[Operation["Reset"] = 5] = "Reset";
        //UseIndex = 2, 
        // Set<T> operations
        Operation[Operation["SetAdd"] = 10] = "SetAdd";
        Operation[Operation["SetDelete"] = 11] = "SetDelete";
        Operation[Operation["SetClear"] = 12] = "SetClear";
        // Array operations
        Operation[Operation["ArrayPush"] = 20] = "ArrayPush";
        Operation[Operation["ArrayPop"] = 21] = "ArrayPop";
        Operation[Operation["ArrayShift"] = 22] = "ArrayShift";
        Operation[Operation["ArrayUnshift"] = 23] = "ArrayUnshift";
        Operation[Operation["ArraySplice"] = 24] = "ArraySplice";
        Operation[Operation["ArrayReverse"] = 25] = "ArrayReverse";
        Operation[Operation["ArrayConcat"] = 26] = "ArrayConcat";
        Operation[Operation["ArrayResize"] = 27] = "ArrayResize";
        // Map operations
        Operation[Operation["MapDelete"] = 30] = "MapDelete";
        Operation[Operation["MapClear"] = 31] = "MapClear";
    })(Operation || (Operation = {}));
    const OPERATION_ARRAY_METHODS_NAMES = {
        "push": Operation.ArrayPush,
        "pop": Operation.ArrayPop,
        "shift": Operation.ArrayShift,
        "unshift": Operation.ArrayUnshift,
        "splice": Operation.ArraySplice,
        "reverse": Operation.ArrayReverse,
        "concat": Operation.ArrayConcat,
    };
    const OPERATION_ARRAY_METHODS = [
        "push",
        "pop",
        "shift",
        "unshift",
        "splice",
        "reverse",
        "concat"
    ];
    const OPERATION_SET_METHODS_NAMES = {
        "add": Operation.SetAdd,
        "delete": Operation.SetDelete,
        "clear": Operation.SetClear,
    };
    const OPERATION_SET_METHODS = [
        "add",
        "delete",
        "clear"
    ];
    const OPERATION_MAP_METHODS_NAMES = {
        "delete": Operation.SetDelete,
        "clear": Operation.SetClear,
    };
    const OPERATION_MAP_METHODS = [
        "delete",
        "clear",
    ];

    /*
        MESSAGE FORMAT:
        
        ReferenceId,
        Operation,
        Index,
        UsePath / NoPath

        === SINGLE PATH
        UseSinglePath
        Path
        === MULTIPLE PATH
        UseMultiplePath
        [(FOR EACH PATH) Path]
        === NO PATH
        no instruction needed, reset will
        be assigned automatically
        ===

        Object
    */
    class OperationManager {
        static { this.unpackr = new msgpackr.Unpackr(); }
        static { this.references = []; }
        getReferenceId() {
            var schemaAsAny = this.schema;
            let referenceId = schemaAsAny.__referenceId;
            if (referenceId == undefined) {
                referenceId = OperationManager.references.length;
                OperationManager.references.push(this.schema);
                schemaAsAny.__referenceId = referenceId;
            }
            return referenceId;
        }
        begin(operation, path, index, multiplePath) {
            this.changeStream.read();
            this.encodeObject(this.getReferenceId());
            this.encodeObject(operation);
            if (index)
                this.encodeObject(index);
            if (operation == Operation.SendWholeSchema) {
                this.encodeObject(this);
                return;
            }
            // path rel
            const usePath = path && path?.length > 0;
            this.encodeObject(usePath ? Operation.UsePath : Operation.NoPath);
            if (!usePath)
                return;
            this.encodeObject(path);
            const useMultiplePath = multiplePath && multiplePath?.length > 0;
            this.encodeObject(useMultiplePath ? Operation.UseMultiplePath : Operation.UseSinglePath);
            if (useMultiplePath)
                this.encodeObject(multiplePath);
        }
        encodeObject(object) {
            this.changeStream.write(object);
        }
        encodeArrayMethod(index, methodName, operation = Operation.Reset, path, multiplePath, parameters) {
            if (methodName)
                if (OPERATION_ARRAY_METHODS.includes(methodName))
                    operation = OPERATION_ARRAY_METHODS_NAMES[methodName];
            this.begin(operation, path, index, multiplePath);
            this.encodeObject(parameters);
            this.send();
        }
        encodeSetMethod(index, methodName, multiplePath, parameters) {
            let operation = undefined;
            if (methodName)
                if (OPERATION_SET_METHODS.includes(methodName))
                    operation = OPERATION_SET_METHODS_NAMES[methodName];
            if (!operation)
                return;
            this.begin(operation, undefined, index, multiplePath);
            this.encodeObject(parameters);
            this.send();
        }
        encodeMapMethod(index, methodName, operation = Operation.Reset, path, multiplePath, parameters) {
            if (methodName)
                if (OPERATION_MAP_METHODS.includes(methodName))
                    operation = OPERATION_MAP_METHODS_NAMES[methodName];
            this.begin(operation, path, index, multiplePath);
            this.encodeObject(parameters);
            this.send();
        }
        encodeAnything(index, operation = Operation.Reset, ...parameters) {
            this.begin(operation, undefined, index, undefined);
            this.encodeObject(parameters);
            this.send();
        }
        encodeEverything() {
            this.begin(Operation.SendWholeSchema, undefined);
            this.encodeObject(this.schema);
            this.send();
        }
        processOperation(operation) {
        }
        decodeInternal(message) {
            const operation = message[1];
            const index = message[2];
            const pathUsage = message[3];
            if (operation == Operation.SendWholeSchema) ;
            if (pathUsage == Operation.UsePath) ;
            const schemaAsAny = this.schema;
            schemaAsAny.__indexToProperty[index];
            console.log(message);
        }
        static decode(buffer) {
            const message = this.unpackr.unpackMultiple(buffer);
            try {
                const referenceId = message[0];
                if (referenceId < 0 && referenceId >= this.references.length)
                    return;
                const schema = this.references[referenceId];
                const operationManager = schema?.__operationManager;
                operationManager.decodeInternal(message);
            }
            catch {
            }
        }
        send() {
            const buffer = this.changeStream.read();
            OperationManager.decode(buffer);
        }
        constructor(schema) {
            this.changeStream = new msgpackr.PackrStream();
            this.schema = schema;
        }
    }

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
    function schemaConstructor(constructor) {
        return class extends constructor {
            constructor(...args) {
                super(...args);
                this.__propertyToIndex = new Map();
                this.__indexToProperty = [];
                // Call the initialValues setting only if there are initial values
                const initialValues = args[0] || {};
                Object.keys(initialValues).forEach(key => this[key] = initialValues[key]);
                this.__operationManager = new OperationManager(this);
                this.indexProperties();
            }
            indexProperties() {
                const syncedProperties = this.constructor[SYNCED_PROPERTIES] || new Set();
                // Assign an index to each property
                let index = 0;
                syncedProperties.forEach(property => {
                    this.__indexToProperty.push(property);
                    this.__propertyToIndex.set(property, index);
                    index++;
                });
            }
        };
    }
    exports.Schema = class Schema {
        assign(properties) {
            for (const [key, value] of Object.entries(properties))
                this[key] = value;
            // return for chaining
            return this;
        }
    };
    exports.Schema = __decorate([
        schemaConstructor
    ], exports.Schema);

    new exports.Schema().__operationManager.encodeEverything();

}));
