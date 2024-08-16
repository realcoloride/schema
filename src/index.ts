import { sync, Schema, __operationManager } from "./Schema";

export { Schema } from "./Schema";

class MySchema extends Schema {
    @sync() hello = 0;
    @sync() set = new Set<string>();
    @sync() array = [];
}

const schema = new MySchema().assign({ hello: 5 });

/*schema[__operationManager].encodeEverything();
schema.hello = 10;

schema.set.add("ds");*/

schema.array[0] = 20;
console.log(schema.array);

delete schema.array[0];
schema[__operationManager].encodeEverything();
//console.log(schema.set);
