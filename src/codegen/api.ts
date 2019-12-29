import * as fs from "fs";
import * as path from "path";

import { File } from "./types";
import { parseFiles } from "./parser";

export interface GenerateOptions {
    files: string[],
    output?: string;
    outFile?: string;
    decorator?: string;
    namespace?: string;
}

export function generate(targetId: string, options: GenerateOptions) {
    let generator: Function;

    try {
        generator = require('./languages/' + targetId).generate;

    } catch (e) {
        throw new Error("You must provide a valid generator as argument, such as: --csharp, --haxe or --cpp");
    }

    const outputDirectory = options.output || path.dirname(options.outFile);
    console.log({ outputDirectory });

    if (!fs.existsSync(outputDirectory)) {
        console.log("Creating", outputDirectory, "directory");
        fs.mkdirSync(outputDirectory);
    }

    /**
     * Default `@type()` decorator name
     */
    if (!options.decorator) { options.decorator = "type"; }

    const classes = parseFiles(options.files, options.decorator);
    const files = generator(classes, options);

    const appendToFile = options.outFile && path.basename(options.outFile);
    if (appendToFile) {
        const outputPath = path.resolve(outputDirectory, appendToFile);

        if (fs.existsSync(outputPath)) {
            console.log("truncate file sync");
            fs.truncateSync(outputPath);

        } else {
            console.log("write file sync");
            fs.writeFileSync(outputPath, "");
        }
    }

    files.forEach((file: File) => {
        const outputPath = path.resolve(outputDirectory, appendToFile || file.name);
        const options = (outputPath)
            ? { flag: "a" }
            : {};

        console.log("WILL WRITE!", outputPath);
        fs.writeFileSync(outputPath, file.content, options);
        console.log("WRITTEN!");

        console.log("generated", file.name, `(at ${outputPath})`);
    });
}
