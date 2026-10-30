# Bluff Battle

A real-time multiplayer bluffing party game for 2–8 players. The frontend is in `src/`; the serverless backend is `netlify/functions/game.ts` and stores room state in Netlify Blobs.

## Important: deploy the function, not just the static files

A static drag-and-drop publish can leave the site visible while the API function is absent. Deploy this project as a Netlify build so Netlify bundles and publishes `netlify/functions/game.ts` together with the frontend.

### Windows quick deployment

1. Install Node.js LTS from https://nodejs.org/ if it is not already installed.
2. Extract this ZIP.
3. Double-click `deploy-netlify.bat`.
4. Sign in when the browser opens.
5. When asked to link a site, select your existing Bluff Battle Netlify site (the one whose URL you want to keep).
6. Let the script finish. It runs the build and deploys the frontend and function.

The script does not ask for a Netlify API key. It uses the normal Netlify login flow. It may ask you to choose an existing site once.

## Verify backend after deployment

Open this URL, replacing `YOUR-SITE` with the site's subdomain:

`https://YOUR-SITE.netlify.app/.netlify/functions/game?health=1`

Expected response:

`{"ok":true,"function":"game","blobs":"available"}`

If it returns 404, the function was not deployed. If it returns 500, open Netlify > Logs > Functions > `game` and inspect the runtime error. Do not submit the game until this health check passes and two separate browsers can create/join a room.

## Project configuration

- Build command: `npm run build`
- Publish directory: `src`
- Functions directory: `netlify/functions`
- Function bundler: esbuild
- Function endpoint: `/.netlify/functions/game`
- Store: Netlify Blobs, site-wide, strong consistency

`npm run build` performs a project-structure check. Netlify performs the actual function bundling during deployment.
