export { Schema } from "./Schema";
export type { DataChange } from "./decoder/DecodeOperation";

import { MapSchema } from "./types/MapSchema"
export { MapSchema };

import { ArraySchema } from "./types/ArraySchema";
export { ArraySchema };

import { CollectionSchema } from "./types/CollectionSchema";
export { CollectionSchema };

import { SetSchema } from "./types/SetSchema";
export { SetSchema };

import { registerType } from "./types/typeRegistry";
export { registerType };

registerType("map", { constructor: MapSchema });
registerType("array", { constructor: ArraySchema });
registerType("set", { constructor: SetSchema });
registerType("collection", { constructor: CollectionSchema, });

// Utils
export { dumpChanges } from "./utils";

// Encoder / Decoder
export type { Iterator } from "./encoding/decode";
import * as encode from "./encoding/encode";
import * as decode from "./encoding/decode";
export { encode, decode };

// Reflection
export {
    Reflection,
    ReflectionType,
    ReflectionField,
} from "./Reflection";

export { Metadata } from "./Metadata";

export {
    // Annotations
    type,
    deprecated,
    defineTypes,

    // Internals
    TypeContext,
} from "./annotations";

// Annotation types
export type {
    DefinitionType,
    PrimitiveType,
    Definition,
} from "./annotations";

export { OPERATION } from "./encoding/spec";