---
name: Clerk metadata update API
description: Replit-managed Clerk user metadata updates use the dedicated metadata endpoint.
---

Use `PATCH /v1/users/{user_id}/metadata` for public metadata changes. The older `PATCH /v1/users/{user_id}` payload with `public_metadata` is deprecated and returns a validation error.

**Why:** Clerk's current API rejects the legacy user update parameter, so staff-access provisioning must use the metadata-specific endpoint.

**How to apply:** Preserve existing public metadata and merge the requested fields when granting or changing application access.