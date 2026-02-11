---
status: pending
priority: p3
issue_id: "020"
tags: [code-review, frontend, accessibility, a11y]
dependencies: []
---

# Problem Statement

**ACCESSIBILITY GAP**: No ARIA labels, keyboard navigation, or screen reader considerations in the UI spec. The memory browser, category picker, and capture interfaces have no accessibility plan. Users with disabilities cannot use core features.

**Why This Matters**: Accessibility is both a legal requirement (ADA, WCAG 2.1 AA) and a moral one. The category picker with checkboxes, the memory browser with filter tabs, the capture textarea, and the wake prompt copy button are all interactive elements that need proper ARIA roles, focus management, and keyboard support. Without this, screen reader users cannot browse memories, select categories, or generate wake prompts.

## Findings

**Source**: architecture-strategist

**Evidence**:
- Category loading UI mockup (lines 124-139) has no ARIA roles for checkbox group
- Memory browser filtering has no keyboard navigation plan
- Wake prompt "copy to clipboard" has no screen reader announcement
- Speaker confidence warning badges have no accessible text alternative
- Token budget display has no live region for dynamic updates
- No mention of focus management after async operations complete

**Impact Severity**: LOW - Does not block MVP but limits user base

## Proposed Solutions

### Solution 1: ARIA Roles and Labels for All Interactive Components (Recommended)

**Approach**: Add semantic HTML and ARIA attributes to every interactive element

**Implementation**:
```tsx
// components/category-picker.tsx
'use client';

import { useState } from 'react';

interface CategoryPickerProps {
  categories: Array<{
    name: string;
    label: string;
    tokenCount: number;
  }>;
  onSelectionChange: (selected: string[]) => void;
  tokenBudget: number;
}

export function CategoryPicker({
  categories,
  onSelectionChange,
  tokenBudget,
}: CategoryPickerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const totalTokens = categories
    .filter((c) => selected.includes(c.name))
    .reduce((sum, c) => sum + c.tokenCount, 0);

  return (
    <fieldset
      role="group"
      aria-labelledby="category-picker-label"
    >
      <legend id="category-picker-label" className="text-lg font-semibold">
        Choose which memories to load
      </legend>

      <div role="list" aria-label="Memory categories">
        {categories.map((category) => (
          <div key={category.name} role="listitem" className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`category-${category.name}`}
              checked={selected.includes(category.name)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, category.name]
                  : selected.filter((s) => s !== category.name);
                setSelected(next);
                onSelectionChange(next);
              }}
              aria-describedby={`tokens-${category.name}`}
            />
            <label htmlFor={`category-${category.name}`}>
              {category.label}
            </label>
            <span
              id={`tokens-${category.name}`}
              className="text-sm text-gray-400"
              aria-label={`${category.tokenCount} tokens`}
            >
              {category.tokenCount} tokens
            </span>
          </div>
        ))}
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        className="mt-4 text-sm"
      >
        Total: {totalTokens} / {tokenBudget} tokens.
        Remaining for conversation: {tokenBudget - totalTokens} tokens.
      </div>
    </fieldset>
  );
}
```

```tsx
// components/memory-card.tsx
interface MemoryCardProps {
  memory: Memory;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function MemoryCard({ memory, onEdit, onDelete }: MemoryCardProps) {
  return (
    <article
      aria-labelledby={`memory-title-${memory.id}`}
      className="rounded-lg border border-amber-900/20 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 id={`memory-title-${memory.id}`} className="font-medium">
          {memory.factualContent.slice(0, 80)}
        </h3>
        {memory.speakerConfidence !== null && memory.speakerConfidence < 0.8 && (
          <span
            role="status"
            aria-label="Low speaker attribution confidence. Review recommended."
            className="rounded bg-yellow-900/30 px-2 py-1 text-xs text-yellow-400"
          >
            Low confidence
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onEdit(memory.id)}
          aria-label={`Edit memory: ${memory.factualContent.slice(0, 40)}`}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(memory.id)}
          aria-label={`Delete memory: ${memory.factualContent.slice(0, 40)}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
```

**Pros**:
- Semantic HTML with proper ARIA relationships
- `aria-live` regions for dynamic token budget updates
- Screen readers can navigate and interact with all features
- Descriptive labels on action buttons

**Cons**:
- Requires careful testing with actual screen readers
- Adds verbosity to component JSX

**Effort**: Medium (1-2 days)
**Risk**: Low

### Solution 2: Keyboard Navigation for Memory Browser and Category Picker

**Approach**: Full keyboard support with roving tabindex and focus management

**Implementation**:
```tsx
// hooks/use-roving-tabindex.ts
'use client';

import { useRef, useCallback, KeyboardEvent } from 'react';

