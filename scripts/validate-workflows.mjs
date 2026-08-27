import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as yaml from 'js-yaml'

const directory = '.github/workflows'
const files = (await readdir(directory))
  .filter((fileName) => fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
  .sort()

for (const fileName of files) {
  yaml.load(await readFile(join(directory, fileName), 'utf8'))
}

console.log(`[workflow-check] parsed ${files.length} workflow files`)
