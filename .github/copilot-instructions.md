Purpose
Provide concise, project-specific guidance so an AI coding agent can be productive immediately in this codebase.

Quick overview
- This is an Express + MySQL API for a salon booking system. Entry point: `server.js`.
- Routes live in `routes/`, controllers in `controllers/`, business logic in `services/`, DB access in `repositories/`.
- Error handling uses `utils/ApiError.js` and the `middleware/errorHandler` (registered last in `server.js`).
- Auth uses JWT via `middleware/auth.js` and `process.env.JWT_SECRET`.

Key patterns & conventions (use these when writing code)
- Request flow: route -> (auth middleware) -> controller -> service -> repository -> DB (via `utils/dbHelpers.promisifyQuery`).
- Controllers always wrap logic in try/catch and call `next(error)`; throw ApiError for known failures: `throw new ApiError(400, 'msg')`.
- Services implement business rules and throw ApiError on invalid input or domain failures (see `services/bookingService.js`).
- Repositories run parameterized SQL via `promisifyQuery(sql, params)`; prefer parameterized queries over string interpolation (see `repositories/bookingRepository.js`).
- Consistent JSON response shape: { success: boolean, message: string, data?: any }.

Examples (copy these patterns)
- Add a new authenticated endpoint:
  - Add route in `routes/<X>Route.js` and require middleware: `router.post('/', authenticateToken, controller.method)`.
  - Implement controller method in `controllers/<X>Controller.js` with try/catch and `next(error)`.
  - Put business logic into `services/<X>Service.js` and DB calls into `repositories/<X>Repository.js`.

- Throwing domain errors:
  - `throw new ApiError(409, 'Time slot already booked')` (used in `services/bookingService.js`).

Environment & run notes
- DB: MySQL (see `config/db.js`). Ensure `.env` contains DB credentials and `JWT_SECRET`.
- Dependencies in `package.json`: express, mysql2, dotenv, jsonwebtoken, bcrypt.
- Start server (no start script in package.json): run `node server.js` (or add a `start` script / use nodemon for dev).

DB & schema hints
- Repositories assume tables: bookings, bookingstatus, services, user (see queries in `repositories/bookingRepository.js`).
- Column names in SQL often use UPPER_SNAKE_CASE (e.g. BOOKING_ID, STATUS_ID). Keep queries consistent with that naming.

Safety & code style guidance
- Use `promisifyQuery` (from `utils/dbHelpers`) for DB calls; avoid constructing SQL with template strings.
- Follow existing error flow: throw ApiError for expected errors; let unexpected errors bubble to `errorHandler`.
- Keep controllers thin — they should only validate input and call services.

Files to inspect for examples
- `server.js` — app wiring and middleware order
- `routes/*.js` — route naming and middleware usage (e.g., `routes/bookingRoutes.js`)
- `controllers/bookingController.js` — controller structure and response format
- `services/bookingService.js` — business rules and ApiError usage
- `repositories/bookingRepository.js` — parameterized SQL examples and `promisifyQuery` usage
- `middleware/auth.js` — JWT auth pattern and `requireRole` helper
- `utils/ApiError.js` and `utils/validation.js` — error and validation utility patterns

If you edit or add endpoints
1. Add route in `routes/` and wire into `server.js` under `/api/<resource>`.
2. Add controller method in `controllers/` following existing try/catch -> next(error) pattern.
3. Implement business rules in `services/` and throw ApiError for domain failures.
4. Put SQL in `repositories/` using `promisifyQuery(sql, params)`.

When to ask the human
- If a DB migration/schema change is needed (no migration tooling present). Provide the SQL and ask where to run it.
- If creating background jobs or complex transaction logic — note that current codebase is synchronous request/response and uses simple repository calls.

Questions / Next steps
- Should I add a `start` and `dev` script to `package.json` and a short README section for env variables and DB schema? Reply and I'll add them.

---
If anything here is unclear or you want more examples (e.g., a sample new route + controller + service + repo), tell me which resource and I'll scaffold it.
