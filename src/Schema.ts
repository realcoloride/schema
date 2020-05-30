import { END_OF_STRUCTURE, NIL, INDEX_CHANGE, ASSIGN_TO_PARENT, TYPE_ID } from './spec';
import { Definition, FilterCallback, Client, PrimitiveType, Context } from "./annotations";

import * as encode from "./encoding/encode";
import * as decode from "./encoding/decode";

import { ArraySchema } from "./types/ArraySchema";
import { MapSchema } from "./types/MapSchema";

import { ChangeTree } from "./changes/ChangeTree";
import { NonFunctionPropNames } from './types/HelperTypes';
import { EventEmitter } from './events/EventEmitter';

export interface DataChange<T=any> {
    field: string;
    value: T;
    previousValue: T;
}

class EncodeSchemaError extends Error {}

function assertType(value: any, type: string, klass: Schema, field: string) {
    let typeofTarget: string;
    let allowNull: boolean = false;

    switch (type) {
        case "number":
        case "int8":
        case "uint8":
        case "int16":
        case "uint16":
        case "int32":
        case "uint32":
        case "int64":
        case "uint64":
        case "float32":
        case "float64":
            typeofTarget = "number";
            if (isNaN(value)) {
                console.log(`trying to encode "NaN" in ${klass.constructor.name}#${field}`);
            }
            break;
        case "string":
            typeofTarget = "string";
            allowNull = true;
            break;
        case "boolean":
            // boolean is always encoded as true/false based on truthiness
            return;
    }

    if (typeof (value) !== typeofTarget && (!allowNull || (allowNull && value !== null))) {
        let foundValue = `'${JSON.stringify(value)}'${(value && value.constructor && ` (${value.constructor.name})`)}`;
        throw new EncodeSchemaError(`a '${typeofTarget}' was expected, but ${foundValue} was provided in ${klass.constructor.name}#${field}`);
    }
}

function assertInstanceType(value: Schema, type: typeof Schema | typeof ArraySchema | typeof MapSchema, klass: Schema, field: string) {
    if (!(value instanceof type)) {
        throw new EncodeSchemaError(`a '${type.name}' was expected, but '${(value as any).constructor.name}' was provided in ${klass.constructor.name}#${field}`);
    }
}

function encodePrimitiveType (type: PrimitiveType, bytes: number[], value: any, klass: Schema, field: string) {
    assertType(value, type as string, klass, field);

    const encodeFunc = encode[type as string];

    if (encodeFunc) {
        encodeFunc(bytes, value);

    } else {
        throw new EncodeSchemaError(`a '${type}' was expected, but ${value} was provided in ${klass.constructor.name}#${field}`);
    }
}

function decodePrimitiveType (type: string, bytes: number[], it: decode.Iterator) {
    return decode[type as string](bytes, it);
}

/**
 * Schema encoder / decoder
 */
export abstract class Schema {
    static _typeid: number;
    static _context: Context;

    static _schema: Definition;
    static _indexes: {[field: string]: number};
    static _fieldsByIndex: {[index: number]: string};
    static _filters: {[field: string]: FilterCallback};
    static _deprecated: {[field: string]: boolean};
    static _descriptors: PropertyDescriptorMap & ThisType<any>;

    static onError(e) {
        console.error(e);
    }

    static is(type: any) {
        return type['_schema'] !== undefined;
    }

    protected $changes: ChangeTree;
    // protected $root: ChangeSet;

    protected $listeners: { [field: string]: EventEmitter<(a: any, b: any) => void> };

    public onChange?(changes: DataChange[]);
    public onRemove?();

    // allow inherited classes to have a constructor
    constructor(...args: any[]) {
        // fix enumerability of fields for end-user
        Object.defineProperties(this, {
            $changes: {
                value: new ChangeTree(this, this._indexes),
                enumerable: false,
                writable: true
            },
            $listeners: {
                value: {},
                enumerable: false,
                writable: true
            },
        });

        const descriptors = this._descriptors;
        if (descriptors) {
            Object.defineProperties(this, descriptors);
        }

        //
        // Assign initial values
        //
        if (args[0]) {
            this.assign(args[0]);
        }
    }

