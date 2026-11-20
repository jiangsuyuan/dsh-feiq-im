import { createFeiqApp } from './src/host/app.js'
import { registerRoutes } from './src/host/routes.js'

export const name = 'dsh-feiq-im'
export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const log = (message) => {
    try {
      ctx.logger?.info?.('[feiq-im] ' + message)
    } catch {
      /* logger is optional */
    }
  }
  const app = createFeiqApp({ config, log })
  ctx.effect(() => () => app.stop())
  const disposeRoutes = registerRoutes(ctx, app, { log })
  ctx.effect(() => () => disposeRoutes())
  app
    .start()
    .then((status) => log('listening: ' + JSON.stringify(status)))
    .catch((error) => log('start failed: ' + (error?.message ?? error)))
}
