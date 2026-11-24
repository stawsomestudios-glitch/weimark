import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site at https://<user>.github.io/<repo>/.
// In GitHub Actions, GITHUB_REPOSITORY is "<user>/<repo>"; locally it is unset.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repo && !repo.endsWith('.github.io') ? `/${repo}/` : '/'

// The pictures, video and final map are in public/pictures/ (copied from the Desktop folder by
// scripts/copy-pictures.mjs), so the published site has them too.
export default defineConfig({
  plugins: [react()],
  base,
})
