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
7. [The Questions File & Format Guide](#7-the-questions-file--format-guide)
8. [Getting Questions from ChatGPT or Another AI](#8-getting-questions-from-chatgpt-or-another-ai)
9. [Daily After-Class Workflow Checklist](#9-daily-after-class-workflow-checklist)
10. [Fixing Mistakes: Overwrite, Remove, Undo, Verify & Rebuild](#10-fixing-mistakes-overwrite-remove-undo-verify--rebuild)
11. [Practice Safely: Dry-Run and Local Sandbox](#11-practice-safely-dry-run-and-local-sandbox)
12. [Student Reader's Portal Guide](#12-student-readers-portal-guide)
13. [Storage, Limits & Housekeeping](#13-storage-limits--housekeeping)
14. [Troubleshooting Guide](#14-troubleshooting-guide)
15. [Optional: Upgrading to Cloudflare R2 Later](#15-optional-upgrading-to-cloudflare-r2-later)
16. [One-Page Quick Reference Card](#16-one-page-quick-reference-card)

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
3. **Cloudflare Workers Static Assets Website**: When you run `python ingest.py publish`, the tool detects both content files (`public/content/`) and any other changed project files (docs, README, code), stages them in two clean commits (`chore: ...` followed by `content: ...`), and pushes in a single `git push`. Cloudflare automatically detects the push, runs `npm run build` and `npx wrangler deploy`, and updates your live site in ~1 minute with just ONE build.

---

## 2. Content Model

All curriculum content is organized hierarchically:

```
Course Portal
  ├── Module (e.g., MLOps Associate - AI-300)
  │     ├── Day 1
  │     │     ├── In a nutshell (2-3 sentence executive recap entered during create-day)
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
- **In a nutshell Recap**: A 2–3 sentence executive recap of the day's key concepts. This is entered when creating the day in `create-day`.
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
In the root directory of your project repository:
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
  3. Select **GitHub.com** → **HTTPS** → **Yes** (authenticate Git with your GitHub credentials) → **Login with a web browser**.
  4. Enter the one-time code shown in your terminal into the browser and approve access.

- **Option B (Git Credential Manager / Personal Access Token)**:
  1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens (Tokens classic)**.
  2. Generate a token with the `repo` scope.
  3. When you run `git push` for the first time, Git will prompt for your username and password. Enter your GitHub username and paste the personal access token as the password. Windows Git Credential Manager will remember it.

### Step 5: Initialize Content Repository Bootstrap Files & Push to GitHub
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

Now push the newly committed starter files to GitHub once:
```bash
git push origin main
```
> [!NOTE]
> `python ingest.py init` creates empty starter files `public/content/index.json` and `public/content/search-index.json` and commits them locally. Running `git push origin main` ensures your starter content files are published to GitHub before your first Cloudflare deployment.

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
The repository includes a committed [wrangler.jsonc](wrangler.jsonc) file in the root directory:
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
- `assets.not_found_handling: "single-page-application"` enables client-side SPA routing automatically so direct links (e.g. `/m/module-slug/day/1`) load without 404 errors on refresh.

> [!CAUTION]
> **Do NOT create `public/_redirects`!**
> There must be **NO `public/_redirects` file** in the repository. In Cloudflare Workers Static Assets, a `_redirects` file conflicts with the `not_found_handling: "single-page-application"` setting and causes an **infinite loop deployment error**. SPA routing is already fully handled by `wrangler.jsonc`.

### Step 4: Node.js 22 Verification
Cloudflare Workers builds respect the [`.node-version`](.node-version) file present in the repository root.
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
   - If you have an older `.doc` file, open it in Microsoft Word or LibreOffice and click **Save As → Word Document (.docx)**. The CLI automatically rejects legacy `.doc` files to prevent broken viewers.
2. **One File Per Upload**:
   - The CLI strictly processes **one item at a time**.
   - Do **not** drag multiple files or zip archives into the picker. The tool validates individual file size, content hash, and placement.
3. **File Size Guidance**:
   - Standard documents (`.docx`, `.md`, `.pdf`, `.ipynb`) are typically 50 KB – 5 MB.
   - Files >10 MiB trigger a warning.
   - Files >25 MiB are **rejected** because Cloudflare has a strict 25 MiB single-file limit for static assets.
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
? Day Title: Introduction to MLOps
? Subtitle: Foundations & Azure Machine Learning Architecture
? Description: Overview of the MLOps lifecycle, workspaces, and compute targets.
? In a nutshell / class recap: We explored why MLOps is required for repeatable AI delivery and set up our Azure ML workspace.
```

> [!WARNING]
> **Do not type "Day 1:" or "Day N:" in the Day Title prompt!**
> The portal UI and CLI automatically prefix the day number (`Day 1: <Your Title>`). Typing `"Day 1: Introduction to MLOps"` will cause the site to display `"Day 1: Day 1: Introduction to MLOps"`. Enter only `"Introduction to MLOps"`.

> [!TIP]
> **Updating Day Meta & Recap:**
> The "In a nutshell" recap is entered right here during `create-day`. If you ever want to update the title, subtitle, description, or the recap later, simply re-run `create-day` with the same Day number (e.g., `1`). The CLI will prompt: `Day 1 already exists in this module. Update its meta?` Press **Yes** to modify any field.

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
? Select course day: Day 1: Introduction to MLOps
```
The file dialog opens (or you type the relative path):
```
Select Day Summary (.docx, .md, .html, .pdf): ./source-docs/day1_summary.docx
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
? Select course day: Day 1: Introduction to MLOps
Select Transcript (.docx, .md, .txt): ./source-docs/day1_part1.docx
? Transcript Title: Morning Lecture - MLOps Principles
? Order in Day: 1
```
Repeat for Part 2:
```
? What would you like to ingest or create?
  add transcript
Select Transcript (.docx, .md, .txt): ./source-docs/day1_part2.docx
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
? Select course day: Day 1: Introduction to MLOps
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
? Select course day: Day 1: Introduction to MLOps
Select Questions File (.md): ./source-docs/day1_questions.md
```
*Output:*
```
Successfully merged 3 questions into Day 1!
```

---

### Step 8: Publish to Cloudflare Workers (Unified Push)
When prompted after your ingest:
```
? What next?
  > Publish now (git push to Cloudflare Workers)
```
The publish command automatically detects both your new curriculum content and any other project edits (documentation, code updates, README). It displays both lists with file counts and sizes, and prompts whether to include non-content changes:

*Actual Terminal Output:*
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Publish Content & Project Changes to Cloudflare Workers                     │
└─────────────────────────────────────────────────────────────────────────────┘

Pending content changes: 8 file(s) (8 added, 0 modified, 0 deleted) ~ 182.4 KB
  • ?? public/content/modules/mlops-associate/days/day-01/day.json (2.1 KB)
  • ?? public/content/modules/mlops-associate/days/day-01/summary.docx (148.2 KB)
  • ?? public/content/modules/mlops-associate/days/day-01/transcripts/01-morning-lecture.docx (18.4 KB)
  • ?? public/content/modules/mlops-associate/days/day-01/transcripts/02-afternoon-walkthrough.docx (12.1 KB)
  • ?? public/content/modules/mlops-associate/manifest.json (1.1 KB)
  • ?? public/content/modules/mlops-associate/visuals.json (240 B)
  • ?? public/content/index.json (180 B)
  • ?? public/content/search-index.json (180 B)

Other changed project files: 2 file(s) ~ 4.2 KB
  • M  HOW_TO_USE.md (3.8 KB)
  • M  README.md (410 B)

? Also include 2 other changed files (HOW_TO_USE.md, README.md)?
  ❯ Yes, include everything (1 push, 1 build)
    No, content only

Running project verification checks (typecheck & build)...
✓ Type check and build passed cleanly.

? Non-content commit message: chore: update HOW_TO_USE.md, README.md
? Content commit message: content: create module 'mlops-associate', create Day 1, and 4 more (6 items)
? Commit and push to origin/main? Yes

Fetching remote to check status...
[main 1a2b3c4] chore: update HOW_TO_USE.md, README.md
 2 files changed, 25 insertions(+), 10 deletions(-)
[main 5d6e7f8] content: create module 'mlops-associate', create Day 1, and 4 more (6 items)
 8 files changed, 142 insertions(+)
 create mode 100644 public/content/modules/mlops-associate/days/day-01/day.json
 ...

Pushed 2 commits to GitHub (origin/main).
Commit URL: https://github.com/Drylegend/ai13_transcripts/commit/5d6e7f8
Cloudflare Workers will build and deploy in ~1 minute.
Remember: free tier includes 3,000 build minutes/month (~1-2 min per publish) and unlimited static requests. Batch your uploads when possible.
```

Open your live `.workers.dev` URL in ~60 seconds to see Day 1 live!

---

## 7. The Questions File & Format Guide

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

### Key Formatting Rules
1. Every question heading must begin with `## Q<number>: <Question text>`.
2. `**Answer:**` is required on the very next line.
3. `**Explain simply:**` provides an optional, beginner-friendly intuition analogy.
4. `**Tags:**` provides optional comma-separated topic tags used for filtering in the UI.

### Generate a Starter Template
Generate a ready-to-fill template file anytime by running:
```bash
python ingest.py questions-template
```
*Output:* `Created ready-to-fill template file: .../questions_template.md`

---

## 8. Getting Questions from ChatGPT or Another AI

You can easily generate the class recap and all self-study questions directly from your lecture transcript using ChatGPT, Claude, or Gemini.

### The AI Generation Prompt
Copy and paste this exact prompt into your AI model along with your class transcript:

````text
You are an expert technical curriculum designer. I am providing you with today's class lecture transcript. Please analyze the transcript and generate two items:

ITEM 1: "In a Nutshell" (Class Recap)
Write a 2-3 sentence executive summary explaining what was taught today, why it matters, and the core outcome.

ITEM 2: Self-Study Quiz Questions (10-15 Questions)
Generate 10 to 15 questions in the exact Markdown format shown below. Output the entire markdown inside a single raw markdown code block so it is easy to copy cleanly.

For every question follow this structure:
## Q<number>: <concise question>
**Answer:** <technically accurate, 1-2 sentence direct answer>
**Explain simply:** <a plain-English real-world analogy or beginner-friendly intuition>
**Tags:** <2-4 comma-separated topic tags>

EXAMPLE FORMAT:
```markdown
## Q1: Why use Azure ML Environments rather than bare virtual machines?
**Answer:** Environments bundle operating system patches, Python interpreters, and library dependencies into reproducible Docker containers that run identically across local workstations and cloud clusters.
**Explain simply:** Instead of re-baking a cake from scratch on every computer, an Environment is like buying pre-packaged frozen dough that bakes identically anywhere.
**Tags:** Containers, Environments, Reproducibility
```

Here is the lecture transcript:
[PASTE TRANSCRIPT HERE]
````

### Best Practices When Generating with AI:
1. **Always Request a Code Block**: Asking the AI to place the output inside a markdown code block ensures indentation and asterisks (`**Answer:**`) aren't lost or converted into rich text.
2. **Use the One-Click Copy Button**: Click the copy icon in the top right of the AI's code block rather than dragging and selecting text with your mouse.
3. **Save as UTF-8**: Paste the content into a text editor (VS Code or Notepad) and save as `dayNN_questions.md`. Ensure the file encoding is **UTF-8**.
4. **Verify the First Line**: Double-check that the file begins directly with `## Q1:` (remove any intro chat from the AI like *"Here are your questions:"*).
5. **Skim for Accuracy**: Briefly skim the answers to make sure the AI did not hallucinate commands or terminology.
6. **Preventing Duplicates on Re-runs**:
   > [!IMPORTANT]
   > The ingest tool merges questions into Day storage by matching question text. If you regenerate questions with slightly different wording, the tool will treat them as new questions and append them! If you want to replace an existing set of questions, run `python ingest.py remove`, choose `questions`, and confirm removal before uploading the new set.

---

## 9. Daily After-Class Workflow Checklist

Keep this quick 5-minute routine after every class session:

- [ ] **Step 1 — Prepare your materials**:
  - Save lecture notes as `dayNN_summary.docx`.
  - Save transcripts as `dayNN_part1.docx`, `dayNN_part2.docx`...
  - Export whiteboard photos as `.png` or `.jpg`.
  - Run the AI prompt on your transcript to generate `dayNN_questions.md` and the 2-sentence recap.
- [ ] **Step 2 — Open the Ingest Tool**:
  ```bash
  python ingest.py
  ```
- [ ] **Step 3 — Ingest Day items**:
  - If Day doesn't exist yet: `create-day` (enter the title and the "In a nutshell" recap).
  - Add summary: `add/replace summary`.
  - Add transcripts: `add transcript` (Part 1, Part 2...).
  - Add whiteboard photos: `add board photo`.
  - Add external resources: `add link`.
  - Add questions: `add questions-set`.
  - Choose `Add another item` between files to keep working in one session.
- [ ] **Step 4 — Publish once (Unified Push)**:
  - Select `Publish now (git push to Cloudflare Workers)`.
  - Review both pending content and any other changed project files (docs, configs, code).
  - Choose whether to include other files (`Yes, include everything` or `No, content only`).
  - If code files are included, the tool automatically verifies types and build.
  - Confirm the commit messages and push (`[Y]`). Everything goes live in a single Cloudflare build!
- [ ] **Step 5 — Check the live site**:
  - Open your live `.workers.dev` URL after ~1 minute.
  - Confirm the new Day appears with tabs, viewers, and questions active.

---

## 10. Fixing Mistakes: Overwrite, Remove, Undo, Verify & Rebuild

### A. Replacing an Existing File (Overwrite)
If you edit a summary, transcript, or whiteboard image and re-upload it with the same target name:
1. The tool detects the collision and displays the existing size vs new size.
2. It prompts: `Are you sure you want to OVERWRITE this existing file?`
3. Backs up the prior JSON file automatically before replacing.

### B. Updating Day Metadata & Recap
If you need to change the title, subtitle, description, or the "In a nutshell" recap for an existing day:
1. Run `python ingest.py` and choose `create-day`.
2. Enter the same Day Number (e.g. `1`).
3. The CLI prompts: `Day 1 already exists in this module. Update its meta?` Press **Yes** to update any of the text fields.

### C. Removing an Item (`remove`)
To delete a specific transcript, photo, link, question, or an entire day/module:
```bash
python ingest.py remove
```
Prompts you to select the item type and module, then asks you to **type the item name** to confirm deletion (preventing accidental clicks). It removes the file, updates `day.json`, regenerates search indices, and backs up state.

### D. Reverting the Last Operation (`undo`)
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
  Restored manifest: modules/mlops-fundamentals/days/day-01/manifest.json
Undo completed successfully!
```

### E. Verifying Integrity (`verify`)
Audit all JSON files, schema validity, and file sizes across storage:
```bash
python ingest.py verify
```
Or verify a single module:
```bash
python ingest.py verify --module mlops-associate
```

### F. Rebuilding Manifests & Search Indices (`rebuild-index`)
If you ever edit a JSON file manually or want to regenerate all derived counters, whiteboard galleries, and search entries:
```bash
python ingest.py rebuild-index
```

### G. Viewing the Content Tree (`list`)
Inspect all modules, days, labs, and pending publish count:
```bash
python ingest.py list
```

### H. The Unified Publish Workflow & Safety Rails
When you run `python ingest.py publish`, the tool inspects `git status --porcelain` and divides pending changes into two clear groups:
1. **Content**: Files inside `public/content/` (modules, days, transcripts, summaries, photos, JSON manifests, search index).
2. **Other**: Any modified or untracked project files outside `public/content/` (e.g., `README.md`, `HOW_TO_USE.md`, `src/`, configs).

#### Interactive Selection & Two-Commit Sequence
If non-content files are detected, the tool displays counts, filenames, and sizes for both groups, then asks:
```
? Also include 2 other changed files (HOW_TO_USE.md, README.md)?
  ❯ Yes, include everything (1 push, 1 build)
    No, content only
```
When you choose **Yes, include everything**:
1. The tool creates a **non-content commit first** (e.g. `chore: update HOW_TO_USE.md, README.md`). You can press Enter to accept the auto-generated message or edit it.
2. The tool creates the **content commit second** (e.g. `content: create module 'mlops-associate' (6 items)`).
3. The tool executes **one single `git push`**. Cloudflare detects the push and runs just **one build** for both your code/documentation updates and your new content!

#### Command-Line Flags
You can skip prompts in scripts or automated workflows using these flags:
- `python ingest.py publish --all`: Automatically stages both content and non-content files without asking.
- `python ingest.py publish --content-only`: Publishes only `public/content/` files, leaving other working directory edits untouched.
- `python ingest.py publish --no-check`: Skips the automatic `npm run typecheck && npm run build` verification step.
- `python ingest.py publish --dry-run`: Previews the complete publish plan (partitioned file lists, proposed commit messages, and verification check status) without staging, committing, or pushing anything.

#### Safety Rails
The publish command enforces strict security and stability boundaries:
- **Refused Files**: The tool strictly refuses to stage `.env*` files, `.staging/`, `.ingest_backups/`, `.ingest_logs/`, `node_modules/`, `dist/`, or any file larger than **25 MiB** (Cloudflare's maximum static asset limit). If any forbidden file is detected in the staging candidate list, publish stops immediately and prints a clear explanation.
- **Pre-Commit Code Verification**: Whenever non-content changes (like TypeScript, React components, or Vite configs) are included, the tool automatically runs `npm run typecheck` and `npm run build` **before committing**. If errors occur:
  - The build errors are printed directly to your terminal.
  - Publish stops before creating any git commits.
  - The CLI asks: `? Publish only content files instead?` so your course content is never blocked by broken frontend experiments.
- **Push & Rebase Recovery**:
  - The tool runs `git fetch` before pushing to ensure you have the latest remote commits.
  - If your local branch is behind, it automatically runs `git pull --rebase` to integrate remote changes cleanly.
  - If a rebase conflict occurs, it cleanly runs `git rebase --abort` to restore your working tree, prints the conflicting files, and provides step-by-step instructions.
  - It **never force pushes** (`git push --force` is strictly forbidden).
- **Unpushed Commits Detection**:
  - Even if your working tree has no uncommitted changes, running `python ingest.py publish` checks if you have existing local commits that have not been pushed to GitHub.
  - Instead of saying "Nothing to publish", it shows `Found N unpushed commit(s) not yet on GitHub`, asks for confirmation, and pushes them safely.

---

## 11. Practice Safely: Dry-Run and Local Sandbox

### Option 1: Dry-Run Mode (`--dry-run`)
Add `--dry-run` to any command to see the exact plan without modifying any files:
```bash
python ingest.py init --dry-run
python ingest.py publish --dry-run
python ingest.py undo --dry-run
```
*Example Dry-Run Output:*
```
DRY RUN: No commits or pushes will be performed.
Would stage non-content commit: chore: update HOW_TO_USE.md (1 file)
Would stage content commit: content: create module 'mlops-associate' (6 items)
Would verify checks: npm run typecheck && npm run build
Would push to: origin/main
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

## 12. Student Reader's Portal Guide

Here is an overview of how students navigate and use the live portal UI:

1. **Module & Day Navigation**:
   - The left sidebar lists all published modules in accordion format.
   - Expanding a module lists its Days with status icons and item count chips.
   - On mobile screens (< 1024px), tap the **hamburger menu button** in the top-left header to open the slide-in sidebar drawer.
2. **Day Header Card**:
   - Prominently displays the day number badge (e.g., `01`), title, subtitle, and an executive **"In a nutshell"** recap card.
3. **Day View Tabs**:
   - **Summary Tab**:
     - Action bar at top features a **Mark as Read** toggle button and a **Download Summary** button.
     - Document viewer renders `.docx`, `.md`, `.pdf`, and `.html`.
     - When viewing Word documents (`.docx`), viewer controls include **Zoom Out** (`-`), current zoom percentage (e.g. `100%`), and **Zoom In** (`+`) (scaling from 70% to 150%).
   - **Transcripts Tab**:
     - Displays all lecture parts as clean, expandable cards with sequence badges (`01`, `02`...), title, filename, and size.
     - Each transcript card includes:
       - **Mark Read** / **Read** toggle button.
       - **Download** button.
       - **Click to Read** / **Hide Reader** button that expands the inline document reader directly underneath.
     - Multiple transcripts can be expanded simultaneously for easy reading.
   - **Important Links Tab**:
     - Cards showing resource title, external URL, and optional description with external-link indicators.
   - **Class Board Work Tab**:
     - Responsive thumbnail grid of classroom whiteboard photos.
     - Clicking any photo opens the full-screen interactive **Lightbox** with zoom, pan, photo captions, and prev/next navigation.
   - **Questions Tab**:
     - Self-study quiz cards with sequence tiles (`Q1`, `Q2`), question text, and topic tags.
     - Filter questions by topic using the interactive tag chips at the top.
     - Each card has an **Understood?** / **Understood** checkmark button for personal study tracking.
     - Clicking anywhere on a question card expands it to reveal:
       - **Direct Answer** block.
       - **Explain It Simply (Beginner-Friendly)** block with intuition analogies.
4. **Labs Section**:
   - Accessed from the sidebar or `/m/<module>/labs`.
   - Cards display category chips (`hands-on`, `assessment`, `challenge`), title, and a **StatusBadge** (`Not Started`, `In Progress`, `Done`).
   - Click the status cycle button (circular arrow icon) to quickly cycle the lab status (`Not Started` → `In Progress` → `Done`).
   - The full Lab Detail page displays the official lab guide link, ingested notes viewer, architecture diagrams with lightbox, and an auto-saving private notes scratchpad.
5. **Visual Notes Section**:
   - Single-page gallery aggregating all whiteboard photos and lab architecture doodles across the entire module.
   - Filterable by type (All, Board Work, Lab Doodles).
6. **Command Palette Search (`Ctrl + K` or `Cmd + K`)**:
   - Click the search bar in the top header (or press `Ctrl + K` / `Cmd + K`, or tap the search icon on mobile).
   - Instantly search through modules, days, summaries, transcripts, whiteboard captions, and quiz questions with live keyboard navigation.
7. **Progress & Backup**:
   - Click the **Database icon button** in the top-right header or the **Progress & Backup** button at the bottom of the left sidebar.
   - View your overall module completion percentage.
   - **Export Progress**: Downloads a portable `.json` backup file containing your completion checkmarks and lab statuses.
   - **Import Progress**: Restores progress from a backup file on another device (with options to **Merge with Existing** or **Replace All**).
   - **Reset All Progress**: Safely clears your local progress (requires typing `"RESET"`).
8. **Dark Mode Toggle**:
   - Click the Sun/Moon icon button in the top-right header to switch between light mode and dark mode.

---

## 13. Storage, Limits & Housekeeping

Check your current storage consumption anytime:
```bash
python ingest.py stats
```

### Cloudflare Workers Static Assets Free Tier Limits
- **Monthly Build Minutes**: **3,000 build minutes/month** (roughly 1–2 minutes per publish, allowing 1,500–3,000 deploys every month).
- **Static Asset Requests**: **Free and unlimited** across all Cloudflare global edge locations.
- **File Count**: **20,000 files maximum**.
  *The CLI warns at 70% (14,000 files) and alerts at 75% (15,000 files).*
- **Single File Size**: **25 MiB maximum**.
  *The CLI automatically rejects any file >25 MiB and warns if >10 MiB.*

### Git Repository Housekeeping
- When you update or remove files in `public/content/`, older versions remain in Git history. This is normal and provides a complete audit trail.
- Keep master copies of your original source files (`.docx`, raw whiteboard camera photos) backed up on Google Drive or OneDrive.

---

## 14. Troubleshooting Guide

| Symptom | Cause | Solution |
|---|---|---|
| **Deploy fails with "Invalid _redirects / infinite loop"** | A `public/_redirects` file exists | **Delete `public/_redirects`**. Cloudflare Workers Static Assets uses `wrangler.jsonc` with `"not_found_handling": "single-page-application"` to handle SPA routing. Having a `_redirects` file creates a circular loop. |
| **Build runs but Cloudflare changes my project settings** | Missing or uncommitted `wrangler.jsonc` | Ensure `wrangler.jsonc` is committed in the root of your Git repository so Cloudflare honors your configuration. |
| **Cloudflare Workers build fails** | Old Node.js version used in build container | Verify `.node-version` file exists in repo root and contains `22`. Ensure Build command is `npm run build`. |
| **Content not showing after publish** | Build still in progress or stale browser cache | 1. Check Cloudflare dashboard deployments tab.<br>2. Hard refresh your browser (`Ctrl + F5` or `Cmd + Shift + R`). |
| **"Nothing to publish"** | No uncommitted changes in `public/content/` or other files, and all commits are pushed | You have already published all current work. Ingest new items or make edits before publishing. |
| **Git push rejected / rebase conflict** | Remote branch on GitHub has newer commits that conflict | The tool automatically attempts `git pull --rebase`. If there is a merge conflict, it safely aborts (`git rebase --abort`). Resolve conflicts manually: run `git pull`, edit conflicting files, run `python ingest.py rebuild-index`, then run `python ingest.py publish`. |
| **Build check failed before publish** | Non-content code or config changes caused TypeScript or Vite build errors | The tool stops before committing. Inspect the build error output, fix the code errors in `src/`, or choose **No, content only** (or run `python ingest.py publish --content-only`) to publish content immediately without publishing broken code. |
| **Publish refused: safety rail blocked file** | Attempted to stage `.env*`, `.staging/`, or a file > 25 MiB | The tool strictly blocks secret files and oversized files. Move `.env` files out of staging or add to `.gitignore`. For files > 25 MiB, compress them or host externally. |
| **Git push rejected / auth failed** | Terminal not authenticated with GitHub | Run `gh auth login` or generate a GitHub Personal Access Token with `repo` scope. |
| **File rejected: "Cloudflare limit is 25 MiB"** | File exceeds single-file limit | Compress the document or image. For video or large datasets, host externally and add as a Link. |
| **Blank module or missing days** | Manifests out of sync | Run `python ingest.py rebuild-index` followed by `python ingest.py publish`. |
| **Deep link gives 404 on refresh** | SPA fallback not catching the path | Ensure `wrangler.jsonc` has `"not_found_handling": "single-page-application"` and output directory is `dist`. |
| **Accidentally published wrong file** | Human error during upload | Run `python ingest.py remove` to remove the wrong item, re-upload the correct one, and run `python ingest.py publish`. |

---

## 15. Optional: Upgrading to Cloudflare R2 Later

If your library grows beyond 15,000 files or you need to host large binary files (>25 MiB), you can upgrade to Cloudflare R2 storage without changing your folder layout:

### Step 1: Create an R2 Bucket
1. In Cloudflare Dashboard, go to **R2** → **Create bucket** (e.g. `ai13-content`).
2. Go to **Bucket Settings** → **Public Access** → Enable Custom Domain or Managed `r2.dev` URL.
   *(Note: `r2.dev` public URLs are rate-limited and intended for development; for production, connect a custom domain or your worker domain).*

### Step 2: Configure CORS on the R2 Bucket
In bucket settings → **CORS Policy**, paste this JSON:
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
In your Cloudflare Workers Dashboard → project **Settings** → **Build** → **Variables and Secrets**:
```env
VITE_CONTENT_BASE_URL=https://your-r2-public-url.com
```
> [!IMPORTANT]
> `VITE_CONTENT_BASE_URL` must be added as a **BUILD variable** (under project Settings > Build > Variables), not a runtime secret, because Vite embeds it into the compiled JavaScript bundle at build time.

### Step 4: Copy Existing Content
Because the folder layout is **identical**, copy all folders from `public/content/` directly into the root of your R2 bucket. Your site will immediately stream content from R2!

---

## 16. One-Page Quick Reference Card

### Everyday Commands
```bash
# 1. Launch interactive content wizard (Default: site mode)
python ingest.py

# 2. Publish uncommitted content & project changes to Cloudflare Workers
python ingest.py publish

# Publish everything (content + other changed files) without interactive prompt
python ingest.py publish --all

# Publish only content files, leaving other working directory edits untouched
python ingest.py publish --content-only

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
| `--all` | `python ingest.py publish --all` | Automatically stage and publish both content and non-content project changes. |
| `--content-only` | `python ingest.py publish --content-only` | Publish only `public/content/` files, never staging or prompting for other files. |
| `--no-check` | `python ingest.py publish --no-check` | Skip automatic `npm run typecheck && npm run build` verification on code changes. |
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
