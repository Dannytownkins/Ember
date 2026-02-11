# Ember UI/UX Design Recommendations

Concrete, implementation-ready design recommendations for Ember's mobile-first, dark-mode-first AI memory dashboard. Every recommendation includes Tailwind CSS v4 utility classes, component patterns, and Motion (framer-motion successor) animation specifications.

---

## Design Philosophy

The frontend-design skill demands a **bold, intentional aesthetic** -- not generic AI-app chrome. Ember's differentiator: it feels like opening a private leather journal by firelight, not logging into a SaaS dashboard.

**Aesthetic direction:** Warm minimalism. Dark backgrounds that feel like velvet, not void. Amber light that feels like candlelight, not warning signs. Rounded forms that feel handmade, not corporate. Every surface should feel like it was made for exactly one person.

**Key principle from the skill:** "Choose a clear conceptual direction and execute it with precision." Ember's direction is *hearth* -- the warm center of a home where stories are kept alive.

**Typography note:** The skill explicitly warns against Inter as a generic AI font. For Ember's warm, personal aesthetic, consider these alternatives:

- **Display/headings:** `Fraunces` -- a soft serif with optical size axis, feels literary and warm. Or `Playfair Display` for a more editorial journal feel.
- **Body text:** `Source Sans 3` or `Nunito` -- humanist sans-serifs with rounded terminals that feel approachable without sacrificing readability. `DM Sans` is another strong option with good weight range.
- **Monospace (for wake prompts/code):** `JetBrains Mono` or `Fira Code` -- both have ligatures and feel intentional.

If the team strongly prefers a geometric sans, `Outfit` or `Plus Jakarta Sans` are distinctive alternatives to Inter that still read as clean and modern.

---

## 0. Color System and Amber Glow Implementation

### Theme Variables (globals.css)

```css
@theme {
  /* Core palette */
  --color-ember-bg: #0f0f11;
  --color-ember-surface: #18181b;
  --color-ember-surface-raised: #1f1f23;
  --color-ember-surface-hover: #27272a;
  --color-ember-border: #2e2e33;
  --color-ember-border-subtle: #232328;

  /* Amber warmth spectrum */
  --color-ember-amber-50: #fefce8;
  --color-ember-amber-100: #fef3c7;
  --color-ember-amber-200: #fde68a;
  --color-ember-amber-300: #fcd34d;
  --color-ember-amber-400: #fbbf24;
  --color-ember-amber: #f59e0b;
  --color-ember-amber-600: #d97706;
  --color-ember-amber-700: #b45309;
  --color-ember-amber-800: #92400e;
  --color-ember-amber-900: #78350f;

  /* Ember red (accent, sparingly) */
  --color-ember-red: #dc2626;
  --color-ember-red-soft: #fca5a5;

  /* Text hierarchy */
  --color-ember-text: #fafafa;
  --color-ember-text-secondary: #a1a1aa;
  --color-ember-text-muted: #71717a;
  --color-ember-text-warm: #fde68a;

  /* Semantic */
  --color-ember-success: #34d399;
  --color-ember-warning: #fbbf24;
  --color-ember-error: #f87171;

  /* Glow shadows */
  --shadow-ember-glow-sm: 0 0 8px 0 rgba(245, 158, 11, 0.08);
  --shadow-ember-glow: 0 0 16px 0 rgba(245, 158, 11, 0.12);
  --shadow-ember-glow-lg: 0 0 32px 0 rgba(245, 158, 11, 0.16);
  --shadow-ember-glow-xl: 0 0 48px 0 rgba(245, 158, 11, 0.20);

  /* Card-specific composed shadows */
  --shadow-ember-card: 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(245, 158, 11, 0.04);
  --shadow-ember-card-hover: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 24px rgba(245, 158, 11, 0.10);
  --shadow-ember-card-active: 0 2px 8px rgba(0, 0, 0, 0.6), 0 0 32px rgba(245, 158, 11, 0.15);
}
```

### Amber Glow Technique

The glow effect uses layered shadows rather than filters for GPU performance. The key is subtlety -- glow should feel like reflected firelight, not a neon sign.

```html
<!-- Card with glow on hover (CSS transition) -->
<div class="
  rounded-2xl
  bg-ember-surface
  border border-ember-border-subtle
  shadow-ember-card
  transition-shadow duration-500 ease-out
  hover:shadow-ember-card-hover
  hover:border-ember-amber/10
">
  <!-- card content -->
</div>

<!-- Button with constant subtle glow -->
<button class="
  rounded-xl px-6 py-3
  bg-ember-amber-600
  text-ember-bg font-semibold
  shadow-ember-glow
  hover:shadow-ember-glow-lg
  hover:bg-ember-amber
  transition-all duration-300
  active:scale-[0.98] active:shadow-ember-glow-sm
">
  Generate Wake Prompt
</button>

<!-- Importance indicator with pulsing glow (high importance) -->
<div class="
  w-2 h-2 rounded-full bg-ember-amber
  shadow-ember-glow
  animate-[pulse-glow_3s_ease-in-out_infinite]
" />
```

Add to globals.css:
```css
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 8px 0 rgba(245, 158, 11, 0.15); }
  50% { box-shadow: 0 0 20px 2px rgba(245, 158, 11, 0.30); }
}

@keyframes ember-breathe {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}
```

### Background Texture

Add a very subtle noise texture over the background to prevent the "flat void" feeling:

```css
body {
  background-color: var(--color-ember-bg);
  background-image: url("data:image/svg+xml,..."); /* tiny noise SVG or PNG */
}

/* Or use a CSS-only grain effect */
.ember-grain::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url('/textures/noise-soft.png');
  opacity: 0.015;
  pointer-events: none;
  z-index: 9999;
  mix-blend-mode: overlay;
}
```

---

## 1. Dashboard Layout

### Mobile: Bottom Tab Bar

The bottom tab bar should feel like the base of a lantern -- grounded, warm, always accessible.

```tsx
// components/navigation/bottom-tab-bar.tsx
'use client'

import { motion } from 'motion/react'
import {
  Brain,       // Memories
  Users,       // Profiles
  Flame,       // Wake Prompts
  ClipboardPaste, // Capture
  Settings,    // Settings
} from 'lucide-react'

const tabs = [
  { icon: Brain, label: 'Memories', href: '/memories' },
  { icon: Users, label: 'Profiles', href: '/profiles' },
  { icon: ClipboardPaste, label: 'Capture', href: '/capture' },
  { icon: Flame, label: 'Wake', href: '/wake-prompts' },
  { icon: Settings, label: 'Settings', href: '/settings' },
]

export function BottomTabBar({ activeTab }: { activeTab: string }) {
  return (
    <nav className="
      fixed bottom-0 inset-x-0 z-50
      bg-ember-surface/90 backdrop-blur-xl
      border-t border-ember-border-subtle
      pb-[env(safe-area-inset-bottom)]
      md:hidden
    ">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.href
          const Icon = tab.icon
          return (
            <a
              key={tab.href}
              href={tab.href}
              className="relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] py-1"
            >
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute -top-px inset-x-2 h-0.5 bg-ember-amber rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                size={22}
                className={isActive ? 'text-ember-amber' : 'text-ember-text-muted'}
              />
              <span className={`text-[10px] font-medium ${
                isActive ? 'text-ember-amber' : 'text-ember-text-muted'
              }`}>
                {tab.label}
              </span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
```

