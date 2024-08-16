import { 
    Operation, 
    OPERATION_ARRAY_METHODS_NAMES, 

    OPERATION_ARRAY_METHODS,
    OPERATION_SET_METHODS_NAMES,
    OPERATION_SET_NAMES_METHODS,
    OPERATION_SET_METHODS,
    OPERATION_MAP_METHODS,

    OPERATION_MAP_METHODS_NAMES,
} from './enums';
import { PackrStream, Unpackr } from 'msgpackr';
import { Schema, __operationManager, __indexToProperty, __referenceId } from '../Schema';

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

export class OperationManager {
    private static unpackr: Unpackr = new Unpackr();
    public  static references: Schema[] = [];

    private changeStream: PackrStream = new PackrStream();
    private schema: Schema;

    private getReferenceId(): number {
        let referenceId = this.schema[__referenceId];

        if (referenceId == undefined)  {
            referenceId = OperationManager.references.length;
            OperationManager.references.push(this.schema);
            this.schema[__referenceId] = referenceId;
        }

        return referenceId;
    }

    private begin(operation: Operation, path: any[] | undefined, index?: number, multiplePath?: any[]) {
        this.changeStream.read();
        this.encodeObject(this.getReferenceId());
        this.encodeObject(operation);
        if (index && index != undefined) this.encodeObject(index);
        console.log("index", index);

        if (operation == Operation.SendWholeSchema) return;

        // path rel
        const usePath = path && path?.length > 0;
            
        this.encodeObject(usePath ? Operation.UsePath : Operation.NoPath);
        if (!usePath) return;

        this.encodeObject(path);
        
        const useMultiplePath = multiplePath && multiplePath?.length > 0;
        this.encodeObject(useMultiplePath ? Operation.UseMultiplePath : Operation.UseSinglePath);
        if (useMultiplePath) this.encodeObject(multiplePath);
    }
    private encodeObject(object: any) {
        this.changeStream.write(object);
    }

    public encodeArrayMethod(
        index: number,
        methodName: string | undefined,
        operation: Operation = Operation.Reset,
        path: (string | number | undefined)[],
        multiplePath: any[] | undefined,
        parameters: any[]
    ) {
        if (methodName)
        if (OPERATION_ARRAY_METHODS.includes(methodName))
            operation = OPERATION_ARRAY_METHODS_NAMES[methodName];

        this.begin(operation, path, index, multiplePath);        

        this.encodeObject(parameters);
        this.send();
    }
    public encodeSetMethod(
        index: number,
        methodName: string | undefined,
        multiplePath: any[] | undefined,
        parameters: (any)[]
    ) {
        let operation: Operation | undefined = undefined;
        
        if (methodName)
        if (OPERATION_SET_METHODS.includes(methodName))
            operation = OPERATION_SET_METHODS_NAMES[methodName];
        
        if (!operation) return;

        this.begin(operation, undefined, index, multiplePath);
        this.encodeObject(parameters);
        this.send();
    }
    public encodeMapMethod(
        index: number,
        methodName: string | undefined,
        operation: Operation = Operation.Reset,
        path: (string | number | undefined)[],
        multiplePath: any[] | undefined,
        parameters: any[]
    ) {
        if (methodName)
        if (OPERATION_MAP_METHODS.includes(methodName))
            operation = OPERATION_MAP_METHODS_NAMES[methodName];

        this.begin(operation, path, index, multiplePath);        

        this.encodeObject(parameters);
        this.send();
    }
    public encodeAnything(index: number, operation: Operation = Operation.Reset, ...parameters: (any)[]) {
        this.begin(operation, undefined, index, undefined);
        this.encodeObject(parameters);
        this.send();
    }

    public encodeEverything() {
        this.begin(Operation.SendWholeSchema, undefined);
        this.encodeObject(this.schema);
        this.send();
    }

    private quickCallMethod(namesMethods: any, target: any, object: any, operation: Operation) {
        const methodName = namesMethods[operation];
        (target[methodName] as Function).apply(object);
    }

    private processOperation(object: any, property: any, operation: Operation) {
        // this.schema[property] is temporary until i figure out path/multipath
        let target = this.schema[property];
        console.log("p", object, property, operation);
        //const propertyName = namesMethods[operation];
        
        // Reset operations
        if (operation == Operation.Reset) {
            //target = object[0];
            console.log("->", object, this.schema[property]);
            return;
        }

        // Set<T> operations and array operations
        if (operation >= Operation.SetAdd && operation <= Operation.ArrayConcat) {
            this.quickCallMethod(OPERATION_SET_NAMES_METHODS, target, object, operation);
            return;
        }

        // ArrayResize/array.length
        if (operation == Operation.ArrayResize) {
            console.log("hehe", object);
            target.length = object[0];
            console.log(target);
            return;
        }
    }

    private decodeInternal(message: any) {
        const operation = message[1] as Operation;
        const index = message[2];

        console.log(message);
        // if sending whole schema
        if (operation == Operation.SendWholeSchema) {
            const object = message[3];
            
            try {
                for (const [key, value] of Object.entries(object))
                    this[key] = value;
            } finally { return; }
        }

        const pathUsage = message[3] as Operation;
        const property = this.schema[__indexToProperty][index];

        if (pathUsage == Operation.NoPath) {
            const object = operation == Operation.Reset ? message[3] : message[4];
            this.processOperation(object, property, operation);
            return;
        } 

        
    }

    static opLimit = 0;//this is for testing purposes
    public static decode(buffer: any) {
        const message = this.unpackr.unpackMultiple(buffer);

        console.log(`decoding buffer length ${buffer.length}`);

        const referenceId = message[0];
        if (referenceId < 0 && referenceId >= this.references.length) return;

        const schema = this.references[referenceId] as any;
        const operationManager = schema[__operationManager] as OperationManager;
        operationManager.decodeInternal(message);

        // later
        try {
        } catch {

        }

    }

    private send() {
        if (OperationManager.opLimit >= 7) return;

        const buffer = this.changeStream.read();
        
        
        OperationManager.opLimit++;

        OperationManager.decode(buffer);
    }

    constructor(schema: Schema) {
        this.schema = schema;
    }
}
