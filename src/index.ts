import { Schema, __operationManager } from "./Schema";

export { Schema } from "./Schema";

class MySchema extends Schema {
    hello = 0;
}

const schema = new MySchema().assign({ hello: 5 });

schema[__operationManager].encodeEverything();
schema.hello = 10;

console.log(schema);


