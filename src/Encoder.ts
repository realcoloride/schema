import type { Schema } from "./Schema";
import { TypeContext } from "./annotations";
import { $changes, $encoder, $filter, $isOwned } from "./changes/consts";

import * as encode from "./encoding/encode";
import type { Iterator } from "./encoding/decode";

import { SWITCH_TO_STRUCTURE, TYPE_ID, OPERATION } from './spec';
import { ChangeOperation, ChangeTree, Root } from "./changes/ChangeTree";
import { getNextPowerOf2 } from "./utils";
import { StateView } from "./filters/StateView";

type FilteredOperation = ChangeOperation & { changeTree: ChangeTree };

export class Encoder<T extends Schema = any> {
    context: TypeContext;

    root: T;
    $root: Root;

    sharedBuffer = Buffer.allocUnsafeSlow(8 * 1024); // 8KB
    // sharedBuffer = Buffer.allocUnsafeSlow(32); // 8KB

    filteredOperations: FilteredOperation[] = [];

    constructor(root: T) {
        this.setRoot(root);

        //
        // TODO: cache and restore "Context" based on root schema
        // (to avoid creating a new context for each new room)
        //
        this.context = new TypeContext(root.constructor as typeof Schema);

        if (this.context.hasFilters) {
            this.filteredOperations = [];
        }

        // console.log(">>>>>>>>>>>>>>>> Encoder types");
        // this.context.schemas.forEach((id, schema) => {
        //     console.log("type:", id, schema.name, Object.keys(schema[Symbol.metadata]));
        // });
    }

    protected setRoot(root: T) {
        this.$root = new Root();
        this.root = root;
        root[$changes].setRoot(this.$root);
    }

    encode(
        it: Iterator = { offset: 0 },
        view?: StateView<T>,
        bytes = this.sharedBuffer,
    ): Buffer {
        const encodeAll = (view === undefined);
        const rootChangeTree = this.root[$changes];

        const changeTrees: ChangeTree[] = this.$root.changes;
        const numChangeTrees = changeTrees.length;

        for (let i = 0; i < numChangeTrees; i++) {
            const changeTree = changeTrees[i];
            const ref = changeTree.ref;

            // Generate unique refId for the ChangeTree.
            changeTree.ensureRefId();

            // TODO: avoid encoding if instance is a child of a filtered operation.

            if (
                changeTree !== rootChangeTree && // root `refId` is skipped.
                (changeTree.changed || encodeAll)
            ) {
                encode.uint8(bytes, SWITCH_TO_STRUCTURE, it);
                encode.uint8(bytes, changeTree.refId, it);
            }

            const ctor = ref['constructor'];
            const encoder = ctor[$encoder];
            const isOwned = ctor[$isOwned];

            const changes: IterableIterator<ChangeOperation | number> = (encodeAll)
                ? changeTree.allChanges.values()
                : changeTree.changes.values();

            let change: IteratorResult<ChangeOperation | number>;
            while (!(change = changes.next()).done) {
                const operation = (encodeAll)
                    ? OPERATION.ADD
                    : change.value.op;

                const fieldIndex = (encodeAll)
                    ? change.value
                    : change.value.index;

                //
                // first pass, identify "filtered" operations without encoding them
                // they will be encoded per client, based on their view.
                //
                if (view === undefined && isOwned && isOwned(ref, fieldIndex)) {
                    console.log("OWNED structure, skip refId =>", changeTree.refId, fieldIndex);
                    this.filteredOperations.push({
                        op: operation,
                        index: fieldIndex,
                        changeTree,
                    });
                    continue;
                }

                encoder(this, bytes, changeTree, fieldIndex, operation, it);
            }

        }

        if (it.offset > bytes.byteLength) {
            const newSize = getNextPowerOf2(it.offset);
            console.debug("@colyseus/schema encode buffer overflow. Current buffer size: " + bytes.byteLength + ", encoding offset: " + it.offset + ", new size: " + newSize);

            //
            // resize buffer and re-encode (TODO: can we avoid re-encoding here?)
            //
            this.sharedBuffer = Buffer.allocUnsafeSlow(newSize);
            return this.encode(it, view, bytes);

        } else {
            //
            // only clear changes after making sure buffer resize is not required.
            //
            if (!encodeAll) {
                for (let i = 0; i < numChangeTrees; i++) {
                    changeTrees[i].discard();
                }
            }

            // return bytes;
            return bytes.slice(0, it.offset);
        }
    }

    encodeAll(it: Iterator = { offset: 0 }) {
        return this.encode(it);
    }

    encodeView(view: StateView<T>, sharedOffset: number, it: Iterator, bytes = this.sharedBuffer) {
        const viewOffset = it.offset;
        const numOperations = this.filteredOperations.length;

        let lastRefId: number;

        for (let i = 0; i < numOperations; i++) {
            const change = this.filteredOperations[i];
            const operation = change.op;
            const fieldIndex = change.index;

            const changeTree = change.changeTree;
            const ref = changeTree.ref;
            const ctor = ref['constructor'];

            if (!view['owned'].has(changeTree)) {
                console.log("encodeView, skip refId =>", changeTree.refId);
                continue;
            }

            if (lastRefId !== changeTree.refId) {
                encode.uint8(bytes, SWITCH_TO_STRUCTURE, it);
                encode.uint8(bytes, changeTree.refId, it);
                lastRefId = changeTree.refId;
            }

            const encoder = ctor[$encoder];
            encoder(this, bytes, changeTree, fieldIndex, operation, it);
        }

        return Buffer.concat([
            bytes.slice(0, sharedOffset),
            bytes.slice(viewOffset, it.offset)
        ]);
    }

    tryEncodeTypeId (bytes: Buffer, baseType: typeof Schema, targetType: typeof Schema, it: Iterator) {
        const baseTypeId = this.context.getTypeId(baseType);
        const targetTypeId = this.context.getTypeId(targetType);

        if (baseTypeId !== targetTypeId) {
            encode.uint8(bytes, TYPE_ID, it);
            encode.number(bytes, targetTypeId, it);
        }
    }
}