    public assign(
        props: { [prop in NonFunctionPropNames<this>]: this[prop] }
    ) {
        Object.assign(this, props);
        return this;
    }

    protected get _schema () { return (this.constructor as typeof Schema)._schema; }
    protected get _descriptors () { return (this.constructor as typeof Schema)._descriptors; }
    protected get _indexes () { return (this.constructor as typeof Schema)._indexes; }
    protected get _fieldsByIndex() { return (this.constructor as typeof Schema)._fieldsByIndex }
    protected get _filters () { return (this.constructor as typeof Schema)._filters; }
    protected get _deprecated () { return (this.constructor as typeof Schema)._deprecated; }

    public listen <K extends NonFunctionPropNames<this>>(attr: K, callback: (value: this[K], previousValue: this[K]) => void) {
        if (!this.$listeners[attr as string]) {
            this.$listeners[attr as string] = new EventEmitter();
        }
        this.$listeners[attr as string].register(callback);

        // return un-register callback.
        return () =>
            this.$listeners[attr as string].remove(callback);
    }

    decode(bytes, it: decode.Iterator = { offset: 0 }) {
        const changes: DataChange[] = [];

        const schema = this._schema;
        const fieldsByIndex = this._fieldsByIndex;

        const totalBytes = bytes.length;

        // skip TYPE_ID of existing instances
        if (bytes[it.offset] === TYPE_ID) {
            it.offset += 2;
        }

        while (it.offset < totalBytes) {
            const isNil = decode.nilCheck(bytes, it) && ++it.offset;
            const index = bytes[it.offset++];

            if (index === END_OF_STRUCTURE) {
                // reached end of strucutre. skip.
                break;
            }

            const field = fieldsByIndex[index];
            const _field = `_${field}`;

            let type = schema[field];
            let value: any;

            let hasChange = false;

            if (!field) {
                continue;

            } else if (isNil) {
                value = null;
                hasChange = true;

            } else if (Schema.is(type)) {
                value = this[_field] || this.createTypeInstance(bytes, it, type as typeof Schema);
                value.decode(bytes, it);

                hasChange = true;

            } else if (ArraySchema.is(type)) {
                type = type[0];

                const valueRef: ArraySchema = this[_field] || new ArraySchema();
                value = valueRef.clone(true);

                const newLength = decode.number(bytes, it);
                const numChanges = Math.min(decode.number(bytes, it), newLength);

                const hasRemoval = (value.length > newLength);
                hasChange = (numChanges > 0) || hasRemoval;

                // FIXME: this may not be reliable. possibly need to encode this variable during serialization
                let hasIndexChange = false;

                // ensure current array has the same length as encoded one
                if (hasRemoval) {
                    // decrease removed items from number of changes.
                    // no need to iterate through them, as they're going to be removed.

                    Array.prototype.splice.call(value, newLength).forEach((itemRemoved, i) => {
                        if (itemRemoved && itemRemoved.onRemove) {
                            try {
                                itemRemoved.onRemove();
                            } catch (e) {
                                Schema.onError(e);
                            }
                        }

                        if (valueRef.onRemove) {
                            try {
                                valueRef.onRemove(itemRemoved, newLength + i);
                            } catch (e) {
                                Schema.onError(e);
                            }
                        }
                    });
                }

                for (let i = 0; i < numChanges; i++) {
                    const newIndex = decode.number(bytes, it);

                    let indexChangedFrom: number; // index change check
                    if (decode.indexChangeCheck(bytes, it)) {
                        decode.uint8(bytes, it);
                        indexChangedFrom = decode.number(bytes, it);
                        hasIndexChange = true;
                    }

                    let isNew = (!hasIndexChange && value[newIndex] === undefined) || (hasIndexChange && indexChangedFrom === undefined);

                    if ((type as any).prototype instanceof Schema) {
                        let item: Schema;

                        if (isNew) {
                            item = this.createTypeInstance(bytes, it, type as typeof Schema);

                        } else if (indexChangedFrom !== undefined) {
                            item = valueRef[indexChangedFrom];

                        } else {
                            item = valueRef[newIndex]
                        }

                        if (!item) {
                            item = this.createTypeInstance(bytes, it, type as typeof Schema);
                            isNew = true;
                        }

                        item.decode(bytes, it);
                        value[newIndex] = item;

                    } else {
                        value[newIndex] = decodePrimitiveType(type as string, bytes, it);
                    }

                    if (isNew) {
                        if (valueRef.onAdd) {
                            try {
                                valueRef.onAdd(value[newIndex], newIndex);
                            } catch (e) {
                                Schema.onError(e);
                            }
                        }

                    } else if (valueRef.onChange) {
                        try {
                            valueRef.onChange(value[newIndex], newIndex);
                        } catch (e) {
                            Schema.onError(e);
                        }
                    }
                }


            } else if (MapSchema.is(type)) {
                type = (type as any).map;

                const valueRef: MapSchema = this[_field] || new MapSchema();
                value = valueRef.clone(true);

                const length = decode.number(bytes, it);
                hasChange = (length > 0);

                // FIXME: this may not be reliable. possibly need to encode this variable during
                // serializagion
                let hasIndexChange = false;

                const previousKeys = Array.from(valueRef.keys());
                console.log("DECODING MAP:", { value, valueRef, length, previousKeys });

                for (let i = 0; i < length; i++) {
                    // `encodeAll` may indicate a higher number of indexes it actually encodes
                    // TODO: do not encode a higher number than actual encoded entries
                    if (
                        bytes[it.offset] === undefined ||
                        bytes[it.offset] === END_OF_STRUCTURE
                    ) {
                        break;
                    }

                    const isNilItem = decode.nilCheck(bytes, it) && ++it.offset;

                    // index change check
                    let previousKey: string;
                    if (decode.indexChangeCheck(bytes, it)) {
                        decode.uint8(bytes, it);
                        previousKey = previousKeys[decode.number(bytes, it)];
                        hasIndexChange = true;
                    }

                    const hasMapIndex = decode.numberCheck(bytes, it);
                    const isSchemaType = typeof(type) !== "string";

                    const newKey = (hasMapIndex)
                        ? previousKeys[decode.number(bytes, it)]
                        : decode.string(bytes, it);

                    let item;
                    let isNew = (!hasIndexChange && valueRef[newKey] === undefined) || (hasIndexChange && previousKey === undefined && hasMapIndex);

                    console.log({ newKey, isNew, hasMapIndex });

                    if (isNew && isSchemaType) {
                        item = this.createTypeInstance(bytes, it, type as typeof Schema);

                    } else if (previousKey !== undefined) {
                        item = valueRef.get(previousKey);

                    } else {
                        item = valueRef.get(newKey);
                    }

                    if (isNilItem) {
                        if (item && item.onRemove) {
                            try {
                                item.onRemove();
                            } catch (e) {
                                Schema.onError(e);
                            }

                        }

                        if (valueRef.onRemove) {
                            try {
                                valueRef.onRemove(item, newKey);
                            } catch (e) {
                                Schema.onError(e);
                            }
                        }

                        value.delete(newKey);
                        continue;

                    } else if (!isSchemaType) {
                        value.set(newKey, decodePrimitiveType(type as string, bytes, it));

                    } else {
                        item.decode(bytes, it);
                        value.set(newKey, item);
                    }

                    if (isNew) {
                        if (valueRef.onAdd) {
                            try {
                                valueRef.onAdd(value[newKey], newKey);
                            } catch (e) {
                                Schema.onError(e);
                            }
                        }

                    } else if (valueRef.onChange) {
                        try {
                            valueRef.onChange(value[newKey], newKey);
                        } catch (e) {
                            Schema.onError(e);
                        }
                    }

                }

            } else {
                value = decodePrimitiveType(type as string, bytes, it);

                // FIXME: should not even have encoded if value haven't changed in the first place!
                // check FilterTest.ts: "should not trigger `onChange` if field haven't changed"
                hasChange = (value !== this[_field]);
            }

            if (hasChange && (this.onChange || this.$listeners[field])) {
                changes.push({
                    field,
                    value,
                    previousValue: this[_field]
                });
            }

            this[_field] = value;
        }

        this._triggerChanges(changes);

        return this;
    }

