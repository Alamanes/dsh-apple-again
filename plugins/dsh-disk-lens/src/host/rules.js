// Rule table for dsh-disk-lens. Every rule is data, not code in a bundle:
// the panel renders it, the user can switch it off, and the scanner walks it.
// Paths are home-relative or absolute; the scanner expands them once.

export const FAMILIES = [
  { id: 'content', label: '你的内容', hint: '照片、文档、聊天记录、项目文件' },
  { id: 'tools', label: '应用与工具', hint: '软件、模型、开发链与游戏' },
  { id: 'caches', label: '缓存与可再生数据', hint: '缓存、构建产物、依赖与日志' },
  { id: 'system', label: 'macOS 系统', hint: '系统自己管理，只测量不建议清理' },
]

/** housekeeping candidates the rules may attach to a category */
const CACHE_COMMAND = "find ~/Library/Caches -mindepth 1 -maxdepth 1 ! -name 'com.apple.*' -exec rm -rf {} + 2>/dev/null; rm -rf ~/.cache/* 2>/dev/null"

export const RULES = [
  {
    id: 'app-caches',
    family: 'caches',
    name: '应用缓存与日志',
    note: '系统与各应用的重建缓存，删除后按需重建。',
    items: [
      { label: '~/Library/Caches', path: '~/Library/Caches' },
      { label: '~/.cache', path: '~/.cache' },
      { label: '~/Library/Logs', path: '~/Library/Logs' },
    ],
    cleanup: () => [{
      id: 'app-caches:clear',
      label: '应用缓存（不含 Apple 自身）',
      why: '缓存被重新生成，删除不影响数据，只是下次打开稍慢；打开中的应用可能正在写缓存，先关掉它们。',
      safety: 'review',
      method: 'command',
      command: CACHE_COMMAND,
    }],
  },
  {
    id: 'dev-caches',
    family: 'caches',
    name: '包管理器缓存',
    note: 'npm、pnpm、bun、cargo、go 的下载缓存，可重新获取。',
    items: [
      { label: 'npm', path: '~/.npm/_cacache' },
      { label: 'pnpm', path: '~/Library/pnpm/store' },
      { label: 'bun', path: '~/.bun/install/cache' },
      { label: 'cargo', path: '~/.cargo/registry' },
      { label: 'go', path: '~/go/pkg/mod' },
      { label: 'gradle', path: '~/.gradle/caches' },
    ],
    cleanup: (measured) => {
      const out = []
      const add = (id, label, path) => {
        const size = measured.get(path) ?? 0
        if (size > 0) out.push({ id: 'dev-caches:' + id, label, why: '下载缓存，重新安装时会再次拉取。', bytes: size, safety: 'safe', method: 'trash', paths: [path] })
      }
      add('npm', 'npm 缓存', '~/.npm/_cacache')
      add('pnpm', 'pnpm store', '~/Library/pnpm/store')
      add('bun', 'bun 缓存', '~/.bun/install/cache')
      add('cargo', 'cargo registry', '~/.cargo/registry')
      add('gradle', 'gradle 缓存', '~/.gradle/caches')
      return out
    },
  },
  {
    id: 'build-caches',
    family: 'caches',
    name: '构建产物',
    note: 'Xcode 派生数据与模拟器缓存，重新构建即可生成。',
    items: [
      { label: 'DerivedData', path: '~/Library/Developer/Xcode/DerivedData' },
      { label: 'CoreSimulator 缓存', path: '~/Library/Developer/CoreSimulator' },
    ],
    cleanup: (measured) => {
      const size = measured.get('~/Library/Developer/Xcode/DerivedData') ?? 0
      return size > 0 ? [{ id: 'build-caches:derived', label: 'Xcode DerivedData', why: '构建中间产物，下次编译重新生成。', bytes: size, safety: 'safe', method: 'trash', paths: ['~/Library/Developer/Xcode/DerivedData'] }] : []
    },
  },
  {
    id: 'trash',
    family: 'caches',
    name: '废纸篓',
    note: '已删除但还没真正释放的文件。',
    items: [{ label: '废纸篓', path: '~/.Trash' }],
    cleanup: (measured) => {
      const size = measured.get('~/.Trash') ?? 0
      return size > 0 ? [{ id: 'trash:empty', label: '清空废纸篓', why: '里面的文件已经删过，清空后空间才真正释放。', bytes: size, safety: 'review', method: 'command', command: "osascript -e 'tell application \"Finder\" to empty trash'" }] : []
    },
  },
  {
    id: 'downloads',
    family: 'content',
    name: '下载与安装包',
    note: '下载目录里的安装包与大文件，删前请确认还装得上。',
    items: [{ label: '~/Downloads', path: '~/Downloads' }],
    // Measured only. Trashing a whole Downloads folder in one tick is exactly
    // the kind of suggestion that should never be auto-generated.
    cleanup: () => [],
  },
  {
    id: 'documents',
    family: 'content',
    name: '文档与桌面',
    note: '桌面、文稿、影片、云盘里的文件，只测量。',
    readOnly: true,
    items: [
      { label: '桌面', path: '~/Desktop' },
      { label: '文稿', path: '~/Documents' },
      { label: '影片', path: '~/Movies' },
      { label: 'iCloud 云盘', path: '~/Library/Mobile Documents' },
      { label: '第三方云盘', path: '~/Library/CloudStorage' },
    ],
  },
  {
    id: 'photos',
    family: 'content',
    name: '照片',
    note: '照片图库，只能在「照片」里管理，只测量。',
    readOnly: true,
    items: [{ label: '照片图库', path: '~/Pictures' }],
  },
  {
    id: 'chats',
    family: 'content',
    name: '聊天记录',
    note: '微信、QQ、Telegram、Slack 与信息的本地数据。',
    readOnly: true,
    items: [
      { label: '微信', path: '~/Library/Containers/com.tencent.xinWeChat' },
      { label: 'QQ', path: '~/Library/Containers/com.tencent.qq' },
      { label: 'Telegram', path: '~/Library/Group Containers/6N38VWS5BX.ru.keepcoder.Telegram' },
      { label: 'Slack', path: '~/Library/Containers/com.tinyspeck.slackmacgap' },
      { label: '信息', path: '~/Library/Messages' },
    ],
  },
  {
    id: 'projects',
    family: 'content',
    name: '项目目录',
    note: '常见的代码目录，只测量。',
    readOnly: true,
    items: [
      { label: 'Projects', path: '~/Projects' },
      { label: 'Developer', path: '~/Developer' },
      { label: 'code', path: '~/code' },
      { label: 'src', path: '~/src' },
    ],
  },
  {
    id: 'apps',
    family: 'tools',
    name: '应用程序',
    note: '已安装的应用，建议到各自的卸载器里处理。',
    readOnly: true,
    items: [{ label: '/Applications', path: '/Applications' }],
  },
  {
    id: 'device-backups',
    family: 'content',
    name: '设备备份',
    note: 'iPhone 与 iPad 的本地备份，删掉会丢这台电脑上的备份。',
    items: [{ label: 'iOS 备份', path: '~/Library/Application Support/MobileSync/Backup' }],
    cleanup: (measured) => {
      const size = measured.get('~/Library/Application Support/MobileSync/Backup') ?? 0
      return size > 0 ? [{ id: 'device-backups:old', label: '旧的 iOS 备份', why: '旧设备的备份通常不再需要，但删除后这台电脑上就没了。', bytes: size, safety: 'careful', method: 'trash', paths: ['~/Library/Application Support/MobileSync/Backup'] }] : []
    },
  },
  {
    id: 'local-ai',
    family: 'tools',
    name: '本地模型',
    note: 'Ollama 与 LM Studio 的模型文件，可重新下载。',
    items: [
      { label: 'Ollama', path: '~/.ollama' },
      { label: 'LM Studio', path: '~/.lmstudio' },
    ],
    cleanup: (measured) => {
      const out = []
      for (const [id, label, path] of [['ollama', 'Ollama 模型', '~/.ollama'], ['lmstudio', 'LM Studio 模型', '~/.lmstudio']]) {
        const size = measured.get(path) ?? 0
        if (size > 0) out.push({ id: 'local-ai:' + id, label, why: '模型可以重新下载，但文件很大、下载很慢。', bytes: size, safety: 'review', method: 'trash', paths: [path] })
      }
      return out
    },
  },
  {
    id: 'agents',
    family: 'tools',
    name: 'AI 代理的会话与缓存',
    note: 'Codex、Claude、Kimi、Cursor 等 CLI 的记录目录。',
    items: [
      { label: 'Codex', path: '~/.codex' },
      { label: 'Claude', path: '~/.claude' },
      { label: 'Kimi', path: '~/.kimi-code' },
      { label: 'Cursor', path: '~/.cursor' },
      { label: 'Gemini', path: '~/.gemini' },
      { label: 'Pi', path: '~/.pi' },
    ],
  },
  {
    id: 'containers',
    family: 'tools',
    name: '容器与虚拟机',
    note: 'Docker、OrbStack、UTM、Parallels 的镜像与磁盘。',
    items: [
      { label: 'OrbStack', path: '~/OrbStack' },
      { label: 'Docker', path: '~/Library/Containers/com.docker.docker' },
      { label: 'UTM', path: '~/Library/Containers/com.utmapp.UTM' },
      { label: 'Parallels', path: '~/Parallels' },
    ],
  },
  {
    id: 'xcode',
    family: 'tools',
    name: 'Xcode 与模拟器',
    note: '设备支持、归档与模拟器运行时。',
    items: [
      { label: 'iOS DeviceSupport', path: '~/Library/Developer/Xcode/iOS DeviceSupport' },
      { label: 'Archives', path: '~/Library/Developer/Xcode/Archives' },
      { label: '模拟器运行时', path: '/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime' },
    ],
  },
  {
    id: 'browsers',
    family: 'tools',
    name: '浏览器数据',
    note: '缓存与配置，不处理书签与登录信息。',
    items: [
      { label: 'Chrome', path: '~/Library/Application Support/Google/Chrome' },
      { label: 'Edge', path: '~/Library/Application Support/Microsoft Edge' },
      { label: 'Firefox', path: '~/Library/Application Support/Firefox' },
      { label: 'Arc', path: '~/Library/Application Support/Arc' },
    ],
  },
  {
    id: 'creative',
    family: 'tools',
    name: '创意软件缓存',
    note: 'Adobe、Unity、Figma、Blender 的中转文件。',
    items: [
      { label: 'Adobe', path: '~/Library/Application Support/Adobe' },
      { label: 'Unity', path: '~/Library/Unity' },
      { label: 'Figma', path: '~/Library/Application Support/Figma' },
      { label: 'Blender', path: '~/Library/Application Support/Blender' },
    ],
  },
  {
    id: 'games',
    family: 'tools',
    name: '游戏',
    note: 'Steam 与 Epic 的游戏与着色器缓存。',
    items: [
      { label: 'Steam', path: '~/Library/Application Support/Steam' },
      { label: 'Epic', path: '~/Library/Application Support/Epic' },
    ],
  },
  {
    id: 'system-resources',
    family: 'system',
    name: '系统资源',
    note: 'macOS 自己的缓存与更新包，只测量不建议清理。',
    readOnly: true,
    items: [
      { label: '系统资源', path: '/System/Library/AssetsV2' },
      { label: '临时文件', path: '/private/var/folders' },
      { label: '系统数据库', path: '/private/var/db' },
      { label: '系统更新', path: '/Library/Updates' },
    ],
  },
]

export const RULE_MAP = new Map(RULES.map((rule) => [rule.id, rule]))
