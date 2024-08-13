import { 
    Operation, 
    OPERATION_ARRAY_METHODS_NAMES, 
    OPERATION_ARRAY_METHODS,
    OPERATION_SET_METHODS_NAMES,
    OPERATION_SET_METHODS,
    OPERATION_MAP_METHODS,
    OPERATION_MAP_METHODS_NAMES,
} from './enums';
import { PackrStream, Unpackr } from 'msgpackr';
import { Schema } from '../Schema';

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
        var schemaAsAny = (this.schema as any);
        let referenceId = schemaAsAny.__referenceId;

        if (referenceId == undefined)  {
            referenceId = OperationManager.references.length;
            OperationManager.references.push(this.schema);
            schemaAsAny.__referenceId = referenceId;
        }

        return referenceId;
    }

    private begin(operation: Operation, path: any[] | undefined, index?: number, multiplePath?: any[]) {
        this.changeStream.read();
        this.encodeObject(this.getReferenceId());
        this.encodeObject(operation);
        if (index) this.encodeObject(index);

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

    private decodeInternal(message: any) {

        const index = message[1];
        const operation = message[2] as Operation;
        const pathUsage = message[3] as Operation;

        console.log(message);
        
    }

    public static decode(buffer: any) {
        const message = this.unpackr.unpackMultiple(buffer);

        try {
            const referenceId = message[0];
            if (referenceId < 0 && referenceId >= this.references.length) return;

            const schema = this.references[referenceId];
            const operationManager = (schema as any).__operationManager as OperationManager;

            operationManager.decodeInternal(message);
        } catch {

        }

    }

    private send() {
        const buffer = this.changeStream.read();
        

        OperationManager.decode(buffer);
        
    }

    constructor(schema: Schema) {
        this.schema = schema;
    }
}
