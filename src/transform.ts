import fs from "node:fs/promises"
import path from "path"
import xml2js from "xml2js"

const parser = new xml2js.Parser()

const getEnexFiles = async (dir: string): Promise<string[]> => {
  const dirs = await fs.readdir(dir)
  return dirs.filter((file) => path.extname(file).toLowerCase() === ".enex")
}

function makeFileSystemSafe(input: string): string {
  const unsafeCharacters = /[<>:"/\\|?*]/g
  return input.replace(unsafeCharacters, "_")
}

async function parseEnexFile(filePath: string): Promise<any> {
  const data = await fs.readFile(filePath, "utf8")
  return parser.parseString(data)
}

async function saveAsJson(dir: string, file: string, data: any): Promise<void> {
  const jsonFile = path.join(dir, `${path.basename(file, ".enex")}.json`)
  await fs.writeFile(jsonFile, JSON.stringify(data, null, 2))
  console.log(`Converted ENEX file ${file} to JSON`)
}

async function extractPdfFiles(
  dir: string,
  file: string,
  data: any
): Promise<void> {
  if (data["en-export"] && data["en-export"].note) {
    data["en-export"].note.forEach(async (note: any, index: number) => {
      const title = note.title[0]
      console.log(">>> NOTE:", title)
      if (note.resource) {
        note.resource.forEach(async (resource: any, resourceIndex: number) => {
          if (resource.mime.length > 1) {
            console.warn("Found more than one attachment!")
          }
          if (resource.mime[0] === "application/pdf") {
            const pdfData = Buffer.from(resource.data[0]._, "base64")
            const pdfTitle = makeFileSystemSafe(title)
            const pdfFile = path.join(
              dir,
              "output",
              `${path.basename(
                file,
                ".enex"
              )}_note_${index}_resource_${resourceIndex}_${pdfTitle}.pdf`
            )
            await fs.mkdir(path.dirname(pdfFile), { recursive: true })
            await fs.writeFile(pdfFile, pdfData)
          } else {
            console.warn("Found other attachment!")
          }
        })
      }
    })
  }
}

async function convertEnexToJsonAndExtractPDFs(
  dir: string,
  enexFiles: string[]
): Promise<void> {
  for (const file of enexFiles) {
    try {
      const filePath = path.join(dir, file)
      const parsedData = await parseEnexFile(filePath)
      await saveAsJson(dir, file, parsedData)
      await extractPdfFiles(dir, file, parsedData)
    } catch (err) {
      console.error(`Failed to parse ENEX file ${file}: ${err.message}`)
    }
  }
}

const dir = "./data" // Your directory with ENEX files

const enexFiles = await getEnexFiles(dir)
console.log("FILES:", enexFiles)
convertEnexToJsonAndExtractPDFs(dir, enexFiles)