export function useRovingTabindex(itemCount: number) {
  const focusedIndex = useRef(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const setRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    []
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      let nextIndex = focusedIndex.current;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          nextIndex = (focusedIndex.current + 1) % itemCount;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          nextIndex = (focusedIndex.current - 1 + itemCount) % itemCount;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = itemCount - 1;
          break;
        default:
          return;
      }

      focusedIndex.current = nextIndex;
      itemRefs.current[nextIndex]?.focus();
    },
    [itemCount]
  );

  return { setRef, onKeyDown, focusedIndex: focusedIndex.current };
}

// components/memory-browser.tsx
'use client';

import { useRovingTabindex } from '@/hooks/use-roving-tabindex';

const CATEGORIES = ['emotional', 'work', 'hobbies', 'relationships', 'preferences'];

export function MemoryBrowser() {
  const { setRef, onKeyDown, focusedIndex } = useRovingTabindex(CATEGORIES.length);

  return (
    <div
      role="tablist"
      aria-label="Filter memories by category"
      onKeyDown={onKeyDown}
    >
      {CATEGORIES.map((category, index) => (
        <button
          key={category}
          ref={setRef(index)}
          role="tab"
          tabIndex={index === focusedIndex ? 0 : -1}
          aria-selected={index === focusedIndex}
          aria-controls={`panel-${category}`}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
```

**Pros**:
- Standard WAI-ARIA tab pattern
- Arrow key navigation between tabs
- Home/End key support
- Proper tabindex management

**Cons**:
- Requires custom hook for each navigable component
- Must test across browsers

**Effort**: Medium (1 day)
**Risk**: Low

### Solution 3: Automated a11y Testing with axe-core in CI

**Approach**: Add accessibility linting and runtime checks to the test pipeline

**Implementation**:
```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';

// tests/a11y/category-picker.test.tsx
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { CategoryPicker } from '@/components/category-picker';

expect.extend(toHaveNoViolations);

describe('CategoryPicker accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <CategoryPicker
        categories={[
          { name: 'work', label: 'Work & Projects', tokenCount: 286 },
          { name: 'emotional', label: 'Emotional', tokenCount: 342 },
        ]}
        onSelectionChange={() => {}}
        tokenBudget={8000}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

```json
// .eslintrc.json (add a11y plugin)
{
  "extends": [
    "next/core-web-vitals",
    "plugin:jsx-a11y/recommended"
  ],
  "plugins": ["jsx-a11y"]
}
```

**Pros**:
- Catches common a11y violations automatically
- ESLint plugin prevents regressions in new code
- axe-core tests validate runtime accessibility

**Cons**:
- Automated tools catch ~30-50% of a11y issues
- Cannot replace manual screen reader testing
- Requires test infrastructure (see issue 019)

**Effort**: Low (half day)
**Risk**: Low

## Recommended Action

**Choose Solution 1 + Solution 3: ARIA Labels + Automated Testing**

Add ARIA roles and labels to all components as they are built. Add `eslint-plugin-jsx-a11y` to catch violations during development. Add axe-core tests for critical interactive components. Defer full keyboard navigation (Solution 2) until after MVP launch unless time permits.

## Technical Details

**Affected Components**:
- `src/components/category-picker.tsx` (category checkboxes with token counts)
- `src/components/memory-browser.tsx` (filter tabs, memory cards)
- `src/components/capture-form.tsx` (paste textarea, screenshot upload)
- `src/components/wake-prompt.tsx` (copy button, token display)
- `src/components/memory-card.tsx` (edit/delete actions, confidence badges)

**Database Changes**: None

**New Dependencies**:
```json
{
  "devDependencies": {
    "eslint-plugin-jsx-a11y": "^6.10.0",
    "jest-axe": "^9.0.0"
  }
}
```

## Acceptance Criteria

- [ ] All interactive elements have proper ARIA labels
- [ ] Category picker uses `fieldset`/`legend` with `aria-describedby` for token counts
- [ ] Token budget display uses `aria-live="polite"` for dynamic updates
- [ ] Speaker confidence badges have accessible text alternatives
- [ ] Copy-to-clipboard button announces success to screen readers
- [ ] `eslint-plugin-jsx-a11y` added to ESLint config
- [ ] axe-core tests pass for category picker and memory browser
- [ ] Tab key navigates all interactive elements in logical order

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist noted absence of accessibility considerations
- **Severity**: Marked as P3 - important for inclusivity but not a launch blocker
- **Current state**: No ARIA labels, no keyboard navigation, no a11y testing
- **Next step**: Add ARIA attributes to components as they are built in Phase 1

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L124-L139) - Category loading UI mockup
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
- [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y)
- [axe-core](https://github.com/dequelabs/axe-core)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
