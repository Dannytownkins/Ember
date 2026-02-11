"use client";

import { useState, useTransition } from "react";
import {
  createApiTokenAction,
  revokeApiTokenAction,
} from "@/lib/actions/api-tokens";

interface TokenListItem {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function ApiTokenManager({
  initialTokens,
}: {
  initialTokens: TokenListItem[];
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!newTokenName.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await createApiTokenAction({
        name: newTokenName.trim(),
      });

      if (result.status === "error") {
        setError(result.error);
        return;
      }

      setCreatedToken(result.data.token);
      setTokens((prev) => [
        {
          id: result.data.id,
          name: result.data.name,
          scopes: ["read", "write", "wake"],
          lastUsedAt: null,
          createdAt: new Date(),
        },
        ...prev,
      ]);
      setNewTokenName("");
    });
  }

  function handleRevoke(tokenId: string) {
    startTransition(async () => {
      const result = await revokeApiTokenAction(tokenId);
      if (result.status === "success") {
        setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      }
    });
  }

  async function handleCopy() {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Create new token */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
          placeholder="Token name (e.g., My CLI Token)"
          className="flex-1 rounded-lg border border-ember-border bg-ember-surface-raised px-3 py-2 text-sm text-ember-text placeholder:text-ember-text-muted focus:border-ember-amber/40 focus:outline-none"
        />
        <button
          onClick={handleCreate}
          disabled={!newTokenName.trim() || isPending}
          className="rounded-lg bg-ember-amber-600 px-4 py-2 text-sm font-semibold text-ember-bg transition-colors hover:bg-ember-amber disabled:opacity-50"
        >
          Create
        </button>
      </div>

      {error && (
        <p className="text-sm text-ember-error">{error}</p>
      )}

      {/* Show newly created token (once only) */}
      {createdToken && (
        <div className="rounded-xl border border-ember-amber/20 bg-ember-amber/5 p-4">
          <p className="text-xs font-medium text-ember-amber">
            Copy this token now — it won&apos;t be shown again:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-ember-surface px-3 py-2 font-mono text-xs text-ember-text">
              {createdToken}
            </code>
            <button
              onClick={handleCopy}
              className="rounded-lg border border-ember-border px-3 py-2 text-xs text-ember-text-secondary transition-colors hover:text-ember-text"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setCreatedToken(null)}
            className="mt-2 text-xs text-ember-text-muted hover:text-ember-text"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Token list */}
      {tokens.length > 0 ? (
        <div className="space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-xl border border-ember-border-subtle bg-ember-surface px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-ember-text">
                  {token.name}
                </p>
                <p className="mt-0.5 text-xs text-ember-text-muted">
                  Created {new Date(token.createdAt).toLocaleDateString()}
                  {token.lastUsedAt &&
                    ` · Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(token.id)}
                disabled={isPending}
                className="text-xs text-ember-text-muted transition-colors hover:text-ember-error disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ember-text-muted">
          No API tokens yet. Create one to use with agents or CLI tools.
        </p>
      )}
    </div>
  );
}
