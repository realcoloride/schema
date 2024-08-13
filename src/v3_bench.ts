import { Schema } from "./index";
import { sync } from "./Schema";

// globalThis.interval = setInterval(() => {}, 1000);

// class Item extends Schema {
//     @type("string") name: string;
// }

// class RootState extends Schema {
//     @type([Item]) items = new ArraySchema<Item>();
// }
// const state = new RootState();
// state.items.push(new Item().assign({ name: "hello" }));

// console.log("Encoded:", state.encode());

class Vec3 extends Schema {
    @sync() x: number;
    @sync() y: number;
    @sync() z: number;
}

class Base extends Schema {}

class Entity extends Schema {
    @sync() position = new Vec3().assign({ x: 0, y: 0, z: 0 });
}

class Player extends Entity {
    @sync() rotation = new Vec3().assign({ x: 0, y: 0, z: 0 });
    @sync() secret: string = "private info only for this player";
}

class State extends Schema {
    // @type({ map: Base }) players = new MapSchema<Entity>();
    @sync() num: number = 0;
    @sync() str = "Hello world!";
    // @type(Entity) entity = new Player().assign({
    //     position: new Vec3().assign({ x: 1, y: 2, z: 3 }),
    //     rotation: new Vec3().assign({ x: 4, y: 5, z: 6 }),
    // });
    @sync() entities = new Map();
}

const state = new State();

state.entities.set("one", new Player().assign({
  position: new Vec3().assign({ x: 1, y: 2, z: 3 }),
  rotation: new Vec3().assign({ x: 1, y: 2, z: 3 }),
}));

state.entities.set("two", new Player().assign({
  position: new Vec3().assign({ x: 4, y: 5, z: 6 }),
  rotation: new Vec3().assign({ x: 7, y: 8, z: 9 }),
}));

/*const encoder = new Encoder(state);
let encoded = encoder.encode();
console.log(`(${encoded.length})`, [...encoded]);

globalThis.perform = function() {
    for (let i = 0; i < 500000; i++) {
        encoder.encodeAll();
    }
}
    
function logTime(label: string, callback: Function) {
    const time = Date.now();
    for (let i = 0; i < 500000; i++) {
        callback();
    }
    console.log(`${label}:`, Date.now() - time);
}
logTime("encode time", () => encoder.encodeAll());
const decoder = new Decoder(new State());
logTime("decode time", () => decoder.decode(encoded));*/

// const time = Date.now();
// console.profile();
// for (let i = 0; i < 300000; i++) {
//   state.encodeAll();
// }
// console.profileEnd();
// console.log("encode time:", Date.now() - time);

// const decoded = Reflection.decode(Reflection.encode(state));
// decoded.decode(encoded);
//
// console.log(decoded.toJSON());
//
// const rotation = state.entity.rotation;
// rotation.x = 100;
//
// encoded = state.encode();
// console.log({encoded});
//
// decoded.decode(encoded);
// console.log(decoded.toJSON());

// const time = Date.now();
// for (let i = 0; i < 300000; i++) {
//   const state = new State();
//   state.encode();
// }
// console.log("encode time:", Date.now() - time);

