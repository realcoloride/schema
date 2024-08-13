import { sync, Schema, __operationManager } from "./Schema";

export { Schema } from "./Schema";

class MySchema extends Schema {
    @sync() hello = 0;
    @sync() set = new Set<string>();
}

const schema = new MySchema().assign({ hello: 5 });

schema[__operationManager].encodeEverything();
schema.hello = 10;

schema.set.add("ds");
console.log(schema.set);