    encode(root: Schema = this, encodeAll = false, bytes: number[] = [], useFilters: boolean = false) {
        const $root = root.$changes.root;

        const changeTrees = (this === root)
            ? Array.from($root.changes)
            : [this.$changes];

        // console.log({ changeTrees });

        for (let i = 0, l = changeTrees.length; i < l; i++) {
            const change = changeTrees[i];
            const ref = change.ref;
            const indexes = change.indexes;

            const changes = (encodeAll)
                ? Array.from(change.allChanges)
                : Array.from(change.changes.keys());

            changes.forEach((fieldIndex) => {
                const operation = change.changes.get(fieldIndex);

                const schema = this._schema;
                const fieldsByIndex = this._fieldsByIndex;

                const field = fieldsByIndex[fieldIndex];
                const _field = `_${field}`;

                const type = schema[field];
                const value = this[_field];

                console.log({ field, type, value, operation });

                // cache begin index if `useFilters`
                const beginIndex = bytes.length;

                if (value === undefined) {
                    encode.uint8(bytes, NIL);
                    encode.number(bytes, fieldIndex);

                } else if (Schema.is(type)) {
                    if (!value) {
                        // value has been removed
                        encode.uint8(bytes, NIL);
                        encode.number(bytes, fieldIndex);

                    } else {
                        // encode child object
                        encode.number(bytes, fieldIndex);
                        assertInstanceType(value, type as typeof Schema, this, field);

                        this.tryEncodeTypeId(bytes, type as typeof Schema, value.constructor as typeof Schema);
                        (value as Schema).encode(root, encodeAll, bytes, useFilters);
                    }

                } else if (ArraySchema.is(type)) {
                    const $changes: ChangeTree = value.$changes;

                    encode.number(bytes, fieldIndex);

                    // total number of items in the array
                    encode.number(bytes, value.length);

                    const arrayChanges = Array.from(
                        (encodeAll)
                            ? Array.from($changes.allChanges)
                            : Array.from($changes.changes.keys())
                        )
                        .filter(index => this[_field][index] !== undefined)
                        .sort((a: number, b: number) => a - b);

                    // ensure number of changes doesn't exceed array length
                    const numChanges = arrayChanges.length;

                    // number of changed items
                    encode.number(bytes, numChanges);

                    const isChildSchema = typeof(type[0]) !== "string";

                    // console.log({ arrayChanges, numChanges, isChildSchema, arrayLength: value.length });

                    // assert ArraySchema was provided
                    assertInstanceType(this[_field], ArraySchema, this, field);

                    // encode Array of type
                    for (let j = 0; j < numChanges; j++) {
                        const index = arrayChanges[j];
                        const item = this[_field][index];

                        // console.log({ index, item });

                        if (isChildSchema) { // is array of Schema
                            encode.number(bytes, index);

                            if (!encodeAll) {
                                // const indexChange = $changes.getIndexChange(item);
                                // if (indexChange !== undefined) {
                                //     encode.uint8(bytes, INDEX_CHANGE);
                                //     encode.number(bytes, indexChange);
                                // }
                            }

                            assertInstanceType(item, type[0] as typeof Schema, this, field);
                            this.tryEncodeTypeId(bytes, type[0] as typeof Schema, item.constructor as typeof Schema);

                            (item as Schema).encode(root, encodeAll, bytes, useFilters);

                        } else if (item !== undefined) { // is array of primitives
                            encode.number(bytes, index);
                            encodePrimitiveType(type[0], bytes, item, this, field);
                        }
                    }

                    if (!encodeAll && !useFilters) {
                        $changes.discard();
                    }

                } else if (MapSchema.is(type)) {
                    const $changes: ChangeTree = value.$changes;

                    // encode Map of type
                    encode.number(bytes, fieldIndex);

                    // TODO: during `encodeAll`, removed entries are not going to be encoded
                    const keys = Array.from(
                        (encodeAll)
                            ? Array.from($changes.allChanges)
                            : Array.from($changes.changes.keys())
                    );

                    encode.number(bytes, keys.length)

                    // const previousKeys = Object.keys(this[_field]); // this is costly!
                    const previousKeys = Array.from($changes.allChanges);
                    const isChildSchema = typeof((type as any).map) !== "string";
                    const numChanges = keys.length;

                    // console.log("ENCODE MAP =>", { keys, numChanges, previousKeys, isChildSchema });

                    // assert MapSchema was provided
                    assertInstanceType(this[_field], MapSchema, this, field);

                    for (let i = 0; i < numChanges; i++) {
                        const key = keys[i];
                        const item = this[_field].get(key);

                        let mapItemIndex: number = undefined;

                        // console.log("ENCODING MAP ITEM", { key, item });

                        if (encodeAll) {
                            if (item === undefined) {
                                // previously deleted items are skipped during `encodeAll`
                                continue;
                            }

                        } else {
                            // encode index change
                            // const indexChange = $changes.getIndexChange(item);
                            // if (item && indexChange !== undefined) {
                            //     encode.uint8(bytes, INDEX_CHANGE);
                            //     encode.number(bytes, this[_field]._indexes.get(indexChange));
                            // }

                            /**
                             * - Allow item replacement
                             * - Allow to use the index of a deleted item to encode as NIL
                             */
                            // mapItemIndex = (!$changes.isDeleted(key) || !item)
                            //     ? this[_field]._indexes.get(key)
                            //     : undefined;

                            // console.log({ indexChange, mapItemIndex });
                        }

                        const isNil = (item === undefined);

                        /**
                         * Invert NIL to prevent collision with data starting with NIL byte
                         */
                        if (isNil) {

                            // TODO: remove item
                            // console.log("REMOVE KEY INDEX", { key });
                            // this[_field]._indexes.delete(key);
                            encode.uint8(bytes, NIL);
                        }

                        if (mapItemIndex !== undefined) {
                            encode.number(bytes, mapItemIndex);

                        } else {
                            encode.string(bytes, key);
                        }

                        if (item && isChildSchema) {
                            assertInstanceType(item, (type as any).map, this, field);
                            this.tryEncodeTypeId(bytes, (type as any).map, item.constructor as typeof Schema);
                            (item as Schema).encode(root, encodeAll, bytes, useFilters);

                        } else if (!isNil) {
                            encodePrimitiveType((type as any).map, bytes, item, this, field);
                        }

                    }

                    if (!encodeAll && !useFilters) {
                        $changes.discard();

                        // TODO: track array/map indexes per client (for filtering)?

                        // TODO: do not iterate though all MapSchema indexes here.
                        this[_field]._updateIndexes(previousKeys);
                    }

                } else {
                    encode.number(bytes, fieldIndex);
                    encodePrimitiveType(type as PrimitiveType, bytes, value, this, field)
                }

                if (useFilters) {
                    // cache begin / end index
                    $root.cache(fieldIndex as number, beginIndex, bytes.length)
                }


            });
        }

        // flag end of Schema object structure
        this._encodeEndOfStructure(this, root, bytes);

        if (!encodeAll && !useFilters) {
            this.$changes.discard();
        }

        return bytes;
    }

