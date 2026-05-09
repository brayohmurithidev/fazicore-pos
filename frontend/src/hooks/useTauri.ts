// Detect whether we're running inside the Tauri desktop shell
export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Cached platform — 'macos' | 'windows' | 'linux' | 'web'
let _platform: string | null = null

export async function getTauriPlatform(): Promise<string> {
  if (!isTauri) return 'web'
  if (_platform) return _platform
  const { platform } = await import('@tauri-apps/plugin-os')
  _platform = await platform()
  return _platform
}
