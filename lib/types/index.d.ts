/**
 * @dsh-community/dsh-plugin-container — host half type declarations.
 *
 * The host half is a Cordis plugin row mounted from `lib/index.js`:
 * - exports a Cordis `apply(ctx)` function that registers 18 docker_* model
 *   tools via the `tools` service and 7 /dock-api/* HTTP routes via the
 *   `webServer` service (both guarded by `ctx.get(...)`).
 * - `inject` lists the services this plugin consumes; it provides none.
 */

export interface DockApplyContext {
  get(name: string): unknown
  effect(fn: () => unknown, label?: string): void
  on(event: string, handler: (...args: any[]) => void): void
}

export declare function apply(ctx: DockApplyContext): void

export declare const inject: string[]