    // encodeFiltered(client: Client, bytes?: number[]) {
    //     return this.encode(this, false, client, bytes);
    // }

    encodeAll (bytes?: number[]) {
        return this.encode(this, true, bytes);
    }

    applyFilters(encodedBytes: number[], client: Client, root = this, encodeAll: boolean = false) {
        const $root = root.$changes.root;
        let filteredBytes: number[] = [];

        const schema = this._schema;
        const fieldsByIndex = this._fieldsByIndex;
        const filters = this._filters;

        for (let index in $root.caches) {
            const fieldIndex = parseInt(index);
            const cache = $root.caches[fieldIndex];
            const field = fieldsByIndex[fieldIndex];

            const type = schema[field];
            const filter = (filters && filters[field]);
            const _field = `_${field}`;
            const value = this[_field];

            console.log( {field, filter, cache});

            if (filter && !filter.call(this, client, value, root)) {
                console.log("SKIP", field, "AT", fieldIndex)
                continue;
            }

            if (Schema.is(type)) {
                console.log("IS SCHEMA", {type, field, cache})
                filteredBytes.push(fieldIndex);

                if (value) {
                    filteredBytes = [
                        ...filteredBytes,
                        ...(value as Schema).applyFilters(encodedBytes, client, root, encodeAll)
                    ];
                } else {
                    filteredBytes = [...filteredBytes, ...encodedBytes.slice(cache.beginIndex, cache.endIndex)];
                }

            } else if (ArraySchema.is(type)) {
                const $changes: ChangeTree = value.$changes;

                encode.number(encodedBytes, fieldIndex);

                // total number of items in the array
                encode.number(encodedBytes, value.length);

                const arrayChanges = Array.from(
                    (encodeAll)
                        ? Array.from($changes.allChanges)
                        : Array.from($changes.changes.keys())
                    )
                    .filter(index => this[_field][index] !== undefined)
                    .sort((a: number, b: number) => a - b);

                // ensure number of changes doesn't exceed array length
                const numChanges = arrayChanges.length;

                // number of changed items
                encode.number(encodedBytes, numChanges);

                const isChildSchema = typeof(type[0]) !== "string";

                // encode Array of type
                for (let j = 0; j < numChanges; j++) {
                    const index = arrayChanges[j];
                    const item = this[_field][index];

                    if (isChildSchema) { // is array of Schema
                        encode.number(encodedBytes, index);

                        if (!encodeAll)  {
                            // const indexChange = $changes.getIndexChange(item);
                            // if (indexChange !== undefined) {
                            //     encode.uint8(encodedBytes, INDEX_CHANGE);
                            //     encode.number(encodedBytes, indexChange);
                            // }
                        }

                        this.tryEncodeTypeId(encodedBytes, type[0] as typeof Schema, item.constructor as typeof Schema);

                        (item as Schema).applyFilters(encodedBytes, client, root, encodeAll)

                    } else if (item !== undefined) { // is array of primitives
                        encode.number(encodedBytes, index);
                        encodePrimitiveType(type[0], encodedBytes, item, this, field);
                    }
                }

            } else if (MapSchema.is(type)) {
                const $changes: ChangeTree = value.$changes;

                // encode Map of type
                encode.number(encodedBytes, fieldIndex);

                // TODO: during `encodeAll`, removed entries are not going to be encoded
                const keys = Array.from(
                    (encodeAll)
                        ? Array.from($changes.allChanges)
                        : Array.from($changes.changes.keys())
                );

                encode.number(encodedBytes, keys.length)

                // const previousKeys = Object.keys(this[_field]); // this is costly!
                const previousKeys = Array.from($changes.allChanges);
                const isChildSchema = typeof((type as any).map) !== "string";
                const numChanges = keys.length;

                for (let i = 0; i < numChanges; i++) {
                    const key = keys[i];
                    const item = this[_field][key];

                    let mapItemIndex: number = undefined;

                    if (encodeAll) {
                        if (item === undefined) {
                            // previously deleted items are skipped during `encodeAll`
                            continue;
                        }

                    } else {
                        // // encode index change
                        // const indexChange = $changes.getIndexChange(item);
                        // if (item && indexChange !== undefined) {
                        //     encode.uint8(encodedBytes, INDEX_CHANGE);
                        //     encode.number(encodedBytes, this[_field]._indexes.get(indexChange));
                        // }

                        /**
                         * - Allow item replacement
                         * - Allow to use the index of a deleted item to encode as NIL
                         */
                        // mapItemIndex = (!$changes.isDeleted(key) || !item)
                        //     ? this[_field]._indexes.get(key)
                        //     : undefined;
                    }

                    const isNil = (item === undefined);

                    /**
                     * Invert NIL to prevent collision with data starting with NIL byte
                     */
                    if (isNil) {

                        // TODO: remove item
                        // console.log("REMOVE KEY INDEX", { key });
                        // this[_field]._indexes.delete(key);
                        encode.uint8(encodedBytes, NIL);
                    }

                    if (mapItemIndex !== undefined) {
                        encode.number(encodedBytes, mapItemIndex);

                    } else {
                        encode.string(encodedBytes, key);
                    }

                    if (item && isChildSchema) {
                        this.tryEncodeTypeId(encodedBytes, (type as any).map, item.constructor as typeof Schema);
                        (item as Schema).applyFilters(encodedBytes, client, root, encodeAll)

                    } else if (!isNil) {
                        encodePrimitiveType((type as any).map, encodedBytes, item, this, field);
                    }

                }

            } else {
                filteredBytes = [...filteredBytes, ...encodedBytes.slice(cache.beginIndex, cache.endIndex)];
            }
        }

        filteredBytes.push(END_OF_STRUCTURE);

        return filteredBytes;
    }