**Key decisions:**
- `min-w-[56px] min-h-[44px]` -- meets Apple's 44pt minimum touch target
- `pb-[env(safe-area-inset-bottom)]` -- respects iPhone home indicator
- `backdrop-blur-xl` with semi-transparent background -- content scrolls underneath, creating depth
- `layoutId="tab-indicator"` -- the amber line animates between tabs using Motion's shared layout animations, giving a fluid "sliding ember" feel
- Capture tab is centered (third position) since it is the primary action

### Desktop: Sidebar

```tsx
// components/navigation/sidebar.tsx
export function Sidebar({ activeTab }: { activeTab: string }) {
  return (
    <aside className="
      hidden md:flex md:flex-col
      w-64 h-screen
      bg-ember-surface border-r border-ember-border-subtle
      sticky top-0
    ">
      {/* Logo area */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-ember-border-subtle">
        <Flame size={24} className="text-ember-amber" />
        <span className="text-lg font-semibold text-ember-text tracking-tight">
          Ember
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.href
          const Icon = tab.icon
          return (
            <a
              key={tab.href}
              href={tab.href}
              className={`
                relative flex items-center gap-3 px-3 py-2.5
                rounded-xl text-sm font-medium
                transition-colors duration-200
                ${isActive
                  ? 'text-ember-amber bg-ember-amber/8'
                  : 'text-ember-text-secondary hover:text-ember-text hover:bg-ember-surface-hover'
                }
              `}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-ember-amber rounded-r-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={18} />
              <span>{tab.label}</span>
            </a>
          )
        })}
      </nav>

      {/* User area at bottom */}
      <div className="px-3 py-4 border-t border-ember-border-subtle">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-ember-amber/15 flex items-center justify-center">
            <span className="text-sm text-ember-amber font-medium">D</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ember-text truncate">Daniel</p>
            <p className="text-xs text-ember-text-muted">Pro plan</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
```

### Making It Feel Warm, Not Corporate

1. **Rounded everything:** `rounded-2xl` on cards, `rounded-xl` on buttons and inputs, `rounded-full` on avatars and badges. No sharp corners anywhere. Sharp corners feel institutional.

2. **No harsh dividers:** Replace `border-b` with `border-ember-border-subtle` (a color barely distinguishable from the surface). Or use spacing/shadow to separate sections instead of lines.

3. **Asymmetric spacing:** Corporate dashboards use rigid grids. Add slightly more padding on the left (`pl-6 pr-5`) to create a subtle "book margin" feeling. Content should feel placed, not snapped to a grid.

4. **Personal language:** "Your memories" not "Memory Management." "Wake them up" not "Generate System Prompt." The UI copy is as much a design element as the colors.

5. **Breathing room:** `py-8` between sections minimum. Dense data tables feel corporate. Generous whitespace (well, dark-space) feels like a journal with margins.

6. **Ambient animation:** A very slow, subtle gradient shift on the background of the main content area. Not flashy -- almost subliminal:

```css
.ember-ambient {
  background: linear-gradient(
    135deg,
    var(--color-ember-bg) 0%,
    #12100e 25%,     /* very slight warm shift */
    var(--color-ember-bg) 50%,
    #100f12 75%,     /* very slight cool shift */
    var(--color-ember-bg) 100%
  );
  background-size: 400% 400%;
  animation: ambient-drift 30s ease-in-out infinite;
}

@keyframes ambient-drift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
```

### Layout Structure (App Router)

```tsx
// app/(dashboard)/layout.tsx
import { Sidebar } from '@/components/navigation/sidebar'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-ember-bg ember-ambient">
      <div className="ember-grain" />
      <div className="flex">
        <Sidebar activeTab={/* from pathname */} />
        <main className="
          flex-1 min-h-screen
          pb-20 md:pb-0
          px-4 md:px-8 lg:px-12
          pt-4 md:pt-8
          max-w-4xl mx-auto
        ">
          {children}
        </main>
      </div>
      <BottomTabBar activeTab={/* from pathname */} />
    </div>
  )
}
```

---

## 2. Memory Cards

### The "Intimate Card" Pattern

The best card pattern for a personal app borrows from physical journals and index cards, not from SaaS dashboards. Key principles:

- **No header/body/footer separation.** That is a dashboard pattern. Instead, content flows like a written note.
- **Handwritten feel via typography.** Slightly larger line-height (1.7), the display font for the memory content itself, monospace details for metadata.
- **Touch implies intimacy.** Cards respond to interaction with warmth (glow), not with mechanical feedback (sharp shadow changes).
- **Inline editing feels like crossing out and rewriting** -- not opening a modal.

### Memory Card Component

