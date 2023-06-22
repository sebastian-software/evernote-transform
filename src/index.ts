import fs from "node:fs/promises"
import path from "path"
import { XMLParser } from "fast-xml-parser"

interface EvernoteResource {
  data: string // this is the base64 encoded data of the resource
  mime: string[] // this is the mime type of the resource
  resourceAttributes: {
    fileName: string // this is the original file name of the resource
  }
}

interface EvernoteNote {
  title: string
  created: string // this could be represented as a Date object too, depending on your needs
  updated: string // this could be represented as a Date object too, depending on your needs
  tags?: string[] // optional array of tag strings
  resource: EvernoteResource // the note content, usually in HTML form
  attributes?: {
    sourceURL?: string // optional URL of note source
  }
}

type EvernoteNotes = EvernoteNote[]

interface EvernoteExport {
  note: EvernoteNotes
}

const parser = new XMLParser()

const getEvernoteFiles = async (dir: string): Promise<string[]> => {
  const dirs = await fs.readdir(dir)
  return dirs.filter((file) => path.extname(file).toLowerCase() === ".enex")
}

function makeFileSystemSafe(input: string): string {
  const unsafeCharacters = /[<>:"/\\|?*]/g
  return input.replace(unsafeCharacters, "_")
}

async function parseEvernoteFile(filePath: string): Promise<any> {
  const data = await fs.readFile(filePath, "utf8")
  return parser.parse(data)["en-export"]
}

async function saveAsJson(notes: EvernoteNotes, output: string): Promise<void> {
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, JSON.stringify(notes, null, 2))
}

async function processFile(resource: EvernoteResource, resourceIndex: number) {
  console.log(
    ">>> RESOURCE:",
    resource.resourceAttributes.fileName,
    resource.mime
  )

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
}

type ExtractedInfo = {
  date?: string;
  title: string;
};

function extractTitleDate(inputString: string): ExtractedInfo {
  const regex = /\b(\d{2})\.(\d{2})\.(\d{4})\b/;
  const match = inputString.match(regex);

  let date: string | undefined;
  let title: string = inputString;

  if (match) {
    date = match[0];
    title = inputString.replace(regex, '').trim();
  }

  return { date, title };
}

function convertNoteDate(inputDate: string): string {
  // Reformat the input string into ISO 8601
  const reformattedDate = inputDate.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
    "$1-$2-$3T$4:$5:$6Z"
  )

  // Create a new date object from the input string
  const date = new Date(reformattedDate)

  // Extract the year, month, and day
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1 // Month index is 0-based in JS, so we add 1
  const day = date.getUTCDate()

  // Pad single digit month and day with a leading 0
  const paddedMonth = month < 10 ? `0${month}` : month
  const paddedDay = day < 10 ? `0${day}` : day

  // Format the date string as 'year-month-day'
  const formattedDate = `${year}-${paddedMonth}-${paddedDay}`

  return formattedDate
}

function convertGermanDate(inputDate?: string): string | undefined {
  if (!inputDate) {
    return inputDate
  }

  // Split the input string into an array [day, month, year]
  const [day, month, year] = inputDate.split(".")

  // Format the date string as 'year-month-day'
  const formattedDate = `${year}-${month}-${day}`

  return formattedDate
}

async function extractNote(note: EvernoteNote) {
  const { title, date } = extractTitleDate(note.title ?? "");
  const usableDate = convertGermanDate(date) || convertNoteDate(note.created)
  const distPath = `${usableDate.slice(0,4)}/${usableDate.slice(5,7)}/${usableDate} ${title}`

  console.log(">>> NOTE:", usableDate, title, "=>", distPath)
}

async function extractNotes(notes: EvernoteNotes): Promise<void> {
  for (const note of notes) {
    await extractNote(note)
  }
}

async function batchConvert(dir: string, files: string[]): Promise<void> {
  for (const file of files) {
    console.log("=====================================")
    console.log(`  FILE: ${file}`)
    console.log("=====================================")

    const filePath = path.join(dir, file)
    const root: EvernoteExport = await parseEvernoteFile(filePath)
    const notes = root.note

    const jsonPath = filePath.replace(".enex", ".json")
    await saveAsJson(notes, jsonPath)
    await extractNotes(notes)

    throw new Error("OOOPS")
  }
}

const dir = "./data" // Your directory with ENEX files

const enexFiles = await getEvernoteFiles(dir)
batchConvert(dir, enexFiles)
