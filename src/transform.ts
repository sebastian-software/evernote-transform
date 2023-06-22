import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';

const parser = new xml2js.Parser();

const getEnexFiles = (dir: string): string[] => {
    return fs.readdirSync(dir).filter((file) => path.extname(file).toLowerCase() === '.enex');
};

function makeFileSystemSafe(input: string): string {
    const unsafeCharacters = /[<>:"/\\|?*]/g;
    return input.replace(unsafeCharacters, '_');
}

const convertEnexToJsonAndExtractPDFs = (dir: string, enexFiles: string[]): void => {
    enexFiles.forEach((file) => {
        const data = fs.readFileSync(path.join(dir, file), 'utf8');
        parser.parseString(data, (err: Error, result: any) => {
            if (err) {
                console.error(`Failed to parse ENEX file ${file}: ${err.message}`);
                return;
            }

            // Save JSON
            const jsonFile = path.join(dir, `${path.basename(file, '.enex')}.json`);
            fs.writeFileSync(jsonFile, JSON.stringify(result, null, 4));
            console.log(`Converted ENEX file ${file} to JSON`);

            // Extract PDFs
            if (result['en-export'] && result['en-export'].note) {
                result['en-export'].note.forEach((note: any, index: number) => {
                    const title = note.title[0];
                    console.log(">>> NOTE:", title)
                    if (note.resource) {
                        note.resource.forEach((resource: any, resourceIndex: number) => {
                            if (resource.mime.length > 1) {
                                console.warn("Found more than one attachment!")
                            }
                            if (resource.mime[0] === "application/pdf") {
                                const pdfData = Buffer.from(resource.data[0]._, 'base64');
                                const pdfTitle = makeFileSystemSafe(title)
                                const pdfFile = path.join(dir, "output", `${path.basename(file, '.enex')}_note_${index}_resource_${resourceIndex}_${pdfTitle}.pdf`);
                                fs.mkdirSync(path.dirname(pdfFile), { recursive: true });
                                fs.writeFileSync(pdfFile, pdfData);
                            } else {
                                console.warn("Found other attachment!")
                            }
                        });
                    }
                });
            }
        });
    });
};

const dir = './data';  // Your directory with ENEX files

const enexFiles = getEnexFiles(dir);
console.log("FILES:", enexFiles)
convertEnexToJsonAndExtractPDFs(dir, enexFiles);