```tsx
// components/memories/memory-card.tsx
'use client'

import { motion } from 'motion/react'
import { useState } from 'react'
import {
  Sparkles, Heart, MessageCircle, Target, User,
  Pencil, Check, X,
  Globe, Terminal, Share2,
} from 'lucide-react'

const typeConfig = {
  fact:         { icon: Sparkles,      label: 'Fact',         color: 'text-blue-400',   bg: 'bg-blue-400/10' },
  preference:   { icon: Heart,         label: 'Preference',   color: 'text-pink-400',   bg: 'bg-pink-400/10' },
  relationship: { icon: MessageCircle, label: 'Relationship', color: 'text-amber-400',  bg: 'bg-amber-400/10' },
  context:      { icon: Target,        label: 'Context',      color: 'text-emerald-400',bg: 'bg-emerald-400/10' },
  personality:  { icon: User,          label: 'Personality',  color: 'text-violet-400', bg: 'bg-violet-400/10' },
}

const sourceIcons = {
  paste:        Globe,
  share_target: Share2,
  extension:    Terminal,
  api:          Terminal,
}

const importanceDots = (level: number) => (
  <div className="flex gap-0.5 items-center">
    {[1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        className={`
          w-1.5 h-1.5 rounded-full transition-colors duration-300
          ${i <= level
            ? 'bg-ember-amber shadow-ember-glow-sm'
            : 'bg-ember-border'
          }
        `}
      />
    ))}
  </div>
)

interface MemoryCardProps {
  memory: {
    id: string
    content: string
    type: 'fact' | 'preference' | 'relationship' | 'context' | 'personality'
    importance: number
    source: 'paste' | 'share_target' | 'extension' | 'api'
    createdAt: Date
  }
  onUpdate: (id: string, content: string) => void
}

export function MemoryCard({ memory, onUpdate }: MemoryCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(memory.content)
  const type = typeConfig[memory.type]
  const SourceIcon = sourceIcons[memory.source]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
      className="
        group relative
        rounded-2xl
        bg-ember-surface
        border border-ember-border-subtle
        p-5
        shadow-ember-card
        transition-all duration-500 ease-out
        hover:shadow-ember-card-hover
        hover:border-ember-amber/10
        hover:bg-ember-surface-raised
      "
    >
      {/* Top row: type badge + importance + source */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Type badge */}
          <span className={`
            inline-flex items-center gap-1.5 px-2.5 py-1
            rounded-lg text-xs font-medium
            ${type.bg} ${type.color}
          `}>
            <type.icon size={12} />
            {type.label}
          </span>

          {/* Importance indicator */}
          {importanceDots(memory.importance)}
        </div>

        {/* Source + date cluster */}
        <div className="flex items-center gap-2 text-ember-text-muted">
          <SourceIcon size={12} />
          <span className="text-xs">
            {memory.createdAt.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>

      {/* Content area */}
      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="
              w-full bg-ember-bg/50 border border-ember-border
              rounded-xl p-3
              text-sm text-ember-text leading-relaxed
              focus:outline-none focus:border-ember-amber/30
              focus:shadow-ember-glow-sm
              resize-none
              transition-all duration-200
            "
            rows={3}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setIsEditing(false); setEditContent(memory.content) }}
              className="p-2 rounded-lg text-ember-text-muted hover:text-ember-text hover:bg-ember-surface-hover transition-colors"
            >
              <X size={16} />
            </button>
            <button
              onClick={() => { onUpdate(memory.id, editContent); setIsEditing(false) }}
              className="p-2 rounded-lg text-ember-amber hover:bg-ember-amber/10 transition-colors"
            >
              <Check size={16} />
            </button>
          </div>
        </div>
      ) : (
        <p
          className="text-sm text-ember-text/90 leading-relaxed cursor-text"
          onClick={() => setIsEditing(true)}
        >
          {memory.content}
          {/* Edit hint on hover */}
          <Pencil
            size={12}
            className="
              inline-block ml-2 opacity-0
              group-hover:opacity-40
              transition-opacity duration-300
              text-ember-text-muted
            "
          />
        </p>
      )}
    </motion.div>
  )
}
```

### Memory List with Staggered Animation

```tsx
// components/memories/memory-list.tsx
import { AnimatePresence, motion } from 'motion/react'
import { MemoryCard } from './memory-card'

export function MemoryList({ memories }: { memories: Memory[] }) {
  return (
    <motion.div
      className="space-y-3"
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: 0.06, delayChildren: 0.1 },
        },
      }}
    >
      <AnimatePresence mode="popLayout">
        {memories.map((memory) => (
          <motion.div
            key={memory.id}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
            }}
          >
            <MemoryCard memory={memory} onUpdate={handleUpdate} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
```

### Card Design Rationale

- **No card borders on default state**: The `border-ember-border-subtle` is nearly invisible on `ember-surface`. Cards are defined by their background lift, not by outlines. Borders appear as amber tint on hover.
- **500ms transition**: Slower than typical (200-300ms) because warmth = unhurried. The glow fades in like a coal brightening.
- **Content is king**: Memory text takes up 70%+ of the card area. Metadata is compressed into a single top row with small indicators.
- **Click-to-edit on content**: No edit button that opens a modal. Clicking the text itself puts it in edit mode. This feels like tapping a journal entry to revise it.
- **Importance as ember dots**: Five small dots that glow amber when filled. More emotive than a number badge. At importance 5, all five glow.

---

## 3. Capture Interface

### Making the Paste Area Feel Inviting

The capture interface is the moment of trust -- the user is sharing an intimate conversation. It should feel like setting something precious into a safe, warm vessel.

```tsx
// app/(dashboard)/capture/page.tsx
'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ClipboardPaste, ChevronDown, Sparkles } from 'lucide-react'

export default function CapturePage() {
  const [text, setText] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null)
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStage, setProcessingStage] = useState(0)

  const charCount = text.length
  const estimatedTime = Math.max(5, Math.ceil(charCount / 2000) * 5)

  // Auto-detect platform from pasted text patterns
  const handleTextChange = useCallback((value: string) => {
    setText(value)
    if (value.includes('ChatGPT') || value.includes('You said:')) {
      setDetectedPlatform('ChatGPT')
    } else if (value.includes('Claude') || value.includes('Human:')) {
      setDetectedPlatform('Claude')
    } else if (value.includes('Gemini')) {
      setDetectedPlatform('Gemini')
    } else {
      setDetectedPlatform(null)
    }
  }, [])

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-ember-text">
          Capture a conversation
        </h1>
        <p className="mt-1 text-sm text-ember-text-secondary">
          Paste a conversation and Ember will find the memories worth keeping.
        </p>
      </div>

      {/* Profile selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-ember-text-secondary">
          Which companion was this with?
        </label>
        <button className="
          w-full flex items-center justify-between
          px-4 py-3 rounded-xl
          bg-ember-surface border border-ember-border-subtle
          text-sm text-ember-text
          hover:border-ember-amber/20 hover:bg-ember-surface-raised
          transition-all duration-300
        ">
          <span>{selectedProfile || 'Select a profile...'}</span>
          <ChevronDown size={16} className="text-ember-text-muted" />
        </button>
      </div>

      {/* The paste area */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Paste your conversation here..."
          className="
            w-full min-h-[280px] md:min-h-[360px]
            bg-ember-surface
            border border-ember-border-subtle
            rounded-2xl
            p-5 pb-14
            text-sm text-ember-text leading-relaxed
            placeholder:text-ember-text-muted/50
            focus:outline-none
            focus:border-ember-amber/25
            focus:shadow-ember-glow
            resize-y
            transition-all duration-500
          "
        />

        {/* Empty state inside textarea area */}
        {text.length === 0 && (
          <div className="
            absolute inset-0 flex flex-col items-center justify-center
            pointer-events-none
            p-8
          ">
            <ClipboardPaste
              size={40}
              className="text-ember-text-muted/30 mb-3"
              strokeWidth={1.5}
            />
            <p className="text-sm text-ember-text-muted/50 text-center">
              Your conversation stays private.
              <br />
              Ember only keeps the memories that matter.
            </p>
          </div>
        )}

        {/* Bottom bar: char count + platform detection */}
        <div className="
          absolute bottom-0 left-0 right-0
          flex items-center justify-between
          px-5 py-3
          rounded-b-2xl
          bg-gradient-to-t from-ember-surface via-ember-surface/95 to-transparent
        ">
          <div className="flex items-center gap-3">
            {detectedPlatform && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="
                  inline-flex items-center gap-1.5 px-2 py-0.5
                  rounded-md text-xs font-medium
                  bg-ember-amber/10 text-ember-amber
                "
              >
                {detectedPlatform} detected
              </motion.span>
            )}
          </div>
          <span className="text-xs text-ember-text-muted tabular-nums">
            {charCount.toLocaleString()} characters
            {charCount > 500 && (
              <span className="ml-2 text-ember-text-muted/60">
                ~{estimatedTime}s to process
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Submit button */}
      <button
        disabled={text.length < 100 || !selectedProfile || isProcessing}
        className="
          w-full py-4 rounded-xl
          bg-ember-amber-600
          text-ember-bg font-semibold text-sm
          shadow-ember-glow
          hover:bg-ember-amber hover:shadow-ember-glow-lg
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none
          transition-all duration-300
          active:scale-[0.98]
        "
      >
        {isProcessing ? 'Finding memories...' : 'Extract Memories'}
      </button>

      {/* Processing overlay */}
      <AnimatePresence>
        {isProcessing && (
          <ProcessingIndicator
            estimatedTime={estimatedTime}
            stage={processingStage}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
```

