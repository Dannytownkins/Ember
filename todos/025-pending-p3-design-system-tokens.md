---
status: pending
priority: p3
issue_id: "025"
tags: [code-review, frontend, design-system, consistency]
dependencies: []
---

# Problem Statement

**DESIGN CONSISTENCY GAP**: The "Memory Hearth" aesthetic was designed during review but needs formal design tokens. No CSS variables file, no color palette definition, no typography scale, no spacing system. Each component will reinvent the wheel with ad-hoc Tailwind classes.

**Why This Matters**: Without a shared token system, the amber-and-warmth aesthetic described in the plan will fragment across components. One developer picks `bg-amber-600` while another uses `bg-amber-500`. One uses `rounded-lg` while another uses `rounded-xl`. The dark-mode-first approach (line 221) requires consistent color mapping between themes. Design debt compounds faster than technical debt because users notice it immediately.

## Findings

**Source**: architecture-strategist

**Evidence**:
- Plan mentions "Dark mode first, amber accent" (line 221) but no color palette defined
- Tailwind CSS v4 specified (line 221) but no custom theme extension
- No `@custom-variant` definitions for dark mode mentioned
- Category loading UI mockup (lines 124-139) uses ASCII art, no design spec
- Memory browser, capture interface, and wake prompt UI have no shared visual language
- No typography scale (heading sizes, body text, captions)
- No spacing system (component gaps, padding, margins)

**Impact Severity**: LOW - Aesthetic inconsistency, not a functional issue

## Proposed Solutions

### Solution 1: CSS Custom Properties File with Full Token System (Recommended)

**Approach**: Define all design tokens as CSS custom properties, consumed by Tailwind and components

**Implementation**:
```css
/* src/styles/tokens.css */

/* ===== Color Tokens ===== */
:root {
  /* Brand - The Ember Hearth palette */
  --color-ember-50: #fffbeb;
  --color-ember-100: #fef3c7;
  --color-ember-200: #fde68a;
  --color-ember-300: #fcd34d;
  --color-ember-400: #fbbf24;
  --color-ember-500: #f59e0b;  /* Primary amber */
  --color-ember-600: #d97706;
  --color-ember-700: #b45309;
  --color-ember-800: #92400e;
  --color-ember-900: #78350f;
  --color-ember-950: #451a03;

  /* Surfaces (dark mode first) */
  --surface-primary: #0c0a09;    /* stone-950 */
  --surface-secondary: #1c1917;  /* stone-900 */
  --surface-elevated: #292524;   /* stone-800 */
  --surface-overlay: #44403c;    /* stone-700 */

  /* Text */
  --text-primary: #fafaf9;       /* stone-50 */
  --text-secondary: #a8a29e;     /* stone-400 */
  --text-muted: #78716c;         /* stone-500 */
  --text-accent: #fbbf24;        /* amber-400 */

  /* Borders */
  --border-subtle: #292524;      /* stone-800 */
  --border-default: #44403c;     /* stone-700 */
  --border-accent: #b45309;      /* amber-700 */

  /* Status */
  --status-success: #22c55e;     /* green-500 */
  --status-warning: #eab308;     /* yellow-500 */
  --status-error: #ef4444;       /* red-500 */
  --status-info: #3b82f6;        /* blue-500 */

  /* Category colors */
  --category-emotional: #f472b6;    /* pink-400 */
  --category-work: #60a5fa;         /* blue-400 */
  --category-hobbies: #34d399;      /* emerald-400 */
  --category-relationships: #c084fc; /* purple-400 */
  --category-preferences: #fbbf24;   /* amber-400 */

  /* ===== Typography Tokens ===== */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --text-xs: 0.75rem;     /* 12px */
  --text-sm: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  --text-3xl: 1.875rem;   /* 30px */

  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  /* ===== Spacing Tokens ===== */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */

  /* ===== Border Radius Tokens ===== */
  --radius-sm: 0.25rem;   /* 4px */
  --radius-md: 0.5rem;    /* 8px */
  --radius-lg: 0.75rem;   /* 12px */
  --radius-xl: 1rem;      /* 16px */
  --radius-full: 9999px;

  /* ===== Shadow Tokens ===== */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.4);
  --shadow-glow: 0 0 15px rgb(251 191 36 / 0.15);  /* Ember glow */

  /* ===== Animation Tokens ===== */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
  --easing-default: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Light mode overrides (secondary theme) */
@media (prefers-color-scheme: light) {
  :root.light {
    --surface-primary: #fafaf9;
    --surface-secondary: #f5f5f4;
    --surface-elevated: #ffffff;
    --surface-overlay: #e7e5e4;

    --text-primary: #1c1917;
    --text-secondary: #57534e;
    --text-muted: #a8a29e;
    --text-accent: #d97706;

    --border-subtle: #e7e5e4;
    --border-default: #d6d3d1;
    --border-accent: #f59e0b;

    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    --shadow-glow: 0 0 15px rgb(245 158 11 / 0.1);
  }
}
```

```tsx
// components/ui/memory-card.tsx
// Example component using design tokens

export function MemoryCard({ memory }: { memory: Memory }) {
  return (
    <article
      className="rounded-[var(--radius-lg)] border p-[var(--space-4)]"
      style={{
        backgroundColor: 'var(--surface-elevated)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-[var(--space-2)]">
        <span
          className="rounded-[var(--radius-full)] px-[var(--space-2)] py-[var(--space-1)] text-[length:var(--text-xs)]"
          style={{
            backgroundColor: `var(--category-${memory.category})`,
            color: 'var(--surface-primary)',
          }}
        >
          {memory.category}
        </span>
        <span
          className="text-[length:var(--text-sm)]"
          style={{ color: 'var(--text-muted)' }}
        >
          Importance: {memory.importance}/5
        </span>
      </div>
      <p
        className="mt-[var(--space-3)] text-[length:var(--text-base)]"
        style={{ color: 'var(--text-primary)', lineHeight: 'var(--leading-normal)' }}
      >
        {memory.factualContent}
      </p>
    </article>
  );
}
```

