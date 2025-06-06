import { vars } from '../helpers/helpers.ts'
import type { WebEnv } from './web.ts'

let _env: WebEnv | undefined

export const env = new Proxy<WebEnv>({} as WebEnv, {
  get(target, prop) {
    if (_env === undefined) throw new Error('EnvironmentError: setEnv must be called before accessing env')
    return _env[prop as keyof WebEnv]
  },
})

export const setEnv = (e: WebEnv) => {
  // if (_env) throw new Error(`Env already set to ${env.NAME}`)
  _env = e
  if (vars.DEBUG === 1) console.log(`Using env ${e.NAME}`)
}
