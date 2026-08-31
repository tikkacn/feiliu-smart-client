import { access, readFile } from 'node:fs/promises'

const requiredFiles = [
  'src-tauri/src/smart/mod.rs',
  'src-tauri/src/smart/model.rs',
  'src-tauri/src/smart/overlay.rs',
  'src-tauri/src/smart/remote.rs',
  'src-tauri/src/smart/rules.rs',
  'src-tauri/src/cmd/smart.rs',
  'src/types/smart-route.ts',
]

const requiredContent = [
  ['package.json', 'https://github.com/tikkacn/feiliu-smart-client.git'],
  ['src/pages/_navigation-meta.ts', "externalUrl: 'https://guide.uutec.net'"],
  ['src/services/update.ts', 'https://soft.uutec.net/feiliu-smart/latest.json'],
  ['src-tauri/src/config/verge.rs', 'auto_check_update: Some(false)'],
  ['src-tauri/src/lib.rs', 'cmd::sync_smart_classifications'],
  ['src-tauri/src/config/config.rs', 'apply_smart_routes'],
  ['src/hooks/use-update.ts', 'revalidateOnMount: false'],
  ['src/hooks/use-update.ts', 'refetchOnReconnect: false'],
  ['src/hooks/use-update.ts', 'refetchInterval: false'],
]

const forbiddenContent = [
  ['README.md', 'guide.tikka.cn'],
  ['src/pages/_navigation-meta.ts', 'guide.tikka.cn'],
  ['src/services/update.ts', 'github.com/clash-verge-rev'],
  ['package.json', '@tauri-apps/plugin-updater'],
  ['src-tauri/src/lib.rs', 'tauri_plugin_updater'],
  ['src-tauri/src/utils/resolve/mod.rs', 'init_silent_updater'],
  ['src-tauri/capabilities/desktop.json', 'updater:'],
  ['src-tauri/capabilities/migrated.json', 'updater:'],
  ['src-tauri/src/feat/profile.rs', 'is_current_profile_index'],
  ['src-tauri/src/smart/remote.rs', 'text_with_charset'],
]

const failures = []

for (const file of requiredFiles) {
  try {
    await access(file)
  } catch {
    failures.push(`missing required customization file: ${file}`)
  }
}

for (const [file, expected] of requiredContent) {
  const content = await readFile(file, 'utf8')
  if (!content.includes(expected)) {
    failures.push(`${file} no longer contains required marker: ${expected}`)
  }
}

for (const [file, forbidden] of forbiddenContent) {
  const content = await readFile(file, 'utf8')
  if (content.includes(forbidden)) {
    failures.push(
      `${file} contains retired or upstream-only value: ${forbidden}`,
    )
  }
}

if (failures.length > 0) {
  console.error('[custom-verify] Feiliu customizations are incomplete:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `[custom-verify] verified ${requiredFiles.length} files and ${requiredContent.length} required markers`,
)