**Pros**:
- Single source of truth for all design values
- CSS custom properties work everywhere (Tailwind, CSS-in-JS, inline styles)
- Dark/light mode switching is a theme swap, not per-component logic
- Category colors are consistent across memory browser, charts, badges
- Easy to adjust palette by changing one file

**Cons**:
- CSS custom properties have slightly worse DX than Tailwind utility classes
- Requires discipline to use tokens instead of raw values
- Some duplication between tokens and Tailwind theme

**Effort**: Low (half day)
**Risk**: Low

### Solution 2: Tailwind Theme Extension with Custom Design Tokens

**Approach**: Extend Tailwind's default theme with Ember-specific tokens

**Implementation**:
```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ember: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        surface: {
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          elevated: 'var(--surface-elevated)',
          overlay: 'var(--surface-overlay)',
        },
        category: {
          emotional: '#f472b6',
          work: '#60a5fa',
          hobbies: '#34d399',
          relationships: '#c084fc',
          preferences: '#fbbf24',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        ember: '0.75rem',
      },
      boxShadow: {
        glow: '0 0 15px rgb(251 191 36 / 0.15)',
      },
    },
  },
};

export default config;
```

```tsx
// Usage with Tailwind classes
export function MemoryCard({ memory }: { memory: Memory }) {
  return (
    <article className="rounded-ember border border-stone-800 bg-surface-elevated p-4">
      <span className={`rounded-full px-2 py-1 text-xs bg-category-${memory.category}`}>
        {memory.category}
      </span>
      <p className="mt-3 text-base text-stone-50 leading-normal">
        {memory.factualContent}
      </p>
    </article>
  );
}
```

**Pros**:
- Native Tailwind DX (autocomplete, IntelliSense)
- No context switching between CSS variables and utility classes
- Tailwind purges unused styles automatically
- Team already using Tailwind (no new patterns)

**Cons**:
- Tailwind config can get bloated
- Dynamic category colors require `safelist` or dynamic classes
- Less portable than CSS custom properties

**Effort**: Low (half day)
**Risk**: Low

### Solution 3: Storybook with Component Library Documentation

**Approach**: Build a Storybook instance documenting all UI components with their design tokens

**Implementation**:
```tsx
// stories/MemoryCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MemoryCard } from '@/components/ui/memory-card';

const meta: Meta<typeof MemoryCard> = {
  title: 'Components/MemoryCard',
  component: MemoryCard,
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0c0a09' },
        { name: 'light', value: '#fafaf9' },
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof MemoryCard>;

export const Emotional: Story = {
  args: {
    memory: {
      id: '1',
      category: 'emotional',
      factualContent: 'Daughter born April 12th, named Maya.',
      emotionalSignificance: 'Difficult night. Joy and trauma intertwined.',
      importance: 5,
      verbatimTokens: 42,
      speakerConfidence: 0.95,
    },
  },
};

export const LowConfidence: Story = {
  args: {
    memory: {
      id: '2',
      category: 'work',
      factualContent: 'Building Ember with Next.js 16.',
      importance: 3,
      verbatimTokens: 18,
      speakerConfidence: 0.6,
    },
  },
};
```

**Pros**:
- Visual documentation of all components
- Interactive playground for design review
- Tests visual regression automatically
- Onboards new developers quickly

**Cons**:
- Significant setup overhead for Storybook
- Overkill for a solo developer or small team at MVP stage
- Must be maintained alongside actual components

**Effort**: Medium (1-2 days)
**Risk**: Low but time-intensive

## Recommended Action

**Choose Solution 1 + Solution 2: CSS Tokens + Tailwind Extension**

Define all design tokens as CSS custom properties in `src/styles/tokens.css` for portability and single-source-of-truth. Then extend the Tailwind config to reference these tokens for utility class DX. This gives both a formal design system and the ergonomic Tailwind developer experience. Defer Storybook until the team grows beyond 1-2 developers.

## Technical Details

**Affected Components**:
- `src/styles/tokens.css` (new file)
- `tailwind.config.ts` (extend theme with Ember tokens)
- `src/app/globals.css` (import tokens.css)
- All UI components (adopt token-based values)

**Database Changes**: None

## Acceptance Criteria

- [ ] CSS tokens file defines color palette, typography scale, spacing, radius, and shadows
- [ ] Tailwind config extended with Ember brand colors and surface colors
- [ ] Dark mode is the default theme with consistent token values
- [ ] Light mode overrides exist as secondary theme
- [ ] Each memory category has a unique, accessible color token
- [ ] All new components use tokens instead of raw color/spacing values
- [ ] Design tokens documented in code comments

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist noted absence of formal design system
- **Severity**: Marked as P3 - consistency improvement, not a functional blocker
- **Current state**: "Dark mode first, amber accent" aesthetic with no formal token definitions
- **Next step**: Create tokens file before building first UI components in Phase 1

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L221) - Tailwind CSS v4, dark mode first
- [Tailwind CSS v4 Theming](https://tailwindcss.com/docs/theme)
- [CSS Custom Properties Best Practices](https://web.dev/at-property/)
- [Design Tokens W3C Spec](https://design-tokens.github.io/community-group/format/)
