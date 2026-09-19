# WeChat Miniapp PC Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one-time PC QR login through the existing WeChat mini-program, automatically signing in users whose mini-program identity is already bound to a Stock Review account.

**Architecture:** Reuse the existing mini-program QR generation and WeChat code exchange service. Add a short-lived `WechatLoginSession` with hashed tokens, create/status/confirm backend endpoints, a mini-program login scene, and a frontend QR-login panel that polls until the backend returns the normal JWT.

**Tech Stack:** Node.js, Express, Mongoose, Jest/Supertest, Vue/uni-app, WeChat Mini Program APIs.

**Spec:** Approved design in conversation on September 19, 2026.

## Global Constraints

- QR login is only allowed for an already-bound WeChat identity; it must not auto-create an account.
- Login tokens are random, hashed at rest, single-use, and expire after 5 minutes.
- The backend must verify the mini-program `wx.login` code with WeChat; never trust a client-supplied user id.
- Preserve the existing binding flow and normal JWT login contract.

---

### Task 1: Backend login session and API

**Files:**
- Create: `apps/backend/src/models/WechatLoginSession.js`
- Modify: `apps/backend/src/controllers/wechatController.js`
- Modify: `apps/backend/src/routes/authRoutes.js` or the existing user/wechat route registration
- Test: `apps/backend/tests/wechatMiniappLogin.test.js`

- [ ] Add failing tests for session creation, pending status, successful confirmation for a bound user, rejection of an unbound user, expiry, and single-use behavior.
- [ ] Implement session model and endpoints using existing WeChat miniapp service and JWT helpers.
- [ ] Run focused backend tests.

### Task 2: Mini-program login scene

**Files:**
- Modify: `apps/miniapp/pages/wechat-bind/index.js`
- Modify: `apps/miniapp/pages/wechat-bind/index.wxml`
- Modify: `apps/miniapp/pages/wechat-bind/index.wxss` if needed

- [ ] Add scene parsing for `login_<token>` versus binding tokens.
- [ ] For login scenes call `wx.login`, submit the code/token, and show success/error without requiring profile authorization.
- [ ] Preserve existing bind and current-binding behavior.

### Task 3: PC login UI and API client

**Files:**
- Modify: `apps/frontend/src/pages/login/login.vue`
- Modify: `apps/frontend/src/api/index.js` or the existing request helper
- Test: frontend tests if the repo has a suitable login test location

- [ ] Add a QR login mode and render the backend-provided mini-program QR image.
- [ ] Poll status with cleanup on success, expiry, unmount, and mode switch.
- [ ] Store the returned normal JWT using the existing user store/session mechanism and redirect to the app.
- [ ] Keep password login unchanged.

### Task 4: Configuration and verification

**Files:**
- Modify: `apps/backend/.env.production.example` and relevant docs if configuration is missing.

- [ ] Document required mini-program app credentials and QR generation settings.
- [ ] Run backend tests, frontend tests, lint, and production/build checks available in the repo.
- [ ] Review changed files for token leakage and cleanup issues.