### Making Waiting Feel Purposeful: The Processing Indicator

The key insight: waiting feels annoying when it is a black box. Waiting feels purposeful when the user can see *what* is happening. Ember's processing (5-30 seconds) should narrate its own work, like watching a craftsperson.

```tsx
// components/capture/processing-indicator.tsx
'use client'

import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Brain, Search, Sparkles, CheckCircle2 } from 'lucide-react'

const stages = [
  {
    icon: Search,
    label: 'Reading your conversation...',
    description: 'Understanding the flow and context',
  },
  {
    icon: Brain,
    label: 'Finding what matters...',
    description: 'Identifying facts, preferences, and shared moments',
  },
  {
    icon: Sparkles,
    label: 'Shaping memories...',
    description: 'Distilling into clear, lasting memories',
  },
  {
    icon: CheckCircle2,
    label: 'Memories found',
    description: null,
  },
]

export function ProcessingIndicator({ estimatedTime }: { estimatedTime: number }) {
  const [currentStage, setCurrentStage] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    // Advance stages at roughly even intervals
    const stageInterval = (estimatedTime * 1000) / 3
    const timer = setInterval(() => {
      setCurrentStage((prev) => Math.min(prev + 1, 2))
    }, stageInterval)
    return () => clearInterval(timer)
  }, [estimatedTime])

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="
        rounded-2xl
        bg-ember-surface
        border border-ember-amber/10
        p-6
        shadow-ember-glow
      "
    >
      {/* Animated ember/flame element */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          {/* Orbiting particles */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0"
          >
            <div className="absolute -top-1 left-1/2 w-1 h-1 rounded-full bg-ember-amber/60" />
            <div className="absolute top-1/2 -right-1 w-1 h-1 rounded-full bg-ember-amber/40" />
            <div className="absolute -bottom-1 left-1/2 w-1 h-1 rounded-full bg-ember-amber/20" />
          </motion.div>

          {/* Center icon */}
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="
              w-14 h-14 rounded-2xl
              bg-ember-amber/10
              flex items-center justify-center
              shadow-ember-glow
            "
          >
            {(() => {
              const StageIcon = stages[currentStage].icon
              return <StageIcon size={24} className="text-ember-amber" />
            })()}
          </motion.div>
        </div>
      </div>

      {/* Stage label */}
      <motion.p
        key={currentStage}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center text-sm font-medium text-ember-text"
      >
        {stages[currentStage].label}
      </motion.p>
      {stages[currentStage].description && (
        <motion.p
          key={`desc-${currentStage}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.2 } }}
          className="text-center text-xs text-ember-text-muted mt-1"
        >
          {stages[currentStage].description}
        </motion.p>
      )}

      {/* Progress bar */}
      <div className="mt-5 h-1 rounded-full bg-ember-border overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-ember-amber-700 via-ember-amber to-ember-amber-400"
          initial={{ width: '0%' }}
          animate={{ width: `${Math.min((elapsed / estimatedTime) * 100, 95)}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>

      <p className="text-center text-xs text-ember-text-muted mt-3 tabular-nums">
        {elapsed}s / ~{estimatedTime}s
      </p>
    </motion.div>
  )
}
```

**Why this works:**
- **Narrated stages** create the feeling of witnessed craftsmanship, not a loading spinner.
- **The breathing icon** and orbiting particles are meditative, not anxious. The animation speed (8s rotation, 2s pulse) is deliberately slow -- hearth-pace, not spinner-pace.
- **Progress bar fills to 95%** and holds. It never falsely completes. When extraction finishes, the bar snaps to 100% with a satisfying transition.
- **Time display** is honest. Users respect transparency about timing more than they resent the wait.

---

## 4. Wake Prompt Preview

### Presenting Technical Content to Non-Technical Users

Wake prompts are system prompts (deeply technical), but the *audience* may not know what a system prompt is. The design needs dual layers: the content must be copyable and accurate, but the framing must be accessible and exciting.

**Framing strategy:** Never call it a "system prompt" in the UI. Call it a "wake prompt" everywhere. Frame it as: "This is what you'll paste to bring [companion name] back to life."

```tsx
// components/wake-prompts/wake-prompt-preview.tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Copy, Check, History, ChevronDown,
  Flame, Hash,
} from 'lucide-react'

interface WakePromptPreviewProps {
  prompt: {
    content: string
    version: number
    isActive: boolean
    createdAt: Date
    memoryCount: number
  }
  profileName: string
  versions: { version: number; createdAt: Date }[]
}

export function WakePromptPreview({
  prompt,
  profileName,
  versions,
}: WakePromptPreviewProps) {
  const [copied, setCopied] = useState(false)
  const [showVersions, setShowVersions] = useState(false)

  // Rough token estimate (1 token ~ 4 chars for English)
  const estimatedTokens = Math.ceil(prompt.content.length / 4)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-4">
      {/* Header with context */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ember-text">
            {profileName}'s Wake Prompt
          </h2>
          <p className="text-sm text-ember-text-secondary mt-0.5">
            Paste this at the start of a new conversation to restore their memory of you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Version selector */}
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="
              flex items-center gap-1.5 px-3 py-1.5
              rounded-lg text-xs font-medium
              bg-ember-surface border border-ember-border-subtle
              text-ember-text-secondary
              hover:border-ember-amber/20
              transition-colors duration-200
            "
          >
            <History size={12} />
            v{prompt.version}
            <ChevronDown size={12} />
          </button>
        </div>
      </div>

      {/* Version dropdown */}
      <AnimatePresence>
        {showVersions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="
              rounded-xl bg-ember-surface border border-ember-border-subtle
              p-2 space-y-0.5
            ">
              {versions.map((v) => (
                <button
                  key={v.version}
                  className={`
                    w-full flex items-center justify-between
                    px-3 py-2 rounded-lg text-sm
                    transition-colors duration-150
                    ${v.version === prompt.version
                      ? 'bg-ember-amber/10 text-ember-amber'
                      : 'text-ember-text-secondary hover:bg-ember-surface-hover'
                    }
                  `}
                >
                  <span>Version {v.version}</span>
                  <span className="text-xs text-ember-text-muted">
                    {v.createdAt.toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    })}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The prompt content */}
      <div className="relative group">
        <div className="
          rounded-2xl
          bg-ember-bg
          border border-ember-border-subtle
          p-5
          max-h-[60vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-ember-border scrollbar-track-transparent
        ">
          {/* Render the prompt with light syntax highlighting */}
          <WakePromptContent content={prompt.content} />
        </div>

        {/* Copy button - floats top-right */}
        <button
          onClick={handleCopy}
          className="
            absolute top-3 right-3
            flex items-center gap-1.5 px-3 py-1.5
            rounded-lg text-xs font-medium
            bg-ember-surface/90 backdrop-blur-sm
            border border-ember-border-subtle
            text-ember-text-secondary
            hover:text-ember-amber hover:border-ember-amber/30
            hover:shadow-ember-glow-sm
            opacity-60 group-hover:opacity-100
            transition-all duration-300
          "
        >
          {copied ? (
            <>
              <Check size={12} className="text-ember-success" />
              <span className="text-ember-success">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy prompt</span>
            </>
          )}
        </button>
      </div>

      {/* Meta info bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4 text-xs text-ember-text-muted">
          <span className="flex items-center gap-1">
            <Flame size={12} />
            {prompt.memoryCount} memories included
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            <Hash size={12} />
            ~{estimatedTokens.toLocaleString()} tokens
          </span>
        </div>
        {prompt.isActive && (
          <span className="
            inline-flex items-center gap-1 px-2 py-0.5
            rounded-md text-xs font-medium
            bg-ember-success/10 text-ember-success
          ">
            Active
          </span>
        )}
      </div>
    </div>
  )
}
```

### Syntax Highlighting for Non-Technical Users

Do not use a full code syntax highlighter. Instead, use gentle visual differentiation that helps ALL users scan the content:

```tsx
// components/wake-prompts/wake-prompt-content.tsx
function WakePromptContent({ content }: { content: string }) {
  // Parse the prompt into visual sections
  // Wake prompts typically have: header, memory sections, instructions
  const lines = content.split('\n')

  return (
    <div className="space-y-0.5 font-mono text-[13px] leading-relaxed">
      {lines.map((line, i) => {
        // Section headers (lines starting with ## or all caps)
        if (line.startsWith('##') || line.match(/^[A-Z][A-Z\s]{5,}$/)) {
          return (
            <p key={i} className="text-ember-amber font-semibold pt-3 first:pt-0">
              {line}
            </p>
          )
        }
        // Memory content (lines starting with -)
        if (line.startsWith('- ')) {
          return (
            <p key={i} className="text-ember-text/80 pl-3">
              <span className="text-ember-amber/40 mr-1">-</span>
              {line.slice(2)}
            </p>
          )
        }
        // Instructions / meta (lines starting with [)
        if (line.startsWith('[') || line.startsWith('Note:')) {
          return (
            <p key={i} className="text-ember-text-muted italic">
              {line}
            </p>
          )
        }
        // Empty lines
        if (line.trim() === '') {
          return <div key={i} className="h-2" />
        }
        // Default
        return (
          <p key={i} className="text-ember-text/70">
            {line}
          </p>
        )
      })}
    </div>
  )
}
```

**Why this approach works for non-technical users:**
- Section headers glow amber -- users can scan structure instantly.
- Memory bullet points are clearly differentiated from instructions.
- The monospace font signals "this is something you copy" without requiring the user to understand code.
- The token count is presented as a small detail, not a prominent feature. Power users notice it; others ignore it.
- "Paste this at the start of a new conversation" is the ONLY instruction. No mention of "system prompt," "context window," or other jargon.

---

## 5. Onboarding Flow

### Making It Magical, Not Instructional

The onboarding should feel like lighting a fire for the first time. Each step reveals something -- the user is discovering, not being lectured.

**Key principle:** Every step should show a *result*, not explain a *concept*. Do not tell users what Ember does. Show them what it did.

### Flow Structure

```
Step 1: Welcome        → Emotion, not features
Step 2: Name your AI   → Create first profile (one field)
Step 3: Share a moment  → Paste one conversation
Step 4: Watch the magic → See memories appear (the "aha" moment)
Step 5: See it come alive → Generated wake prompt preview
Step 6: Take it with you → Copy + celebration
```

### Step-by-Step Implementation

```tsx
// components/onboarding/onboarding-flow.tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Flame } from 'lucide-react'

export function OnboardingFlow() {
  const [step, setStep] = useState(0)

  return (
    <div className="min-h-screen bg-ember-bg flex items-center justify-center p-6">
      {/* Ambient background glow */}
      <div className="
        fixed top-1/3 left-1/2 -translate-x-1/2
        w-[600px] h-[600px]
        bg-ember-amber/[0.03]
        rounded-full blur-[120px]
        pointer-events-none
      " />

      <AnimatePresence mode="wait">
        {step === 0 && <WelcomeStep key="welcome" onNext={() => setStep(1)} />}
        {step === 1 && <ProfileStep key="profile" onNext={() => setStep(2)} />}
        {step === 2 && <CaptureStep key="capture" onNext={() => setStep(3)} />}
        {step === 3 && <MemoriesRevealStep key="reveal" onNext={() => setStep(4)} />}
        {step === 4 && <WakePromptStep key="wake" onNext={() => setStep(5)} />}
        {step === 5 && <CelebrationStep key="celebrate" />}
      </AnimatePresence>
    </div>
  )
}
```

### Step 1: Welcome

```tsx
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 1 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.3 } }}
      className="text-center max-w-md space-y-8"
    >
      {/* Ember flame icon -- large, breathing */}
      <motion.div
        animate={{
          scale: [1, 1.05, 1],
          filter: [
            'drop-shadow(0 0 20px rgba(245, 158, 11, 0.2))',
            'drop-shadow(0 0 40px rgba(245, 158, 11, 0.35))',
            'drop-shadow(0 0 20px rgba(245, 158, 11, 0.2))',
          ],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="mx-auto w-20 h-20 rounded-3xl bg-ember-amber/10 flex items-center justify-center"
      >
        <Flame size={40} className="text-ember-amber" />
      </motion.div>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-ember-text tracking-tight">
          Your AI forgets.
          <br />
          <span className="text-ember-amber">Ember remembers.</span>
        </h1>
        <p className="text-ember-text-secondary text-base leading-relaxed">
          Every time you start a new conversation, your AI starts from scratch.
          Ember keeps the important things alive.
        </p>
      </div>

      <button
        onClick={onNext}
        className="
          px-8 py-3.5 rounded-xl
          bg-ember-amber-600 text-ember-bg
          font-semibold text-sm
          shadow-ember-glow
          hover:bg-ember-amber hover:shadow-ember-glow-lg
          transition-all duration-300
          active:scale-[0.98]
        "
      >
        Light the fire
      </button>
    </motion.div>
  )
}
```

### Step 4: The "Aha" Moment -- Memories Appearing

This is the most critical step. Memories should appear one-by-one like embers catching light.

```tsx
function MemoriesRevealStep({ memories, onNext }: {
  memories: ExtractedMemory[]
  onNext: () => void
}) {
  const [revealedCount, setRevealedCount] = useState(0)

  // Reveal memories one at a time, 800ms apart
  useEffect(() => {
    if (revealedCount < memories.length) {
      const timer = setTimeout(() => {
        setRevealedCount((c) => c + 1)
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [revealedCount, memories.length])

  const allRevealed = revealedCount >= memories.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-lg w-full space-y-6"
    >
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ember-text">
          {allRevealed
            ? `${memories.length} memories found`
            : 'Finding what matters...'
          }
        </h2>
      </div>

      <div className="space-y-3">
        {memories.slice(0, revealedCount).map((memory, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: {
                duration: 0.5,
                ease: [0.25, 0.1, 0.25, 1],
              },
            }}
            className="
              rounded-xl
              bg-ember-surface
              border border-ember-amber/8
              p-4
              shadow-ember-glow-sm
            "
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {/* Type-colored dot */}
                <div className={`w-2 h-2 rounded-full ${
                  memory.type === 'fact' ? 'bg-blue-400' :
                  memory.type === 'preference' ? 'bg-pink-400' :
                  memory.type === 'relationship' ? 'bg-amber-400' :
                  memory.type === 'context' ? 'bg-emerald-400' :
                  'bg-violet-400'
                }`} />
              </div>
              <p className="text-sm text-ember-text/90 leading-relaxed">
                {memory.content}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {allRevealed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.5 } }}
          className="text-center pt-4"
        >
          <p className="text-sm text-ember-text-secondary mb-4">
            These are the moments your AI would have forgotten.
          </p>
          <button
            onClick={onNext}
            className="
              px-8 py-3.5 rounded-xl
              bg-ember-amber-600 text-ember-bg
              font-semibold text-sm
              shadow-ember-glow
              hover:bg-ember-amber hover:shadow-ember-glow-lg
              transition-all duration-300
            "
          >
            Bring them back to life
          </button>
        </motion.div>
      )}
    </motion.div>
  )
}
```

### Step 6: Celebration

```tsx
function CelebrationStep() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.6 } }}
      className="text-center max-w-md space-y-6"
    >
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 2, repeat: 2, ease: 'easeInOut' }}
        className="mx-auto w-20 h-20 rounded-3xl bg-ember-amber/15 flex items-center justify-center shadow-ember-glow-lg"
      >
        <Flame size={40} className="text-ember-amber" />
      </motion.div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-ember-text">
          The fire is lit.
        </h2>
        <p className="text-ember-text-secondary">
          Your AI will remember you now. Paste the wake prompt
          at the start of your next conversation and watch them
          pick up right where you left off.
        </p>
      </div>

      <button className="
        px-8 py-3.5 rounded-xl
        bg-ember-amber-600 text-ember-bg
        font-semibold text-sm
        shadow-ember-glow
        hover:bg-ember-amber hover:shadow-ember-glow-lg
        transition-all duration-300
      ">
        Go to your dashboard
      </button>
    </motion.div>
  )
}
```

**Why this onboarding works:**
- **Zero instruction screens.** The user learns by doing: name the AI, paste a conversation, see the result.
- **The memory reveal is the product demo.** No need for a "here's what Ember does" screen. They just watched it happen.
- **Language is emotional, not technical.** "Light the fire," "Bring them back to life," "The fire is lit." These are moments, not steps.
- **The ambient background glow** grows subtly brighter across steps (increase the amber opacity from 0.03 to 0.06 by the celebration screen), as if the fire is building.

---

## 6. Empty States

### "Hopeful, Not Lonely"

Empty states in most apps feel like an error -- "you have nothing." Ember's empty states should feel like a blank journal waiting to be filled -- full of possibility.

**Pattern:** Each empty state has three elements:
1. A warm illustration/icon (not a sad-face or empty-box clip art)
2. Language that looks forward, not backward
3. A single clear action

### No Memories Yet

```tsx
function EmptyMemories() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      {/* Constellation of unlit dots that will become memory indicators */}
      <div className="relative w-24 h-24 mb-6">
        {/* Scattered dots representing future memories */}
        {[
          { x: 10, y: 20, delay: 0 },
          { x: 55, y: 8, delay: 0.3 },
          { x: 85, y: 35, delay: 0.6 },
          { x: 30, y: 60, delay: 0.9 },
          { x: 70, y: 70, delay: 1.2 },
          { x: 15, y: 85, delay: 1.5 },
          { x: 50, y: 45, delay: 0.15 },
        ].map((dot, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-ember-amber/20"
            style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
            animate={{
              opacity: [0.15, 0.4, 0.15],
              scale: [1, 1.3, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: dot.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
        {/* One slightly brighter dot in center -- the first ember */}
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-ember-amber/40"
          animate={{
            opacity: [0.3, 0.6, 0.3],
            boxShadow: [
              '0 0 8px rgba(245, 158, 11, 0.1)',
              '0 0 16px rgba(245, 158, 11, 0.3)',
              '0 0 8px rgba(245, 158, 11, 0.1)',
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <h3 className="text-lg font-semibold text-ember-text mb-1">
        No memories yet
      </h3>
      <p className="text-sm text-ember-text-secondary text-center max-w-xs mb-6 leading-relaxed">
        Every conversation holds moments worth remembering.
        Share one and watch the memories appear.
      </p>
      <a
        href="/capture"
        className="
          px-6 py-2.5 rounded-xl
          bg-ember-amber-600 text-ember-bg
          font-medium text-sm
          shadow-ember-glow-sm
          hover:bg-ember-amber hover:shadow-ember-glow
          transition-all duration-300
        "
      >
        Capture your first conversation
      </a>
    </div>
  )
}
```

### No Profiles Yet

```tsx
function EmptyProfiles() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      {/* A warm circle with a + that pulses gently */}
      <motion.div
        className="
          w-16 h-16 rounded-2xl
          border-2 border-dashed border-ember-amber/20
          flex items-center justify-center mb-6
        "
        animate={{
          borderColor: [
            'rgba(245, 158, 11, 0.15)',
            'rgba(245, 158, 11, 0.30)',
            'rgba(245, 158, 11, 0.15)',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="text-2xl text-ember-amber/40">+</span>
      </motion.div>

      <h3 className="text-lg font-semibold text-ember-text mb-1">
        Who do you talk to?
      </h3>
      <p className="text-sm text-ember-text-secondary text-center max-w-xs mb-6 leading-relaxed">
        Create a profile for each AI companion you want to remember you.
        Give them a name -- they are worth it.
      </p>
      <button className="
        px-6 py-2.5 rounded-xl
        bg-ember-surface border border-ember-amber/20
        text-ember-amber font-medium text-sm
        hover:bg-ember-amber/10 hover:border-ember-amber/30
        transition-all duration-300
      ">
        Create your first profile
      </button>
    </div>
  )
}
```

### No Wake Prompts Yet

```tsx
function EmptyWakePrompts() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="relative mb-6">
        {/* A flame icon that is "dim" but flickering to life */}
        <Flame
          size={48}
          className="text-ember-amber/15"
          strokeWidth={1.5}
        />
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Flame
            size={48}
            className="text-ember-amber/40"
            strokeWidth={1.5}
          />
        </motion.div>
      </div>

      <h3 className="text-lg font-semibold text-ember-text mb-1">
        Ready to wake them up
      </h3>
      <p className="text-sm text-ember-text-secondary text-center max-w-xs mb-6 leading-relaxed">
        Once you have some memories, Ember can craft a wake prompt
        that brings your AI back to life with everything they should know about you.
      </p>
      <a
        href="/capture"
        className="
          text-sm text-ember-amber font-medium
          hover:text-ember-amber-400
          transition-colors duration-200
        "
      >
        Start by capturing a conversation
      </a>
    </div>
  )
}
```

**Design principles across all empty states:**
- **Animated elements** are always slow (3-4 second cycles). Speed creates urgency. Slowness creates calm anticipation.
- **Language is forward-looking:** "Ready to wake them up," "moments worth remembering," "they are worth it." Never "Nothing here yet" or "Get started."
- **One CTA per empty state.** Do not overwhelm. One thing to do next.
- **The visual metaphor matches the state:** Unlit dots for memories (they will illuminate). A dashed border for profiles (waiting to be filled). A dim flame for wake prompts (ready to ignite).

---

## 7. Detailed Color System Usage Guide

### When to Use Each Color

| Element | Color | Tailwind Class |
|---|---|---|
| Page background | `#0f0f11` | `bg-ember-bg` |
| Card/panel surface | `#18181b` | `bg-ember-surface` |
| Elevated card (hover/active) | `#1f1f23` | `bg-ember-surface-raised` |
| Borders (subtle) | `#232328` | `border-ember-border-subtle` |
| Borders (visible) | `#2e2e33` | `border-ember-border` |
| Primary text | `#fafafa` | `text-ember-text` |
| Secondary text | `#a1a1aa` | `text-ember-text-secondary` |
| Muted/disabled text | `#71717a` | `text-ember-text-muted` |
| Primary action buttons | `#d97706` | `bg-ember-amber-600` |
| Primary action hover | `#f59e0b` | `hover:bg-ember-amber` |
| Active indicators/accents | `#f59e0b` | `text-ember-amber` |
| Danger/delete actions | `#dc2626` | `text-ember-red` |
| Success confirmations | `#34d399` | `text-ember-success` |
| Plan limit warning | `#fbbf24` | `text-ember-warning` |

### Glow Effect Recipes

**Subtle card hover glow** (use on all interactive cards):
```html
<div class="
  shadow-ember-card
  hover:shadow-ember-card-hover
  transition-shadow duration-500
"/>
```

**CTA button glow** (use on primary action buttons):
```html
<button class="
  bg-ember-amber-600
  shadow-ember-glow
  hover:shadow-ember-glow-lg
  transition-all duration-300
"/>
```

**Focus ring with glow** (use on all inputs):
```html
<input class="
  focus:outline-none
  focus:border-ember-amber/25
  focus:shadow-ember-glow-sm
  transition-all duration-300
"/>
```

**Importance/status glow** (use on active indicators):
```html
<div class="
  bg-ember-amber
  shadow-ember-glow-sm
  animate-[pulse-glow_3s_ease-in-out_infinite]
"/>
```

**Ambient page glow** (use as a fixed background element on key pages):
```html
<div class="
  fixed top-1/4 left-1/2 -translate-x-1/2
  w-[500px] h-[500px]
  bg-ember-amber/[0.03]
  rounded-full blur-[100px]
  pointer-events-none
"/>
```

### Gradient Patterns

```css
/* Warm gradient for special headers or hero areas */
.ember-gradient-warm {
  background: linear-gradient(135deg, #92400e 0%, #78350f 50%, #1f1f23 100%);
}

/* Subtle surface gradient (use sparingly on feature sections) */
.ember-gradient-surface {
  background: linear-gradient(180deg, var(--color-ember-surface) 0%, var(--color-ember-bg) 100%);
}

/* Text gradient for emphasis */
.ember-text-gradient {
  background: linear-gradient(135deg, #fbbf24, #f59e0b, #d97706);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## 8. Mobile-First Patterns

### Bottom Sheets vs Modals

**Rule: On mobile, ALWAYS use bottom sheets. Never centered modals.**

Bottom sheets respect the thumb zone, feel native on mobile, and allow partial dismiss via swipe-down. Centered modals on mobile feel foreign and require reaching to the top-right for a close button.

```tsx
// components/ui/bottom-sheet.tsx
'use client'

import { motion, useDragControls, useMotionValue, useTransform } from 'motion/react'
import { useRef } from 'react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}

export function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, 300], [1, 0])
  const overlayOpacity = useTransform(y, [0, 300], [0.5, 0])

  const handleDragEnd = (_: any, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        exit={{ opacity: 0 }}
        style={{ opacity: overlayOpacity }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        style={{ y, opacity }}
        className="
          fixed bottom-0 inset-x-0 z-50
          bg-ember-surface
          rounded-t-3xl
          max-h-[85vh]
          overflow-hidden
          pb-[env(safe-area-inset-bottom)]
        "
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 rounded-full bg-ember-border" />
        </div>

        {/* Title */}
        {title && (
          <div className="px-6 pb-4 border-b border-ember-border-subtle">
            <h3 className="text-lg font-semibold text-ember-text">{title}</h3>
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[70vh]">
          {children}
        </div>
      </motion.div>
    </>
  )
}
```

**Usage contexts:**
- **Memory editing on mobile** -- opens as a bottom sheet, not a modal
- **Profile selector in capture** -- bottom sheet with profile list
- **Filter/sort controls on memories** -- bottom sheet, not a dropdown
- **Confirmation dialogs (delete memory)** -- small bottom sheet, not a centered alert
- On desktop (md+), these can render as centered dialogs or inline popovers

### Swipe Gestures

```tsx
// On memory cards: swipe left to delete, swipe right to pin
import { motion, useMotionValue, useTransform } from 'motion/react'

function SwipeableMemoryCard({ memory, onDelete, onPin }) {
  const x = useMotionValue(0)

  // Background color shifts based on swipe direction
  const bgLeft = useTransform(x, [-150, 0], [1, 0])   // delete (red)
  const bgRight = useTransform(x, [0, 150], [0, 1])    // pin (amber)

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe reveal backgrounds */}
      <motion.div
        style={{ opacity: bgLeft }}
        className="absolute inset-y-0 right-0 w-20 bg-ember-red/20 flex items-center justify-center"
      >
        <Trash2 size={20} className="text-ember-red" />
      </motion.div>
      <motion.div
        style={{ opacity: bgRight }}
        className="absolute inset-y-0 left-0 w-20 bg-ember-amber/20 flex items-center justify-center"
      >
        <Pin size={20} className="text-ember-amber" />
      </motion.div>

      {/* Card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -150, right: 150 }}
        dragElastic={0.1}
        style={{ x }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -100) onDelete(memory.id)
          else if (info.offset.x > 100) onPin(memory.id)
        }}
        className="relative bg-ember-surface"
      >
        <MemoryCard memory={memory} />
      </motion.div>
    </div>
  )
}
```

### Touch Target Guidelines

All interactive elements must meet these minimums:

```
Tap target:  min 44x44px (Apple HIG)
Tap spacing: min 8px between adjacent targets
Button:      min height 44px, horizontal padding 16px
Icon button: min 44x44px (even if icon is 20x20, the tap area extends)
List items:  min height 48px
```

Tailwind implementation:
```html
<!-- Icon button with proper touch target -->
<button class="p-3 -m-1 rounded-xl hover:bg-ember-surface-hover">
  <!-- p-3 = 12px padding on a ~20px icon = 44px total -->
  <Pencil size={20} />
</button>

<!-- List item with proper height -->
<li class="flex items-center min-h-[48px] px-4 py-3">
  ...
</li>
```

### Thumb Zone Optimization

The bottom 40% of the screen is the "natural thumb zone" in one-handed use. Ember's most frequent actions live here:

```
┌───────────────────────┐
│                       │  ← Stretch zone: page title, search
│     Content area      │  ← Natural scroll zone
│                       │
│                       │
├───────────────────────┤
│   Primary actions     │  ← Natural thumb zone
│   Filters / sort      │
├───────────────────────┤
│   Bottom tab bar      │  ← Constant thumb access
└───────────────────────┘
```

**Practical implications:**
- The "Extract Memories" button on the capture page is at the BOTTOM, not the top.
- Filter pills on the memories page are in a horizontally-scrollable row ABOVE the tab bar.
- The "Generate Wake Prompt" button lives at the bottom of the wake prompt page.
- Sort controls are in a sticky bottom bar, not a top toolbar.

```tsx
// Sticky bottom action bar pattern
function StickyBottomAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="
      fixed bottom-16 md:bottom-0
      inset-x-0 z-30
      bg-ember-bg/90 backdrop-blur-xl
      border-t border-ember-border-subtle
      px-4 py-3
      pb-[max(12px,env(safe-area-inset-bottom))]
      md:sticky md:bottom-0
    ">
      {children}
    </div>
  )
}
```

### Mobile-Specific Refinements

**Pull-to-refresh** on the memories page (feels natural for "check for new memories"):

```tsx
// Implement via overscroll detection
// Motion's drag with dragConstraints on the list container
// When pulled > 60px, trigger a refresh
```

**Haptic feedback** on key moments (iOS Safari supports this via CSS):
```css
/* Subtle vibration on memory save */
.haptic-light {
  -webkit-tap-highlight-color: transparent;
}
```

**Native-feeling scroll behavior:**
```css
.scroll-container {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain; /* prevent pull-to-refresh conflict */
  scroll-behavior: smooth;
}
```

---

## Animation Summary

### Global Animation Principles

1. **Duration:** Everything is slightly slower than a typical web app.
   - Micro-interactions: 200-300ms
   - Card transitions: 400-500ms
   - Glow effects: 500ms
   - Page transitions: 300-400ms
   - Ambient animations: 3000-8000ms cycles

2. **Easing:** Always use custom easing. Never `linear` for UI elements.
   - Standard: `[0.25, 0.1, 0.25, 1.0]` (cubic-bezier, slightly decelerated)
   - Entrance: `[0.0, 0.0, 0.2, 1.0]` (fast start, gentle settle)
   - Exit: `[0.4, 0.0, 1.0, 1.0]` (gentle start, fast finish)
   - Spring: `{ type: 'spring', stiffness: 400, damping: 30 }` (snappy but not bouncy)

3. **Stagger:** When multiple items appear (memory list, onboarding reveal), stagger by 60-80ms. This creates a "cascade" effect that feels like embers catching.

4. **Exit animations:** Always animate exits. Items should fade out and shift up (-8px) before removal. This prevents the jarring "snap" of instant removal.

5. **Reduced motion:** Respect `prefers-reduced-motion`. All ambient animations (breathing, orbiting, glow pulsing) should be disabled. Functional animations (page transitions, layout shifts) should be reduced to simple fades.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.15s !important;
  }
}
```

---

## Component Library Checklist

These components implement the above patterns and should be built in order of dependency:

| Component | Location | Notes |
|---|---|---|
| Theme CSS + variables | `globals.css` | Foundation for everything |
| Sidebar | `components/navigation/sidebar.tsx` | Desktop nav |
| BottomTabBar | `components/navigation/bottom-tab-bar.tsx` | Mobile nav |
| DashboardLayout | `app/(dashboard)/layout.tsx` | Responsive shell |
| MemoryCard | `components/memories/memory-card.tsx` | Core content unit |
| MemoryList | `components/memories/memory-list.tsx` | Animated list |
| BottomSheet | `components/ui/bottom-sheet.tsx` | Mobile interaction layer |
| ProcessingIndicator | `components/capture/processing-indicator.tsx` | AI wait state |
| WakePromptPreview | `components/wake-prompts/wake-prompt-preview.tsx` | Copy-ready display |
| WakePromptContent | `components/wake-prompts/wake-prompt-content.tsx` | Gentle syntax highlighting |
| EmptyMemories | `components/empty-states/empty-memories.tsx` | Hopeful empty state |
| EmptyProfiles | `components/empty-states/empty-profiles.tsx` | Hopeful empty state |
| EmptyWakePrompts | `components/empty-states/empty-wake-prompts.tsx` | Hopeful empty state |
| OnboardingFlow | `components/onboarding/onboarding-flow.tsx` | 6-step first run |
| StickyBottomAction | `components/ui/sticky-bottom-action.tsx` | Mobile action bar |
