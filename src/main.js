const THEME_KEY = 'git-ref-theme'

let allCategories = []
let domCache = null
let gridEl, searchEl, themeToggleEl, emptyEl

export async function init() {
  gridEl = document.getElementById('grid')
  searchEl = document.getElementById('search')
  themeToggleEl = document.getElementById('theme-toggle')
  emptyEl = document.getElementById('empty')

  applyInitialTheme()

  const res = await fetch('/git_gh_commands.json')
  allCategories = await res.json()

  render(allCategories)

  searchEl.addEventListener('input', handleSearch)
  themeToggleEl.addEventListener('click', toggleTheme)
  gridEl.addEventListener('click', handleCopy)
}

// ── Theme ─────────────────────────────────────────────────

function applyInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  if (
    saved === 'dark' ||
    (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    document.documentElement.classList.add('dark')
  }
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark')
  const isDark = document.documentElement.classList.contains('dark')
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
}

// ── Search ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'what',
  'when', 'where', 'how', 'why', 'who', 'will', 'would', 'should',
  'could', 'can', 'may', 'might', 'must', 'do', 'does', 'did',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'against',
  'between', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'just',
  'don', 'now', 'of', 'it', 'my', 'i', 'you'
])

const SYNONYMS = {
  'pr': ['pr', 'pull request'],
  'pull request': ['pr', 'pull request'],
  'repo': ['repo', 'repository'],
  'repository': ['repo', 'repository'],
  'dir': ['dir', 'directory', 'folder'],
  'directory': ['dir', 'directory', 'folder'],
  'folder': ['dir', 'directory', 'folder'],
  'msg': ['msg', 'message'],
  'message': ['msg', 'message'],
  'remove': ['remove', 'rm', 'delete'],
  'rm': ['remove', 'rm', 'delete'],
  'delete': ['remove', 'rm', 'delete'],
  'init': ['init', 'initialize', 'create'],
  'initialize': ['init', 'initialize', 'create']
}

function handleSearch() {
  const query = searchEl.value.toLowerCase().trim()

  if (!domCache) return

  if (!query) {
    domCache.forEach(cat => {
      cat.el.classList.remove('hidden')
      cat.commands.forEach(cmd => cmd.el.classList.remove('hidden'))
    })
    emptyEl.classList.add('hidden')
    return
  }

  const queryTokens = query
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token))

  const tokensToUse = queryTokens.length > 0 ? queryTokens : query.split(/\s+/).filter(t => t.length > 0)

  let anyVisible = false

  domCache.forEach(cat => {
    let catHasVisible = false
    cat.commands.forEach(cmd => {
      const matches = tokensToUse.every((token) => {
        const synonyms = SYNONYMS[token] || [token]
        return synonyms.some((syn) => cmd.search.includes(syn))
      })
      if (matches) {
        cmd.el.classList.remove('hidden')
        catHasVisible = true
      } else {
        cmd.el.classList.add('hidden')
      }
    })

    if (catHasVisible) {
      cat.el.classList.remove('hidden')
      anyVisible = true
    } else {
      cat.el.classList.add('hidden')
    }
  })

  if (anyVisible) {
    emptyEl.classList.add('hidden')
  } else {
    emptyEl.classList.remove('hidden')
  }
}

// ── Render ────────────────────────────────────────────────

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
const TICK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 text-green-600 dark:text-green-500"><path d="M20 6 9 17l-5-5"/></svg>`

function handleCopy(e) {
  const btn = e.target.closest('.copy-btn')
  if (!btn) return
  const cmd = btn.getAttribute('data-cmd')
  if (!cmd) return

  navigator.clipboard.writeText(cmd)
  btn.innerHTML = TICK_ICON
  
  if (btn.timeoutId) clearTimeout(btn.timeoutId)
  btn.timeoutId = setTimeout(() => {
    btn.innerHTML = COPY_ICON
  }, 1500)
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const CATEGORY_MAP = {
  'gh repo': 'GitHub Repository',
  'gh pr': 'GitHub Pull Request',
  'gh issue': 'GitHub Issue',
  'gh workflow & run': 'GitHub Workflow & Run',
  'gh auth & config': 'GitHub Auth & Config',
  'gh gist & release': 'GitHub Gist & Release',
  'gh secret & variable': 'GitHub Secret & Variable',
  'gh label & milestone': 'GitHub Label & Milestone',
  'gh search': 'GitHub Search',
  'gh api & alias': 'GitHub API & Alias',
  'gh codespace': 'GitHub Codespace',
  'gh cache & org': 'GitHub Cache & Organization',
  'gh browse & status': 'GitHub Browse & Status',
  'gh attestation': 'GitHub Attestation',
  'gh ruleset & environment': 'GitHub Ruleset & Environment',
  'gh extension': 'GitHub Extension'
}

function render(categories) {
  if (categories.length === 0) {
    gridEl.innerHTML = ''
    emptyEl.classList.remove('hidden')
    return
  }

  emptyEl.classList.add('hidden')

  gridEl.innerHTML = categories
    .map(
      (cat, idx) => {
        return `
    <div class="mb-6 break-inside-avoid rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
      <div class="flex flex-col space-y-1.5 p-6 pb-3">
        <h3 class="font-semibold leading-none tracking-tight">
          ${esc(CATEGORY_MAP[cat.category] || cat.category)}
        </h3>
      </div>
      <div class="p-6 pt-0 space-y-6">
        ${cat.commands
          .map(
            (cmd) => `
          <div class="group flex flex-col space-y-2">
            <p class="text-sm text-zinc-500 dark:text-zinc-400 leading-snug">${esc(cmd.description)}</p>
            <div class="relative rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
              <pre class="text-[0.85rem] font-mono font-semibold text-zinc-950 dark:text-zinc-50 px-4 py-3 pr-12 overflow-x-auto whitespace-pre-wrap">${esc(cmd.usage)}</pre>
              <button type="button" class="copy-btn absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-800/50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-300" aria-label="Copy command" data-cmd="${esc(cmd.usage).replace(/"/g, '&quot;')}">
                ${COPY_ICON}
              </button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `
      }
    )
    .join('')

  domCache = categories.map((cat, catIdx) => {
    return {
      el: gridEl.children[catIdx],
      commands: cat.commands.map((cmd, cmdIdx) => ({
        el: gridEl.children[catIdx].querySelector('.space-y-6').children[cmdIdx],
        search: `${cmd.name} ${cmd.description} ${cmd.usage}`.toLowerCase()
      }))
    }
  })
}
