import { WebEnv } from './env/web.ts'
import { env, setEnv } from './env/index.ts'

setEnv(new WebEnv())
