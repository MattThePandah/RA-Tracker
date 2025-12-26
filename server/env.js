import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '.env')
const rootEnvPath = path.join(__dirname, '..', '.env')

config({ path: envPath })
config({ path: rootEnvPath })
