/**
 * @dsh-community/dsh-plugin-container — host half type declarations.
 *
 * The host half is a Cordis plugin row mounted from `lib/index.js`:
 * - exports a Cordis `apply(ctx)` function that registers 39 docker_* model
 *   tools via the `tools` service and 15 /dock-api/* HTTP routes via the
 *   `webServer` service (both guarded by `ctx.get(...)`).
 * - `inject` lists the services this plugin consumes; it provides none.
 */

export interface DockApplyContext {
  get(name: string): unknown
  effect(fn: () => unknown, label?: string): void
  on(event: string, handler: (...args: any[]) => void): void
}

export interface DockerToolArgs {
  [key: string]: unknown
}

export interface DockerToolOutput {
  schema: { type: string; additionalProperties?: boolean }
  render(args: DockerToolArgs, value: unknown): Array<{ type: string; text: string }>
}

export interface DockerTool {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, unknown>
    required?: string[]
  }
  output: DockerToolOutput
  execute(args: DockerToolArgs, exec: unknown): Promise<unknown>
}

export declare function apply(ctx: DockApplyContext): void

export declare const inject: string[]
