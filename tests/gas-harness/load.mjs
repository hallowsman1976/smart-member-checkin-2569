// โหลด gas/src/*.js เข้า vm context พร้อม mock ของ Apps Script
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createGasGlobals } from './gas-mock.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const srcDir = path.join(root, 'gas', 'src')

export function loadGas(properties) {
  const mock = createGasGlobals({ properties })
  const context = vm.createContext({ ...mock.globals, console })
  for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(srcDir, file), 'utf8'), context, { filename: file })
  }
  return { gas: context, ...mock }
}