    // encodeAllFiltered (client: Client, bytes?: number[]) {
    //     return this.encode(this, true, client, bytes);
    // }

    clone () {
        const cloned = new ((this as any).constructor);
        const schema = this._schema;
        for (let field in schema) {
            if (
                typeof (this[field]) === "object" &&
                typeof (this[field].clone) === "function"
            ) {
                // deep clone
                cloned[field] = this[field].clone();

            } else {
                // primitive values
                cloned[field] = this[field];
            }
        }
        return cloned;
    }

    triggerAll() {
        const changes: DataChange[] = [];
        const schema = this._schema;

        for (let field in schema) {
            if (this[field] !== undefined) {
                changes.push({
                    field,
                    value: this[field],
                    previousValue: undefined
                });
            }
        }

        try {
            this._triggerChanges(changes);

        } catch (e) {
            Schema.onError(e);
        }
    }

    toJSON () {
        const schema = this._schema;
        const deprecated = this._deprecated;

        const obj = {}
        for (let field in schema) {
            if (!deprecated[field] && this[field] !== null && typeof (this[field]) !== "undefined") {
                obj[field] = (typeof (this[field].toJSON) === "function")
                    ? this[field].toJSON()
                    : this[`_${field}`];
            }
        }
        return obj;
    }

    discardAllChanges() {
        const schema = this._schema;
        const changes = Array.from(this.$changes.changes);
        const fieldsByIndex = this._fieldsByIndex;

        for (const index in changes) {
            const field = fieldsByIndex[index];
            const type = schema[field];
            const value = this[field];

            // skip unchagned fields
            if (value === undefined) { continue; }

            if ((type as any)._schema) {
                (value as Schema).discardAllChanges();

            } else if (ArraySchema.is(type)) {
                for (let i = 0, l = value.length; i < l; i++) {
                    const index = value[i];
                    const item = this[`_${field}`][index];

                    if (typeof(type[0]) !== "string" && item) { // is array of Schema
                        (item as Schema).discardAllChanges()
                    }
                }

                value.$changes.discard();

            } else if (MapSchema.is(type)) {
                const keys = value;
                const mapKeys = Object.keys(this[`_${field}`]);

                for (let i = 0; i < keys.length; i++) {
                    const key = mapKeys[keys[i]] || keys[i];
                    const item = this[`_${field}`][key];

                    if (item instanceof Schema && item) {
                        item.discardAllChanges();
                    }
                }

                value.$changes.discard();
            }
        }

        this.$changes.discard();
    }

