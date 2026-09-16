---
name: Staff permissions
description: The shop admin model uses Clerk public metadata for a single owner and scoped staff permissions.
---

The first signed-in account can claim the one-time owner role; the owner then grants staff access and scoped permissions for orders, inventory, analytics, or team management.

**Why:** Clerk already owns account passwords and sessions, while public metadata keeps authorization server-enforced without adding a second password store.

**How to apply:** Keep permission checks in the API middleware as well as the UI, preserve existing metadata when updating it, and treat owner metadata as immutable from the team screen.