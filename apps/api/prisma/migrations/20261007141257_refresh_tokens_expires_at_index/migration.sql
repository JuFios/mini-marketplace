-- Serves the worker's deletion of expired refresh tokens (`expires_at < cutoff`, in batches).
-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
