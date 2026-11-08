# Course Portal User Guide (HOW_TO_USE.md)

Welcome to the **Race | AI 13 | Transcripts & Summary** portal content management guide. This guide is written for instructors, teaching assistants, and curriculum authors who want to publish class documents (`.docx`, `.md`, `.pdf`, `.ipynb`, `.html`, whiteboard photos, and quizzes) quickly, reliably, and with **zero credit card required**.

---

## Table of Contents
1. [Overview & Architecture](#1-overview--architecture)
2. [Content Model](#2-content-model)
3. [Prerequisites & First-Time Machine Setup](#3-prerequisites--first-time-machine-setup)
4. [First-Time Cloudflare Workers Static Assets Deployment (No Card)](#4-first-time-cloudflare-workers-static-assets-deployment-no-card)
5. [Preparing Documents Before Upload](#5-preparing-documents-before-upload)
6. [First Walkthrough: Ingest Your First Module & Publish](#6-first-walkthrough-ingest-your-first-module--publish)
7. [The Questions File & AI Prompt Generator](#7-the-questions-file--ai-prompt-generator)
8. [Daily After-Class Workflow Checklist](#8-daily-after-class-workflow-checklist)
9. [Fixing Mistakes: Overwrite, Remove, Undo, Verify & Rebuild](#9-fixing-mistakes-overwrite-remove-undo-verify--rebuild)
10. [Practice Safely: Dry-Run and Local Sandbox](#10-practice-safely-dry-run-and-local-sandbox)
11. [Student Reader's Portal Guide](#11-student-readers-portal-guide)
12. [Storage, Limits & Housekeeping](#12-storage-limits--housekeeping)
13. [Troubleshooting Guide](#13-troubleshooting-guide)
14. [Optional: Upgrading to Cloudflare R2 Later](#14-optional-upgrading-to-cloudflare-r2-later)
15. [One-Page Quick Reference Card](#15-one-page-quick-reference-card)

---

## 1. Overview & Architecture

The portal architecture is decoupled into three simple components:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│          Your Computer          │       │          GitHub / Git           │       │    Cloudflare Workers Assets    │
│       (python ingest.py)        │ ────► │        (public/content/)        │ ────► │      (Fast Web Frontend)        │
│ Ingests 1 item at a time        │       │ Stores documents & manifests    │       │ Students read notes, run quiz,  │
│ Compresses images, updates JSON │       │ No credit card or bucket needed │       │ search transcripts instantly    │
└─────────────────────────────────┘       └─────────────────────────────────┘       └─────────────────────────────────┘
```

1. **The Ingest Tool on your computer** (`python ingest.py`): An interactive, multi-agent Python CLI that guides you to add files **one item at a time**. It validates formats, compresses photos to WebP with thumbnails, updates manifests, and keeps search indices in sync.
2. **Built-in Content Directory** (`public/content/`): Content lives directly inside your repository under `public/content/`. Vite serves it locally during development at `/content`, and copies it into `dist/content` on production builds.
3. **Cloudflare Workers Static Assets Website**: When you run `python ingest.py publish`, the tool commits only `public/content/` to Git and pushes to GitHub. Cloudflare automatically detects the push, runs `npm run build` and `npx wrangler deploy`, and updates your live site in ~1 minute.

---

## 2. Content Model

All curriculum content is organized hierarchically:

```
Course Portal
  ├── Module (e.g., MLOps Associate - AI-300)
  │     ├── Day 1
  │     │     ├── Summary (DOCX, Markdown, PDF, or HTML)
  │     │     ├── Transcripts (Ordered lecture transcripts: Part 1, Part 2...)
  │     │     ├── Important Links (Official docs, GitHub repos, cheat sheets)
  │     │     ├── Class Board Work (Whiteboard photos & classroom diagrams)
  │     │     └── Questions & Answers (Quiz questions with simple explanations)
  │     ├── Day 2 ...
  │     ├── Labs (Hands-on, assessments, challenge labs)
  │     │     ├── Lab Guide URL / Official Source
  │     │     ├── Ingested Lab Notes (DOCX, Markdown, HTML)
  │     │     └── Architectural Doodle / Diagram
  │     └── Visual Notes (Aggregated whiteboard gallery + lab doodles)
  └── Another Module...
```

- **Module**: A major course subject with title, course code (e.g. `AI-300`), subtitle, and description.
- **Day**: A single class session. Days can be non-contiguous (e.g. Day 1, Day 2, Day 5).
- **Summary**: The primary reading material for that day. One summary per day.
- **Transcripts**: Multiple ordered lecture transcripts per day (e.g. "Morning Session", "Afternoon Session").
- **Important Links**: External resource URLs with labels and optional descriptions.
- **Class Board Work**: Classroom whiteboard photos, automatically optimized to WebP with thumbnails and lightbox viewing.
- **Questions**: Formatted Q&A cards with expandable "Explain simply" analogies and filterable tags.
- **Labs**: Categorized lab exercises with notes, links, and doodles.
- **Visual Notes**: An automated single-page visual gallery combining all board photos and lab diagrams across the module.

---

## 3. Prerequisites & First-Time Machine Setup

### Step 1: Install Python & Node.js
- **Python**: Version 3.10 or higher. Check in your terminal:
  ```bash
  python --version
  ```
- **Node.js**: Version 18 or 22 (for frontend build and checking schemas):
  ```bash
  node --version
  ```

### Step 2: Install Python Dependencies
In the root directory of the repository (`d:\ai13_module`):
```bash
pip install -r requirements.txt
```

### Step 3: Verify Git & Remote Configuration
Verify that Git is installed and pointed to your GitHub repository:
```bash
git remote -v
```
*Expected output:*
```
origin  https://github.com/Drylegend/ai13_transcripts.git (fetch)
origin  https://github.com/Drylegend/ai13_transcripts.git (push)
```

### Step 4: Configure GitHub Authentication
To allow `python ingest.py publish` to push commits to GitHub, your computer must be authenticated:

- **Option A (GitHub CLI — Recommended)**:
  1. Install `gh` if not already installed (`winget install GitHub.cli` on Windows or `brew install gh` on macOS).
  2. Run:
     ```bash
     gh auth login
     ```
  3. Select **GitHub.com** $\rightarrow$ **HTTPS** $\rightarrow$ **Yes** (authenticate Git with your GitHub credentials) $\rightarrow$ **Login with a web browser**.
  4. Enter the one-time code shown in your terminal into the browser and approve access.

- **Option B (Git Credential Manager / Personal Access Token)**:
  1. Go to GitHub $\rightarrow$ **Settings** $\rightarrow$ **Developer settings** $\rightarrow$ **Personal access tokens (Tokens classic)**.
  2. Generate a token with the `repo` scope.
  3. When you run `git push` for the first time, Git will prompt for your username and password. Enter your GitHub username and paste the personal access token as the password. Windows Git Credential Manager will remember it.

### Step 5: Initialize Content Repository Bootstrap Files
Run:
```bash
python ingest.py init
```
*Actual output:*
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Initialize Content Repository Bootstrap Files (site)                        │
└─────────────────────────────────────────────────────────────────────────────┘
[main 7609f1d] chore: initialize content repository
 2 files changed, 6 insertions(+)
 create mode 100644 public/content/index.json
 create mode 100644 public/content/search-index.json
Committed bootstrap files to git repository.
Successfully initialized repository bootstrap files: index.json and search-index.json
```
> [!NOTE]
> `python ingest.py init` creates empty starter files `public/content/index.json` and `public/content/search-index.json` and commits them to Git. They go live on your site after you run `python ingest.py publish` or push to GitHub.

---

## 4. First-Time Cloudflare Workers Static Assets Deployment (No Card)

Deploying to Cloudflare Workers Static Assets is 100% free and does **not** ask for a payment card.

### Step 1: Connect GitHub to Cloudflare Workers
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation menu, click **Workers & Pages**.
3. Click the **Create** button (or **Create application**), and choose **Import from Git** (or select your connected repository `Drylegend/ai13_transcripts`).

### Step 2: Configure Build and Deploy Settings
Configure the project with these exact settings:

| Field | Setting | Explanation |
|---|---|---|
| **Project name** | `ai13-transcripts` (or your choice) | Gives you `https://ai13-transcripts.<subdomain>.workers.dev` |
| **Production branch** | `main` | Deploys whenever `main` updates |
| **Build command** | `npm run build` | Builds the Vite app into static assets in `./dist` |
| **Deploy command** | `npx wrangler deploy` | Deploys static assets via Wrangler |
| **Root directory** | `/` (leave default) | Builds from repository root |
| **Environment variables** | *None* | Zero environment variables are required! |

### Step 3: Configuration via `wrangler.jsonc`
The repository includes a committed [wrangler.jsonc](file:///d:/ai13_module/wrangler.jsonc) file in the root directory:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ai13-transcripts",
  "compatibility_date": "2026-11-04",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```
- `assets.directory: "./dist"` instructs Cloudflare to serve the compiled frontend.
- `assets.not_found_handling: "single-page-application"` enables client-side SPA routing automatically so direct links (e.g. `/m/module-slug/day/1`) load without 404s.

> [!CAUTION]
> **Do NOT create `public/_redirects`!**
> There must be **NO `public/_redirects` file** in the repository. In Cloudflare Workers Static Assets, a `_redirects` file conflicts with the `not_found_handling: "single-page-application"` setting and causes an **infinite loop deployment error**. SPA routing is already fully handled by `wrangler.jsonc`.

### Step 4: Node.js 22 Verification
Cloudflare Workers builds respect the [`.node-version`](file:///d:/ai13_module/.node-version) file present in the repository root.
The repository already includes `.node-version` containing `22`:
```bash
cat .node-version
# Output: 22
```
This guarantees Cloudflare's build container uses modern Node.js 22 LTS with full support for modern packages.

### Step 5: Click Save and Deploy
Cloudflare will build and deploy your project in ~45 seconds. When finished, your live site address will end in `.workers.dev`:
```
https://ai13-transcripts.<your-subdomain>.workers.dev
```

### Step 6: Smoke Test
1. Open your live `https://<project>.<subdomain>.workers.dev` URL in your browser.
2. Verify you see the portal home page in its clean slate state (no error banners, no sample data).
3. Test a deep link refresh: Navigate to any path (e.g. `/m/mlops-associate/day/1`) and press **F5** (Refresh). Because `not_found_handling` is set to `single-page-application`, the page reloads cleanly without a 404 error.

---

## 5. Preparing Documents Before Upload

Follow these guidelines for clean, professional uploads:

1. **Word Documents (`.docx`, not `.doc`)**:
   - The in-browser viewer renders modern OpenXML `.docx` files natively.
   - If you have an older `.doc` file, open it in Microsoft Word or LibreOffice and click **Save As $\rightarrow$ Word Document (.docx)**. The CLI automatically rejects `.doc` files to prevent broken viewers.
2. **One File Per Upload**:
   - The CLI strictly processes **one item at a time**.
   - Do **not** drag multiple files or zip archives into the picker. The tool validates individual file size, content hash, and placement.
3. **File Size Guidance**:
   - Standard documents (`.docx`, `.md`, `.pdf`, `.ipynb`) are typically 50 KB – 5 MB.
   - Files $>10\text{ MiB}$ trigger a warning.
   - Files $>25\text{ MiB}$ are **rejected** because Cloudflare has a strict 25 MiB single-file limit for static assets.
4. **File Naming Suggestions**:
   - Use clear, kebab-case or readable names: `day01-intro-mlops.docx`, `whiteboard-pipeline-arch.png`.
   - The CLI sanitizes filenames and generates clean URL keys automatically.
5. **Privacy and Confidentiality**:
   - Your site is public to anyone with the link.
   - **Do not** upload internal passwords, private corporate API keys, or confidential student records.

---

## 6. First Walkthrough: Ingest Your First Module & Publish

Here is an exact walkthrough of ingesting Day 1 of a new module from start to finish.

### Step 1: Start the Ingest Tool
Run:
```bash
python ingest.py
```
*Actual Banner Output:*
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AI-13 Course Notes Ingest Tool                                              │
│ One-Item-at-a-Time Content Publisher | Target: site | 0 pending publish     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Step 2: Create a Module
From the main menu:
```
? What would you like to ingest or create?
  create-module
```
Prompts and example inputs:
```
? Module Title: Machine Learning Operations Associate
? Module Slug (kebab-case): mlops-associate
? Subtitle: Azure MLOps & Production Pipelines
? Description: Hands-on guide to automated model training, tracking, and deployment.
? Course Code (e.g. AI-300): AI-300
```
*Output:*
```
Plan:
  • Create manifest: modules/mlops-associate/manifest.json
  • Create visuals:  modules/mlops-associate/visuals.json
  • Update index:    index.json
Successfully created module 'Machine Learning Operations Associate' (mlops-associate)!
```

---

### Step 3: Create Day 1
Select:
```
? What would you like to ingest or create?
  create-day
```
Prompts and example inputs:
```
? Select module: Machine Learning Operations Associate (mlops-associate)
? Day Number: 1
? Day Title: Day 1: Introduction to MLOps
? Subtitle: Foundations & Azure Machine Learning Architecture
? Description: Overview of the MLOps lifecycle, workspaces, and compute targets.
? In a nutshell / class recap: We explored why MLOps is required for repeatable AI delivery and set up our Azure ML workspace.
```
*Output:*
```
Plan:
  • Initialize: modules/mlops-associate/days/day-01/day.json
  • Update manifest: modules/mlops-associate/manifest.json
Successfully created/updated Day 1 in 'mlops-associate'!
```

---

### Step 4: Add the Day 1 Summary Document
Select:
```
? What would you like to ingest or create?
  add/replace summary
```
Prompts:
```
? Select module: Machine Learning Operations Associate (mlops-associate)
? Select course day: Day 1: Day 1: Introduction to MLOps
```
The file dialog opens (or you type the path):
```
Select Day Summary (.docx, .md, .html, .pdf): C:\Users\Utsav\Documents\day1_summary.docx
```
*Output:*
```
Plan:
  UPLOAD: modules/mlops-associate/days/day-01/summary.docx (148,220 bytes, hash: a8f419b2c1)
? Upload summary? Yes
Summary successfully uploaded to Day 1!
```

---

### Step 5: Add Transcripts (Two Parts)
Select:
```
? What would you like to ingest or create?
  add transcript
```
Prompts:
```
? Select module: Machine Learning Operations Associate (mlops-associate)
? Select course day: Day 1: Day 1: Introduction to MLOps
Select Transcript (.docx, .md, .txt): C:\Users\Utsav\Documents\day1_part1.docx
? Transcript Title: Morning Lecture - MLOps Principles
? Order in Day: 1
```
Repeat for Part 2:
```
? What would you like to ingest or create?
  add transcript
Select Transcript (.docx, .md, .txt): C:\Users\Utsav\Documents\day1_part2.docx
? Transcript Title: Afternoon Walkthrough - Azure ML Setup
? Order in Day: 2
```

---

### Step 6: Add an External Link
Select:
```
? What would you like to ingest or create?
  add link
```
Prompts:
```
? Select module: Machine Learning Operations Associate (mlops-associate)
? Select course day: Day 1: Day 1: Introduction to MLOps
? Link Label: Azure Machine Learning Documentation
? Target URL (https://...): https://learn.microsoft.com/azure/machine-learning
? Description (optional): Official Microsoft reference architecture guide
```
*Output:*
```
Link 'Azure Machine Learning Documentation' successfully added to Day 1!
```

---

### Step 7: Add Questions & Answers
Select:
```
? What would you like to ingest or create?
  add questions-set
```
Prompts:
```
? Select module: Machine Learning Operations Associate (mlops-associate)
? Select course day: Day 1: Day 1: Introduction to MLOps
Select Questions File (.md): C:\Users\Utsav\Documents\day1_questions.md
```
*Output:*
```
Successfully merged 3 questions into Day 1!
```

---

### Step 8: Publish to Cloudflare Workers
When prompted after your ingest:
```
? What next?
  > Publish now (git push to Cloudflare Workers)
```
*Actual Terminal Output:*
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Publish Content to Cloudflare Workers Static Assets                         │
└─────────────────────────────────────────────────────────────────────────────┘

Pending content changes: 8 file(s) (8 added, 0 modified, 0 deleted)
  • ?? public/content/modules/mlops-associate/days/day-01/day.json
  • ?? public/content/modules/mlops-associate/days/day-01/summary.docx
  • ?? public/content/modules/mlops-associate/days/day-01/transcripts/01-morning-lecture.docx
  • ?? public/content/modules/mlops-associate/days/day-01/transcripts/02-afternoon-walkthrough.docx
  • ?? public/content/modules/mlops-associate/manifest.json
  • ?? public/content/modules/mlops-associate/visuals.json
  • ?? public/content/index.json
  • ?? public/content/search-index.json

Commit message: content: create module 'mlops-associate', create Day 1, and 4 more (6 items)
? Commit and push to origin/main? Yes

Committed content changes to local git branch.
Pushed to GitHub. Cloudflare Workers will build and deploy in ~1 minute.
Remember: free tier includes 3,000 build minutes/month (~1-2 min per publish) and unlimited static requests. Batch your uploads when possible.
```

Open your live `.workers.dev` URL in ~60 seconds to see Day 1 live!

---

## 7. The Questions File & AI Prompt Generator

Each day includes a self-study quiz section. Questions are authored in clean, simple Markdown.

### Exact Questions File Format
Save your file as `questions.md`:

```markdown
## Q1: What is the primary difference between Managed Identity and Storage Access Keys?
**Answer:** Managed Identity eliminates storing secrets or rotating passwords by delegating authentication directly to Microsoft Entra ID.
**Explain simply:** Think of access keys like a physical house key you can accidentally drop or lose; Managed Identity is like facial recognition built directly into the front door.
**Tags:** Security, Identity, Azure

## Q2: Why configure training compute clusters to auto-scale down to zero nodes?
**Answer:** Setting minimum nodes to 0 ensures you incur zero billing charges when no training jobs are actively executing.
**Explain simply:** Like turning off the lights when leaving a room, auto-scale shuts down cloud servers the second they finish work.
**Tags:** Cost, Compute, Optimization

## Q3: What is the purpose of an MLflow Artifact Store?
**Answer:** An artifact store permanently preserves trained model weights, evaluation plots, and serialized pipeline definitions for reproducibility.
**Explain simply:** It is the trophy case and filing cabinet where the experiment's final deliverables are locked and indexed.
**Tags:** MLflow, Tracking, Storage
```

### Generate a Starter Template
Generate a ready-to-fill template file anytime by running:
```bash
python ingest.py questions-template
```
*Output:* `Created ready-to-fill template file: .../questions_template.md`

---

### AI Prompt: Generate Recap + 10 Questions from Transcripts
Copy and paste this prompt into Claude, ChatGPT, or Gemini along with your raw class transcript:

````text
You are an expert technical curriculum designer. I am providing you with today's class lecture transcript. Please analyze the transcript and generate two items:

ITEM 1: "In a Nutshell" (Class Recap)
Write a 2-3 sentence executive summary explaining what was taught today, why it matters, and the core outcome.

ITEM 2: Self-Study Quiz Questions (10-15 Questions)
Generate 10 to 15 questions in the exact Markdown format shown below. For every question:
1. "## Q<number>: <concise question>"
2. "**Answer:** <technically accurate, 1-2 sentence direct answer>"
3. "**Explain simply:** <a plain-English real-world analogy or beginner-friendly intuition>"
4. "**Tags:** <2-4 comma-separated topic tags>"

EXAMPLE OUTPUT FORMAT:
## Q1: Why use Azure ML Environments rather than bare virtual machines?
**Answer:** Environments bundle operating system patches, Python interpreters, and library dependencies into reproducible Docker containers that run identically across local workstations and cloud clusters.
**Explain simply:** Instead of re-baking a cake from scratch on every computer, an Environment is like buying pre-packaged frozen dough that bakes identically anywhere.
**Tags:** Containers, Environments, Reproducibility

Here is the lecture transcript:
[PASTE TRANSCRIPT HERE]
````

---

## 8. Daily After-Class Workflow Checklist

Keep this quick 5-minute routine after every class session:

- [ ] **Step 1 — Prepare your materials**:
  - Save your lecture notes as `dayNN_summary.docx`.
  - Save lecture transcripts as `dayNN_transcript_part1.docx`, etc.
  - Export whiteboard photos as `.png` or `.jpg`.
  - Run the AI prompt on your transcript to generate `dayNN_questions.md` and the 2-sentence recap.
- [ ] **Step 2 — Open the Ingest Tool**:
  ```bash
  python ingest.py
  ```
- [ ] **Step 3 — Ingest Day items**:
  - If Day doesn't exist yet: `create-day`.
  - Add summary: `add/replace summary`.
  - Add transcripts: `add transcript` (Part 1, Part 2...).
  - Add whiteboard photos: `add board photo`.
  - Add external resources: `add link`.
  - Add questions: `add questions-set`.
  - Choose `Add another item` between files to keep working in one session.
- [ ] **Step 4 — Publish once**:
  - Select `Publish now (git push to Cloudflare Workers)`.
  - Review the list of staged changes.
  - Confirm `[Y]`.
- [ ] **Step 5 — Check the live site**:
  - Open your live `.workers.dev` URL after ~1 minute.
  - Confirm the new Day appears with tabs, viewers, and questions active.

---

## 9. Fixing Mistakes: Overwrite, Remove, Undo, Verify & Rebuild

### A. Replacing an Existing File (Overwrite)
If you edit a summary, transcript, or whiteboard image and re-upload it with the same target name:
1. The tool detects the collision and displays the existing size vs new size.
2. It prompts: `Are you sure you want to OVERWRITE this existing file?`
3. Backs up the prior JSON file automatically before replacing.

### B. Removing an Item (`remove`)
To delete a specific transcript, photo, link, question, or an entire day/module:
```bash
python ingest.py remove
```
Prompts you to select the item type and module, then asks you to **type the item name** to confirm deletion (preventing accidental clicks). It removes the file, updates `day.json`, regenerates search indices, and backs up state.

### C. Reverting the Last Operation (`undo`)
If an upload was a mistake, undo it immediately:
```bash
python ingest.py undo
```
*Actual output:*
```
Found latest backup: 20261108_042041_424
  • modules/mlops-fundamentals/days/day-01/day.json
  • modules/mlops-fundamentals/manifest.json
? Restore this backup and revert the last operation? Yes
  Deleted uploaded file: modules/mlops-fundamentals/days/day-01/summary.docx
  Restored manifest: modules/mlops-fundamentals/days/day-01/day.json
  Restored manifest: modules/mlops-fundamentals/manifest.json
Undo completed successfully!
```

### D. Verifying Integrity (`verify`)
Audit all JSON files, schema validity, and file sizes across storage:
```bash
python ingest.py verify
```
Or verify a single module:
```bash
python ingest.py verify --module mlops-associate
```

### E. Rebuilding Manifests & Search Indices (`rebuild-index`)
If you ever edit a JSON file manually or want to regenerate all derived counters, whiteboard galleries, and search entries:
```bash
python ingest.py rebuild-index
```

### F. Viewing the Content Tree (`list`)
Inspect all modules, days, labs, and pending publish count:
```bash
python ingest.py list
```

---

## 10. Practice Safely: Dry-Run and Local Sandbox

### Option 1: Dry-Run Mode (`--dry-run`)
Add `--dry-run` to any command to see the exact plan without modifying any files:
```bash
python ingest.py init --dry-run
python ingest.py publish --dry-run
python ingest.py undo --dry-run
```
*Example Dry-Run Output:*
```
Dry-run mode: would commit and push public/content. No changes written.
```

### Option 2: Local Sandbox (`--target local`)
To practice without touching your production `public/content/` folder, use `--target local`.
This isolates all files inside `./dev-content/` (which is gitignored):
```bash
# Initialize local practice storage
python ingest.py init --target local

# Ingest practice content
python ingest.py --target local

# Inspect local content tree
python ingest.py list --target local
```

---

## 11. Student Reader's Portal Guide

Share these tips with your students:

1. **Module & Day Navigation**:
   - The left sidebar lists all available modules. Clicking a module expands its days in order.
   - On mobile devices, tap the hamburger icon in the top header to open the navigation drawer.
2. **Day View Tabs**:
   - **Summary**: Read the core class document with in-browser DOCX, Markdown, or PDF rendering, zoom controls, and direct download.
   - **Transcripts**: Browse full class transcripts. Use the segment dropdown to switch between lecture parts.
   - **Important Links**: Access documentation links, notebooks, and reference materials.
   - **Class Board Work**: High-resolution whiteboard captures. Click any photo to open the interactive lightbox.
   - **Questions**: Review interactive quiz cards. Click **Explain simply** to see intuition analogies; filter by tag.
3. **Command Palette Search (`Ctrl + K` or `Cmd + K`)**:
   - Press `Ctrl + K` anywhere on the site.
   - Instantly search through summaries, transcripts, whiteboard captions, and quiz questions with live keyboard navigation.
4. **Marking Progress**:
   - Check the **Understood** or **Mark as Read** checkbox on each Day and Lab.
   - Progress is saved in the browser's local storage and reflected in module progress bars.
5. **Progress & Backup Modal**:
   - Click the **Progress & Backup** button in the top navigation.
   - View completed day statistics.
   - Click **Export Progress** to download a small JSON backup file.
   - Moving to a new laptop or phone? Click **Import Progress** on the new device to restore completion states.
6. **Dark Mode Toggle**:
   - Click the theme toggle icon in the top header to switch between crisp light mode and eye-friendly dark mode.

---

## 12. Storage, Limits & Housekeeping

Check your current storage consumption anytime:
```bash
python ingest.py stats
```

### Cloudflare Workers Static Assets Free Tier Limits
- **Monthly Build Minutes**: **3,000 build minutes/month** (roughly 1–2 minutes per publish, allowing 1,500–3,000 deploys every month).
  *Static asset requests*: **Free and unlimited** across all Cloudflare global edge locations.
- **File Count**: **20,000 files maximum**.
  *The CLI warns at 70% (14,000 files) and alerts at 75% (15,000 files).*
- **Single File Size**: **25 MiB maximum**.
  *The CLI automatically rejects any file $>25\text{ MiB}$ and warns if $>10\text{ MiB}$.*

### Git Repository Housekeeping
- When you update or remove files in `public/content/`, older versions remain in Git history. This is normal and provides a complete audit trail.
- Keep master copies of your original source files (`.docx`, raw whiteboard camera photos) backed up on Google Drive or OneDrive.

---

## 13. Troubleshooting Guide

| Symptom | Cause | Solution |
|---|---|---|
| **Deploy fails with "Invalid _redirects / infinite loop"** | A `public/_redirects` file exists | **Delete `public/_redirects`**. In Cloudflare Workers Static Assets, `wrangler.jsonc` handles SPA routing via `not_found_handling: "single-page-application"`. A `_redirects` file creates a circular loop. |
| **Build runs but Cloudflare changes my project settings** | Missing or uncommitted `wrangler.jsonc` | Ensure `wrangler.jsonc` is committed in the root of your Git repository so Cloudflare honors its settings. |
| **Cloudflare Workers build fails** | Old Node.js version used in build container | Verify `.node-version` file exists in repo root and contains `22`. Ensure Build command is `npm run build`. |
| **Content not showing after publish** | Build still in progress or stale browser cache | 1. Check Cloudflare dashboard deployments tab.<br>2. Hard refresh your browser (`Ctrl + F5` or `Cmd + Shift + R`). |
| **"Nothing to publish"** | No uncommitted changes in `public/content/` | You have already published all current content. Ingest new items before publishing. |
| **Git push rejected / auth failed** | Terminal not authenticated with GitHub | Run `gh auth login` or generate a GitHub Personal Access Token with `repo` scope. |
| **File rejected: "Cloudflare limit is 25 MiB"** | File exceeds single-file limit | Compress the document or image. For video or large datasets, host externally and add as a Link. |
| **Blank module or missing days** | Manifests out of sync | Run `python ingest.py rebuild-index` followed by `python ingest.py publish`. |
| **Deep link gives 404 on refresh** | SPA fallback not catching the path | Ensure `wrangler.jsonc` has `"not_found_handling": "single-page-application"` and output directory is `dist`. |
| **Accidentally published wrong file** | Human error during upload | Run `python ingest.py remove` to remove the wrong item, re-upload the correct one, and run `python ingest.py publish`. |
| **Merge conflict on public/content** | Multiple people pushed to `main` simultaneously | Run `git pull origin main --rebase`, resolve conflicts on JSON manifests, run `python ingest.py rebuild-index`, then push. |

---

## 14. Optional: Upgrading to Cloudflare R2 Later

If your library grows beyond 15,000 files or you need to host large binary files ($>25\text{ MiB}$), you can upgrade to Cloudflare R2 storage without changing your folder layout:

### Step 1: Create an R2 Bucket
1. In Cloudflare Dashboard, go to **R2** $\rightarrow$ **Create bucket** (e.g. `ai13-content`).
2. Go to **Bucket Settings** $\rightarrow$ **Public Access** $\rightarrow$ Enable Custom Domain or Managed `r2.dev` URL.
   *(Note: `r2.dev` public URLs have a Cloudflare rate limit of 10 requests/second intended for development; for production, connect a custom domain or your worker domain).*

### Step 2: Configure CORS on the R2 Bucket
In bucket settings $\rightarrow$ **CORS Policy**, paste this JSON:
```json
[
  {
    "AllowedOrigins": [
      "https://your-site.workers.dev",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

### Step 3: Configure Environment Variables
In your local `.env`:
```env
INGEST_TARGET=r2
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=ai13-content
```
In your Cloudflare Pages / Workers Dashboard $\rightarrow$ **Settings** $\rightarrow$ **Environment variables**:
```env
VITE_CONTENT_BASE_URL=https://your-r2-public-url.com
```

### Step 4: Copy Existing Content
Because the folder layout is **identical**, copy all folders from `public/content/` directly into the root of your R2 bucket. Your site will immediately stream content from R2!

---

## 15. One-Page Quick Reference Card

### Everyday Commands
```bash
# 1. Launch interactive content wizard (Default: site mode)
python ingest.py

# 2. Publish uncommitted content to Cloudflare Workers
python ingest.py publish

# 3. Check storage statistics, file count & free-tier limits
python ingest.py stats

# 4. View curriculum content tree & pending publish count
python ingest.py list

# 5. Generate ready-to-fill questions template
python ingest.py questions-template

# 6. Audit manifests and file references
python ingest.py verify

# 7. Rebuild all search indices and counters from storage
python ingest.py rebuild-index

# 8. Interactive item removal
python ingest.py remove

# 9. Revert last operation from backup
python ingest.py undo
```

### Helpful Command Flags
| Flag | Example | Description |
|---|---|---|
| `--dry-run` | `python ingest.py publish --dry-run` | Preview actions without writing to disk or Git. |
| `--target local` | `python ingest.py --target local` | Use isolated `./dev-content/` practice sandbox. |
| `--target r2` | `python ingest.py --target r2` | Connect to Cloudflare R2 bucket. |
| `--yes` | `python ingest.py undo --yes` | Auto-confirm non-destructive confirmation prompts. |
| `--verbose` | `python ingest.py --verbose` | Enable detailed debug logging output. |

### Frontend Local Verification Commands
```bash
# Start local React development server
npm run dev

# Check all content JSON files against TypeScript schemas
npm run check-content

# Verify TypeScript types
npm run typecheck

# Test production build
npm run build
```
