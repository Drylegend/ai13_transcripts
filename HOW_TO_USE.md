# Course Portal User Guide (HOW_TO_USE.md)

Welcome to the **Race | AI 13 | Transcripts & Summary** content management guide. This guide is written for instructors, teaching assistants, and course organizers who want to upload and manage class documents (`.docx`, `.md`, `.pdf`, `.ipynb`, `.html`, images) quickly, reliably, and with **zero card required**.

---

## 1. What This Site Is and How It Works

The course portal is built for zero hassle:

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│     Your Computer      │      │      Git / GitHub      │      │   Cloudflare Pages     │
│  (python ingest.py)    │ ───► │  (public/content/)     │ ───► │  (Fast Static Hosting) │
│ Ingests 1 item at time │      │ Holds docs & manifests │      │ Readers browse portal  │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

1. **The Ingest Tool on your computer** (`python ingest.py`): An interactive, multi-agent Python CLI that guides you to add files **one item at a time**. It optimizes images into WebP, validates schemas, updates manifests, and keeps search indices fresh.
2. **Built-in Content Repository** (`public/content/`): Content lives directly inside your project repository under `public/content/` — no external bucket, no credit card, and zero cloud setup required!
3. **Cloudflare Pages Website**: When you run `python ingest.py publish`, your content is pushed to your Git repository and automatically deployed to Cloudflare Pages in ~1 minute.

---

## 2. One-Time Setup (5 Minutes, No Card Needed)

1. **Check Python Version** (Python 3.10+):
   ```bash
   python --version
   ```

2. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Initialize the Content Repository**:
   ```bash
   python ingest.py init
   ```
   *This creates and commits bootstrap files `public/content/index.json` and `public/content/search-index.json`.*

4. **Run the Interactive Ingest Tool**:
   ```bash
   python ingest.py
   ```

---

## 3. Everyday Workflow: Add Content & Publish

### Step A: Add Items with the Wizard
Run:
```bash
python ingest.py
```
You will be prompted:
```
? What would you like to ingest or create?
  > Add or Replace Day Summary (.docx, .md, .html, .pdf)
    Add a Transcript (.docx, .md, .txt)
    Add a Board Photo (.webp, .png, .jpg)
    Add Questions & Answers (.md)
    Add External Resource Link
    Create a Course Day
    Create a New Lab Exercise
    Add Ingested Notes to Lab (.docx, .md, .html)
    Add Architectural Doodle to Lab (.webp, .png, .jpg)
    Create a New Course Module
    Remove an Existing Item
```

1. **Create a Module first** (if you don't have one yet), e.g. `MLOps Fundamentals` (`mlops-fundamentals`).
2. **Create a Day** (e.g. Day 1, Day 2).
3. **Add items to the day**: pick a summary file, transcript, or whiteboard photo.
4. **The One-File-at-a-Time Rule**: The file picker only accepts ONE file at a time (no archives, no directories). The tool automatically compresses images to modern `.webp` with 480px thumbnails and generates search entries.

### Step B: Publish When Ready
After ingesting an item, the wizard will ask:
```
? What next?
  > Add another item
    Publish now (git push to Cloudflare Pages)
    Done for now (publish later)
```

- **Add another item**: Ingest your next transcript, summary, or doodle.
- **Publish now**: Commits only `public/content/` with an auto-generated commit message (e.g., `content: add Day 1 summary, 1 transcript (2 items)`) and pushes to GitHub. Cloudflare Pages automatically rebuilds and goes live in ~1 minute!
- **Done for now**: Leaves your content staged locally. You can batch upload more items later and publish whenever you are ready:
  ```bash
  python ingest.py publish
  ```

> [!TIP]
> **Free Tier Tip**: Cloudflare Pages provides **500 free builds per month**. Batch your uploads into a single publish session when adding multiple documents to conserve your monthly build quota.

---

## 4. Useful CLI Commands

| Command | Purpose |
|---|---|
| `python ingest.py` | Launches the interactive wizard (default target: `site`). |
| `python ingest.py publish` | Commits uncommitted content in `public/content/` and pushes to GitHub. |
| `python ingest.py stats` | Shows total file count, content size, largest files, and Cloudflare Pages limits. |
| `python ingest.py list` | Displays the content tree and shows pending uncommitted publish count. |
| `python ingest.py verify` | Audits all manifests and verifies file sizes and schema contracts. |
| `python ingest.py rebuild-index` | Re-derives all manifest counters, visuals indices, and search indices. |
| `python ingest.py undo` | Restores prior state from backup and deletes newly uploaded files. |
| `python ingest.py questions-template` | Generates a template `questions_template.md` file for class quizzes. |
| `python ingest.py remove` | Interactively removes an item with typed confirmation. |

---

## 5. Storage Limits & Health Check

Run:
```bash
python ingest.py stats
```
This prints your Cloudflare Pages free tier limits:
- **Maximum files**: 20,000 files (warns at >70% or 14,000 files).
- **Maximum file size**: 25 MiB per file (the ingest tool rejects any file >25 MiB and warns at >10 MiB).
- **Storage size**: Shows total MB and top 5 largest files.

---

## 6. Upgrading to Cloudflare R2 (Optional)

If your course grows beyond 15,000 files or if you need to upload very large media files (>25 MiB), you can optionally switch to Cloudflare R2 object storage:

1. Create a Cloudflare R2 bucket in your Cloudflare dashboard (requires a payment card on file for Cloudflare, though R2 includes 10 GB free storage every month).
2. Create R2 API tokens with read & write permissions.
3. In your `.env` file, configure:
   ```env
   INGEST_TARGET=r2
   R2_ACCOUNT_ID=your_cloudflare_account_id
   R2_ACCESS_KEY_ID=your_r2_access_key_id
   R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
   R2_BUCKET=your_bucket_name
   ```
4. In your Cloudflare Pages dashboard (or local `.env`), set:
   ```env
   VITE_CONTENT_BASE_URL=https://pub-yourbucketid.r2.dev
   ```
5. Test the connection:
   ```bash
   python ingest.py check-connection --target r2
   ```
6. Run the ingest tool targeting R2:
   ```bash
   python ingest.py --target r2
   ```
