# Vanguard Frontend

Frontend web application for the Vanguard Settlement Engine, built with React 18, Vite, TypeScript, Tailwind CSS, and React Router v6.

## Running Locally

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Ensure `VITE_API_BASE_URL` points to your backend instance (default: `http://localhost:3000`).

3. Start development server:
   ```bash
   npm run dev
   ```
   Opens at `http://localhost:5173`.

4. Run tests and build:
   ```bash
   npm test
   npm run build
   ```

## Security & Session Architecture

- **Session Storage**: Authentication state (JWT token, user role, organisation ID, and legal name) is stored under fixed `vse_*` keys in `localStorage`.
- **Authorization**: All authenticated requests attach `Authorization: Bearer <token>`. An HTTP 401 response automatically clears local session storage and redirects to `/login`.
- **Client-Side Logout**: Logout clears the browser session only. The token remains valid until its expiry (8h). This is a documented demo limitation.
