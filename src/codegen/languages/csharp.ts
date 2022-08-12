import {
    Class,
    Property,
    File,
    getCommentHeader,
    Interface,
    Enum,
} from "../types";
import { GenerateOptions } from "../api";
import { Context } from "../types";

const typeMaps = {
    "string": "string",
    "number": "float",
    "boolean": "bool",
    "int8": "sbyte",
    "uint8": "byte",
    "int16": "short",
    "uint16": "ushort",
    "int32": "int",
    "uint32": "uint",
    "int64": "long",
    "uint64": "ulong",
    "float32": "float",
    "float64": "double",
}

/**
 * C# Code Generator
 */
const capitalize = (s) => {
    if (typeof s !== 'string') return ''
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function generate(context: Context, options: GenerateOptions): File[] {
    // enrich typeMaps with enums
    context.enums.forEach((structure) => {
        typeMaps[structure.name] = structure.name;
    });
    return [
        ...context.classes.map(structure => ({
            name: `${structure.name}.cs`,
            content: generateClass(structure, options.namespace)
        })),
        ...context.interfaces.map(structure => ({
            name: `${structure.name}.cs`,
            content: generateInterface(structure, options.namespace),
        })),
        ...context.enums.map((structure) => ({
            name: `${structure.name}.cs`,
            content: generateEnum(structure, options.namespace),
        })),
    ];
}

function generateClass(klass: Class, namespace: string) {
    const indent = (namespace) ? "\t" : "";
    return `${getCommentHeader()}

using Colyseus.Schema;
${namespace ? `\nnamespace ${namespace} {` : ""}
${indent}public partial class ${klass.name} : ${klass.extends} {
${klass.properties.map((prop) => generateProperty(prop, indent)).join("\n\n")}
${indent}}
${namespace ? "}" : ""}
`;
}

function generateEnum(_enum: Enum, namespace: string) {
    const indent = namespace ? "\t" : "";
    let enumRunningValue = 0;
    return `${getCommentHeader()}
${namespace ? `\nnamespace ${namespace} {` : ""}
${indent}struct ${_enum.name} {
${_enum.properties
    .map((prop) => {
        const type = prop.type?.replace(/'/g, '"');
        const isNumeric = /[0-9]+/.test(type);
        if (isNumeric || type === undefined) {
            if (type !== undefined) {
                enumRunningValue = Number.parseInt(type, 10);
            }
            return `${indent}\tpublic const ${
                prop.name
            } = ${enumRunningValue++}`;
        } else {
            return `${indent}\tpublic const ${prop.name} = ${type}`;
        }
    })
    .join(",\n\n")}
${indent}}
${namespace ? "}" : ""}
`;
}

function generateProperty(prop: Property, indent: string = "") {
    let typeArgs = `"${prop.type}"`;
    let property = "public";
    let langType: string;
    let initializer = "";

    if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);

        if(prop.type === "ref") {
            langType = (isUpcaseFirst)
                ? prop.childType
                : getChildType(prop);

        } else {
            const containerClass = capitalize(prop.type);

            langType = (isUpcaseFirst)
                ? `${containerClass}Schema<${prop.childType}>`
                : `${containerClass}Schema<${getChildType(prop)}>`;
        }

        typeArgs += `, typeof(${langType})`;

        if (!isUpcaseFirst) {
            typeArgs += `, "${prop.childType}"`;
        }

        initializer = `new ${langType}()`;

    } else {
        langType = getType(prop);
        initializer = `default(${langType})`;
    }

    property += ` ${langType} ${prop.name}`;

    let ret = (prop.deprecated) ? `\t\t[System.Obsolete("field '${prop.name}' is deprecated.", true)]\n` : '';

    return ret + `\t${indent}[Type(${prop.index}, ${typeArgs})]
\t${indent}${property} = ${initializer};`;
}

function generateInterface(struct: Interface, namespace: string) {
    const indent = (namespace) ? "\t" : "";
    return `${getCommentHeader()}

using Colyseus.Schema;
${namespace ? `\nnamespace ${namespace} {` : ""}
${indent}public class ${struct.name} {
${struct.properties.map(prop => `\t${indent}public ${getType(prop)} ${prop.name};`).join("\n")}
${indent}}
${namespace ? "}" : ""}
`;
}

function getChildType(prop: Property) {
    return typeMaps[prop.childType];
}

function getType(prop: Property) {
    return (prop.type === "array")
        ? `${typeMaps[prop.childType] || prop.childType}[]`
        : typeMaps[prop.type];
}