import fs from "node:fs/promises"
import path from "path"
import { XMLParser } from "fast-xml-parser"
import { createHash } from "crypto"

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
  resource: EvernoteResource | EvernoteResource[] // the note content, usually in HTML form
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

async function parseEvernoteFile(filePath: string): Promise<any> {
  const data = await fs.readFile(filePath, "utf8")
  return parser.parse(data)["en-export"]
}

async function saveAsJson(notes: EvernoteNotes, output: string): Promise<void> {
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, JSON.stringify(notes, null, 2))
}

type ExtractedInfo = {
  date?: string
  title: string
}

function cleanupTitle(input: string): string {
  // replace all dashes with spaces
  let stringWithSpaces = input.replace(/[-_,<>:"/\\|?*]/g, " ")

  // replace all multiple spaces with a single space
  let stringWithSingleSpaces = stringWithSpaces.replace(/\s+/g, " ")

  // trim the string
  let trimmedString = stringWithSingleSpaces.trim()

  return trimmedString
}

function extractTitleDate(inputString: string | number): ExtractedInfo {
  if (typeof inputString !== "string") {
    inputString = inputString.toString()
  }

  const regex = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/
  const match = inputString.match(regex)

  let date: string | undefined
  let title: string = inputString

  if (match) {
    date = match[0]
    title = inputString.replace(regex, "")
  }

  return { date, title: cleanupTitle(title) }
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
  const formattedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(
    2,
    "0"
  )}`

  return formattedDate
}

function getHash(data: string): string {
  const hash = createHash('sha1');
  hash.update(data);
  return hash.digest('hex').slice(0, 6);
}

async function extractResource(resource: EvernoteResource, distPath: string) {
  const pdfData = Buffer.from(resource.data, "base64")
  const pdfHash = getHash(resource.data)
  const pdfDist = `${distPath} ${pdfHash}.pdf`

  console.log(`>>> Saving PDF: ${pdfDist}...`)
  await fs.mkdir(path.dirname(pdfDist), { recursive: true })
  try {
    await fs.writeFile(pdfDist, pdfData, { flag: "wx"})
  } catch(error) {
    console.warn(`>>> Unable to write file: ${error.message}!`)
  }
}

async function extractNote(note: EvernoteNote, distPrefix: string) {
  const { title, date } = extractTitleDate(note.title ?? "")
  const usableDate = convertGermanDate(date) || convertNoteDate(note.created)
  const distPath = path.join(
    distPrefix,
    usableDate.slice(0, 4),
    usableDate.slice(5, 7),
    `${usableDate} ${title}`
  )

  if (!note.resource) {
    console.warn(`No resource data found: ${note.title}`)
    return
  }

  if (Array.isArray(note.resource)) {
    for (const resource of note.resource) {
      await extractResource(resource, distPath)
    }
  } else {
    await extractResource(note.resource, distPath)
  }
}

async function batchConvert(source: string, dist: string): Promise<void> {
  const files = await getEvernoteFiles(source)

  console.log(`>>> Deleting output folder ${dist}...`)
  await fs.rm(dist, { recursive: true, force: true })

  for (const file of files) {
    console.log("=====================================")
    console.log(`  FILE: ${file}`)
    console.log("=====================================")

    // Remove the file extension and any trailing numbers (file chunks)
    const baseFileName = file.replace(".enex", "").replace(/[\s\.][0-9]+$/, "")
    const outputFolder = path.resolve(path.join(dist, baseFileName))

    console.log(">>> Parsing Evernote file...")
    const root: EvernoteExport = await parseEvernoteFile(
      path.join(source, file)
    )
    const notes = root.note

    const jsonPath = path.join(
      outputFolder,
      path.basename(file, ".enex") + ".json"
    )
    console.log(`>>> Saving JSON file ${jsonPath}...`)
    await saveAsJson(notes, jsonPath)

    console.log(`>>> Extracting ${notes.length} notes to ${outputFolder}...`)
    for (const note of notes) {
      await extractNote(note, outputFolder)
    }
  }
}

await batchConvert("./data", "./dist")