    private _encodeEndOfStructure(instance: Schema, root: Schema, bytes: number[]) {
        if (instance !== root) {
            bytes.push(END_OF_STRUCTURE);
        }
    }

    private tryEncodeTypeId (bytes: number[], type: typeof Schema, targetType: typeof Schema) {
        if (type._typeid !== targetType._typeid) {
            encode.uint8(bytes, TYPE_ID);
            encode.uint8(bytes, targetType._typeid);
        }
    }

    private createTypeInstance (bytes: number[], it: decode.Iterator, type: typeof Schema): Schema {
        if (bytes[it.offset] === TYPE_ID) {
            it.offset++;
            const anotherType = (this.constructor as typeof Schema)._context.get(decode.uint8(bytes, it));
            return new (anotherType as any)();

        } else {
            return new (type as any)();
        }
    }

    private _triggerChanges(changes: DataChange[]) {
        if (changes.length > 0) {
            for (let i = 0; i < changes.length; i++) {
                const change = changes[i];
                const listener = this.$listeners[change.field];
                if (listener) {
                    try {
                        listener.invoke(change.value, change.previousValue);
                    } catch (e) {
                        Schema.onError(e);
                    }
                }
            }

            if (this.onChange) {
                try {
                    this.onChange(changes);
                } catch (e) {
                    Schema.onError(e);
                }
            }
        }

    }
}
