import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const targetFolder = process.argv[2] || ".sample-content";
const outDir = path.resolve(rootDir, targetFolder);

async function createRichDocx(title, sections) {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Component", bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Technology / Role", bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Implementation Notes", bold: true })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph("Model Storage")] }),
          new TableCell({ children: [new Paragraph("Azure Blob / ADLS Gen2")] }),
          new TableCell({ children: [new Paragraph("Versioned dataset storage with private endpoints")] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph("Compute")] }),
          new TableCell({ children: [new Paragraph("AML Compute Clusters")] }),
          new TableCell({ children: [new Paragraph("Distributed GPU/CPU auto-scaling training")] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph("Governance")] }),
          new TableCell({ children: [new Paragraph("Azure ML Model Registry")] }),
          new TableCell({ children: [new Paragraph("Model lineage, sign-offs, and container packaging")] }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: "Executive Summary & Core Objectives",
            heading: HeadingLevel.HEADING_2,
            spacing: { after: 120 },
          }),
          ...sections.map(
            (p) =>
              new Paragraph({
                children: [new TextRun(p)],
                spacing: { after: 140 },
              })
          ),
          new Paragraph({
            text: "Key Architectural Mapping",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 120 },
          }),
          table,
          new Paragraph({
            text: "Key Takeaways for Certification Exam & Production",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 120 },
          }),
          new Paragraph({
            text: "• Always utilize Managed Identity instead of long-lived access keys.",
            bullet: { level: 0 },
          }),
          new Paragraph({
            text: "• Define pipeline components in declarative YAML for GitOps workflows.",
            bullet: { level: 0 },
          }),
          new Paragraph({
            text: "• Configure auto-scale to zero instances on dev compute clusters to reduce idle billing.",
            bullet: { level: 0 },
          }),
        ],
      },
    ],
  });
  return await Packer.toBuffer(doc);
}

function writeJson(relPath, data) {
  const absPath = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), "utf-8");
}

function writeRaw(relPath, content) {
  const absPath = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf-8");
}

async function writeDocx(relPath, title, paragraphs) {
  const absPath = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const buffer = await createRichDocx(title, paragraphs);
  fs.writeFileSync(absPath, buffer);
  return {
    path: relPath.replace(/\\/g, "/"),
    format: "docx",
    sizeBytes: buffer.length,
    hash: "mock" + Math.random().toString(36).substring(2, 8),
    updatedAt: new Date().toISOString(),
  };
}

function writeSvgPlaceholder(relPath, title, width = 800, height = 450, isThumb = false) {
  const absPath = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g_${width}_${height}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#dbe1ff;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#eaedff;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#g_${width}_${height})" rx="${isThumb ? 8 : 16}"/>
    <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="#004ac6" stroke-width="2" stroke-dasharray="6 4" opacity="0.4" rx="${isThumb ? 6 : 12}"/>
    <text x="50%" y="46%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${isThumb ? 16 : 24}" font-weight="700" fill="#004ac6">${title}</text>
    <text x="50%" y="56%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${isThumb ? 11 : 14}" fill="#434655">Class Board Work Snapshot (${width}×${height})</text>
  </svg>`;
  fs.writeFileSync(absPath, svg, "utf-8");
  return {
    path: relPath.replace(/\\/g, "/"),
    format: "svg",
    sizeBytes: Buffer.byteLength(svg),
    hash: "svg" + Math.random().toString(36).substring(2, 8),
    updatedAt: new Date().toISOString(),
  };
}

function writeSvgDoodle(relPath, title, width = 800, height = 500, isThumb = false) {
  const absPath = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <pattern id="grid_${width}_${height}" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#dbe1ff" stroke-width="0.8" opacity="0.7"/>
      </pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="#faf8ff" rx="${isThumb ? 8 : 16}"/>
    <rect width="${width}" height="${height}" fill="url(#grid_${width}_${height})"/>
    <rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="#004ac6" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.5" rx="${isThumb ? 6 : 12}"/>
    <text x="50%" y="40%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${isThumb ? 15 : 22}" font-weight="700" fill="#004ac6">${title}</text>
    <text x="50%" y="52%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${isThumb ? 10 : 13}" fill="#434655">Architecture Sketch &amp; Visual Notes (${width}×${height})</text>
    <rect x="${width * 0.15}" y="${height * 0.62}" width="${width * 0.7}" height="${height * 0.22}" rx="8" fill="#eaedff" stroke="#2563eb" stroke-width="1.2" opacity="0.9"/>
    <text x="50%" y="${height * 0.75}" text-anchor="middle" font-family="monospace" font-size="${isThumb ? 9 : 12}" font-weight="600" fill="#004ac6">Client &bull; Managed Identity &bull; Compute Target &bull; Storage</text>
  </svg>`;
  fs.writeFileSync(absPath, svg, "utf-8");
  return {
    path: relPath.replace(/\\/g, "/"),
    format: "svg",
    sizeBytes: Buffer.byteLength(svg),
    hash: "doodle" + Math.random().toString(36).substring(2, 8),
    updatedAt: new Date().toISOString(),
  };
}

function writeMinimalPdf(relPath) {
  const absPath = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const pdfContent = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <<>> >> endobj
4 0 obj <</Length 44>> stream
BT /F1 12 Tf 100 700 Td (Azure MLOps Day 1 Reference Architecture) ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000216 00000 n 
trailer <</Size 5 /Root 1 0 R>>
startxref
308
%%EOF`;
  fs.writeFileSync(absPath, pdfContent, "utf-8");
  return {
    path: relPath.replace(/\\/g, "/"),
    format: "pdf",
    sizeBytes: Buffer.byteLength(pdfContent),
    hash: "pdf" + Math.random().toString(36).substring(2, 8),
    updatedAt: new Date().toISOString(),
  };
}

function writeSampleIpynb(relPath) {
  const nb = {
    cells: [
      {
        cell_type: "markdown",
        source: [
          "# Hands-on: Azure ML v2 SDK Pipeline Demo\n",
          "This notebook demonstrates how to connect to the Azure ML Workspace and submit a component pipeline job.",
        ],
      },
      {
        cell_type: "code",
        execution_count: 1,
        source: [
          "from azure.ai.ml import MLClient\n",
          "from azure.identity import DefaultAzureCredential\n",
          "\n",
          "# Authenticate via Azure AD / Managed Identity\n",
          "credential = DefaultAzureCredential()\n",
          "ml_client = MLClient(credential, subscription_id='sub-123', resource_group_name='rg-ai13', workspace_name='ai13-ws')\n",
          "print('Connected to Azure ML Workspace:', ml_client.workspace_name)",
        ],
        outputs: [
          {
            output_type: "stream",
            text: ["Connected to Azure ML Workspace: ai13-ws\n"],
          },
        ],
      },
    ],
  };
  writeJson(relPath, nb);
  return {
    path: relPath.replace(/\\/g, "/"),
    format: "ipynb",
    sizeBytes: 1520,
    hash: "nb" + Math.random().toString(36).substring(2, 8),
    updatedAt: new Date().toISOString(),
  };
}

async function generate() {
  console.log("Generating rich mock content in:", outDir);

  const m1Slug = "azure-mlops-ai-300";
  const m2Slug = "generative-ai-foundations";

  /* ══════════════════════════════════════════════════════════════════
     MODULE 1: AZURE MLOPS (AI-300)
     ══════════════════════════════════════════════════════════════════ */

  // 1. Day 1 Summary (DOCX)
  const m1SummaryDoc = await writeDocx(
    `modules/${m1Slug}/days/day-01/summary.docx`,
    "Day 1 Summary: Enterprise Azure ML Architecture & Production MLOps",
    [
      "Today we established the core foundation of enterprise Azure Machine Learning workspaces, network isolation, and scalable compute targets.",
      "We demonstrated connecting private Azure Blob storage to Azure ML datastores using Managed Identity, eliminating hardcoded service principal secrets.",
      "Students submitted their first asynchronous training pipeline jobs using the Azure ML v2 Python SDK and analyzed real-time execution graphs.",
    ]
  );

  // 2. Transcripts (2 docx + 1 md)
  const m1T1 = await writeDocx(
    `modules/${m1Slug}/days/day-01/transcripts/transcript-1.docx`,
    "Morning Session (09:00 - 11:00): Workspace Governance & Storage Topography",
    [
      "Instructor (09:00): Good morning everyone. In this morning's session, we are configuring the security perimeter of our Azure ML workspace.",
      "We will walk through Private Endpoints, Customer Managed Keys (CMK), and Azure Role-Based Access Control (RBAC).",
      "Notice how Azure ML Workspace delegates storage management directly to Azure Data Lake Storage (ADLS) Gen2.",
    ]
  );

  const m1T2 = await writeDocx(
    `modules/${m1Slug}/days/day-01/transcripts/transcript-2.docx`,
    "Mid-day Session (11:30 - 13:00): Dynamic Compute Targets & Auto-scaling",
    [
      "Instructor (11:30): Let's transition to compute clusters. When configuring your node pool, setting minimum instances to 0 ensures you never incur costs when jobs are not active.",
      "We are attaching our managed virtual network so all inter-node communication remains strictly within private IP boundaries.",
    ]
  );

  const m1T3MdContent = `# Afternoon Session: Python SDK v2 & Declarative Pipelines

**Instructor:** Utsav  
**Module:** Azure MLOps (AI-300) — Day 1 Afternoon  
**Timestamp:** 14:00 - 16:30 IST

---

## 1. Declarative Pipeline Construction

In Azure ML v2, we define pipelines using the \`@dsl.pipeline\` decorator. Here is the canonical pattern:

\`\`\`python
from azure.ai.ml import dsl

@dsl.pipeline(description="Customer Churn Training Pipeline")
def churn_training_pipeline(raw_data):
    prep_step = prep_component(input_data=raw_data)
    train_step = train_component(clean_data=prep_step.outputs.output_data)
    return {"trained_model": train_step.outputs.model}
\`\`\`

## 2. Key Observations
1. **Managed Identity** avoids storing certificates or API tokens in pipeline scripts.
2. **Auto-scaling** cluster nodes scale down to zero after 120 seconds of inactivity.
`;
  writeRaw(`modules/${m1Slug}/days/day-01/transcripts/transcript-3.md`, m1T3MdContent);
  const m1T3 = {
    path: `modules/${m1Slug}/days/day-01/transcripts/transcript-3.md`,
    format: "md",
    sizeBytes: Buffer.byteLength(m1T3MdContent),
    hash: "mdt3hash",
    updatedAt: new Date().toISOString(),
  };

  // 3. Sample PDF & IPYNB for Day 1
  writeMinimalPdf(`modules/${m1Slug}/days/day-01/architecture-reference.pdf`);
  writeSampleIpynb(`modules/${m1Slug}/days/day-01/pipeline-starter.ipynb`);

  // 4. 6 Board Photos for Day 1
  const m1Boards = [
    {
      id: "b-1",
      caption: "Enterprise Workspace & Storage Topography",
      width: 800,
      height: 450,
      image: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/board-1.svg`, "Board 1: Workspace Topography", 800, 450),
      thumb: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/thumbs/board-1.svg`, "Board 1", 400, 225, true),
    },
    {
      id: "b-2",
      caption: "Compute Cluster Node Lifecycle (Idle -> Allocation -> Job Execution)",
      width: 900,
      height: 600,
      image: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/board-2.svg`, "Board 2: Node Lifecycle", 900, 600),
      thumb: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/thumbs/board-2.svg`, "Board 2", 450, 300, true),
    },
    {
      id: "b-3",
      caption: "Data Store vs Data Asset Versioning Tree",
      width: 700,
      height: 700,
      image: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/board-3.svg`, "Board 3: Data Versioning", 700, 700),
      thumb: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/thumbs/board-3.svg`, "Board 3", 350, 350, true),
    },
    {
      id: "b-4",
      caption: "End-to-End Pipeline DAG Graph Structure",
      width: 1000,
      height: 500,
      image: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/board-4.svg`, "Board 4: Pipeline DAG", 1000, 500),
      thumb: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/thumbs/board-4.svg`, "Board 4", 500, 250, true),
    },
    {
      id: "b-5",
      caption: "Managed Identity Authentication Flow to Azure Blob Storage",
      width: 800,
      height: 600,
      image: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/board-5.svg`, "Board 5: Auth Flow", 800, 600),
      thumb: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/thumbs/board-5.svg`, "Board 5", 400, 300, true),
    },
    {
      id: "b-6",
      caption: "CI/CD Deployment Gateways to Online Inference Endpoints",
      width: 850,
      height: 450,
      image: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/board-6.svg`, "Board 6: Deployment Gateways", 850, 450),
      thumb: writeSvgPlaceholder(`modules/${m1Slug}/days/day-01/boards/thumbs/board-6.svg`, "Board 6", 425, 225, true),
    },
  ];

  // 5. 12 Questions for Day 1
  const m1Questions = [
    {
      id: "q-1",
      question: "What is an Azure Machine Learning Workspace?",
      answer: "The top-level resource for Azure ML, providing a centralized place to work with all created artifacts.",
      explanation: "The workspace holds your experiments, jobs, datasets, models, environments, and endpoints.",
      tags: ["Fundamentals"],
    },
    {
      id: "q-2",
      question: "Why prefer Managed Identity over storage access keys?",
      answer: "Managed Identity eliminates hardcoded credentials and automates credential rotation via Azure Active Directory.",
      explanation: "With Managed Identity, the Azure infrastructure manages token generation and authorization automatically.",
      tags: ["Security", "Identity"],
    },
    {
      id: "q-3",
      question: "What is the difference between Compute Instances and Compute Clusters?",
      answer: "Compute Instances are single-node development VMs; Compute Clusters are multi-node pools for automated batch jobs.",
      explanation: "Compute Clusters scale to zero nodes when idle, saving costs during training pipelines.",
      tags: ["Compute"],
    },
    {
      id: "q-4",
      question: "How does the Azure ML v2 SDK differ from v1?",
      answer: "v2 is YAML-driven and standardized on Azure CLI and ARM, providing consistency for MLOps.",
      explanation: "In v2, components, datasets, and pipeline jobs can be defined in clean YAML files.",
      tags: ["SDK", "Best Practices"],
    },
    {
      id: "q-5",
      question: "What is an MLflow Tracking URI in Azure ML?",
      answer: "It is an endpoint that redirects standard MLflow logging calls directly into the Azure ML workspace.",
      explanation: "Pointing MLflow to Azure ML allows charts, metrics, and parameters to appear natively in Azure ML Studio.",
      tags: ["MLflow", "Tracking"],
    },
    {
      id: "q-6",
      question: "What is a 'Data Asset' in Azure ML?",
      answer: "A versioned pointer to data stored in a datastore, accompanied by metadata and lineage tracking.",
      explanation: "Rather than hardcoding storage paths, you reference `azureml:customer-churn-data:1`.",
      tags: ["Data"],
    },
    {
      id: "q-7",
      question: "How does auto-scaling to zero nodes save cloud budget?",
      answer: "When no jobs are queued, VM instances are completely de-allocated, incurring zero compute cost.",
      explanation: "You only pay for compute seconds during actual script execution.",
      tags: ["Cost", "Compute"],
    },
    {
      id: "q-8",
      question: "What is a Pipeline Component in Azure ML?",
      answer: "A modular, reusable unit of computation specifying inputs, outputs, an environment, and execution code.",
      explanation: "Think of a component like a Lego brick: data prep, training, and evaluation bricks assembled together.",
      tags: ["Pipelines"],
    },
    {
      id: "q-9",
      question: "How does model artifact registration benefit production deployments?",
      answer: "It creates an immutable snapshot of model weights, schema, and dependencies ready for containerization.",
      explanation: "Deployments target an exact version with full traceability back to the dataset and training run.",
      tags: ["Deployment", "Governance"],
    },
    {
      id: "q-10",
      question: "What role does Application Insights play in model endpoints?",
      answer: "It collects live request latencies, telemetry, exception logs, and prediction response payloads.",
      explanation: "It alerts you if response times spike or if the model starts throwing 500 errors on unexpected inputs.",
      tags: ["Monitoring"],
    },
    {
      id: "q-11",
      question: "What is the purpose of Data Drift monitoring?",
      answer: "It detects statistical shifts in input features between training time and live inference time.",
      explanation: "If customer distributions change over time, data drift monitors alert you when it's time to retrain.",
      tags: ["Monitoring", "Governance"],
    },
    {
      id: "q-12",
      question: "What is the difference between Blue/Green deployment and Canary deployment?",
      answer: "Blue/Green swaps 100% of traffic between environments; Canary gradually routes a small percentage (e.g. 10%) to test stability.",
      explanation: "Canary deployments allow live testing before committing full traffic to a new model version.",
      tags: ["Deployment"],
    },
  ];

  // Write Day 1 Detail
  writeJson(`modules/${m1Slug}/days/day-01/day.json`, {
    number: 1,
    title: "Azure ML Workspace, Identity & Compute",
    subtitle: "Setting up a secure enterprise MLOps foundation",
    description: "In-depth setup of Azure ML workspaces, RBAC, Managed Identities, and auto-scaling training compute clusters.",
    recap: "Today in class, we walked through the architectural anatomy of Azure Machine Learning. We explained how an enterprise workspace acts as a central governance boundary. We then created a Compute Cluster configured with Managed Identity, allowing our training jobs to read data from private Blob storage without requiring hardcoded passwords.",
    summary: m1SummaryDoc,
    transcripts: [
      { id: "t-1", order: 1, title: "Morning Session: Workspace & Storage", file: m1T1 },
      { id: "t-2", order: 2, title: "Mid-day Session: Compute & Auto-scaling", file: m1T2 },
      { id: "t-3", order: 3, title: "Afternoon Session: Python SDK & Pipelines", file: m1T3 },
    ],
    links: [
      { label: "Azure ML v2 Documentation", url: "https://learn.microsoft.com/azure/machine-learning", description: "Official Microsoft reference for Python SDK v2" },
      { label: "Enterprise Security Architecture Guide", url: "https://learn.microsoft.com/azure/machine-learning/concept-enterprise-security", description: "VNet injection, private endpoints, and RBAC" },
      { label: "Class Code Repository", url: "https://github.com/example/azure-mlops-labs", description: "Starter code and sample pipelines" },
    ],
    boards: m1Boards,
    questions: m1Questions,
    updatedAt: new Date().toISOString(),
  });

  // Day 2 (Half-filled: summary only)
  const m1Day2Summary = await writeDocx(
    `modules/${m1Slug}/days/day-02/summary.docx`,
    "Day 2 Summary: Hyperparameter Tuning with Sweep Jobs",
    [
      "Today focused on Hyperdrive and Bayesian parameter sampling across distributed compute clusters.",
      "The transcripts and board notes are currently being processed by the ingest team.",
    ]
  );
  writeJson(`modules/${m1Slug}/days/day-02/day.json`, {
    number: 2,
    title: "Hyperparameter Tuning & Sweep Jobs",
    subtitle: "Bayesian optimization and early-stopping policies",
    description: "Configuring automated sweep jobs to find optimal model hyperparameters.",
    summary: m1Day2Summary,
    transcripts: [],
    links: [],
    boards: [],
    questions: [],
    updatedAt: new Date().toISOString(),
  });

  // Day 3 (Empty placeholder)
  writeJson(`modules/${m1Slug}/days/day-03/day.json`, {
    number: 3,
    title: "Model Registry & Managed Online Endpoints",
    subtitle: "Blue/green deployments and traffic splitting",
    description: "Packaging trained models into containerized real-time inference endpoints.",
    transcripts: [],
    links: [],
    boards: [],
    questions: [],
    updatedAt: new Date().toISOString(),
  });

  // 6. 5 Labs for Module 1 across 3 categories
  // Lab 01: Hands-on (Notes docx + Doodle + Links)
  const m1Lab01NotesDoc = await writeDocx(
    `modules/${m1Slug}/labs/lab-01/notes.docx`,
    "Lab 01 Study Notes: Workspace & Compute Provisioning",
    [
      "Follow these steps to create your Azure ML workspace using the Azure CLI v2 extension.",
      "1. Ensure you have the `ml` extension installed: `az extension add -n ml`.",
      "2. Create the resource group: `az group create -n rg-ai13-lab -l eastus`.",
      "3. Create the workspace: `az ml workspace create -n mlw-ai13 -g rg-ai13-lab`.",
      "Always set max-instances=4 and min-instances=0 on the training compute cluster.",
    ]
  );
  const m1Lab01Doodle = writeSvgDoodle(`modules/${m1Slug}/labs/lab-01/doodle.svg`, "Lab 01: Workspace Topography", 800, 500);
  const m1Lab01DoodleThumb = writeSvgDoodle(`modules/${m1Slug}/labs/lab-01/thumbs/doodle.svg`, "Lab 01 Sketch", 400, 250, true);

  writeJson(`modules/${m1Slug}/labs/lab-01/lab.json`, {
    id: "lab-01",
    number: 1,
    category: "hands-on",
    title: "Workspace & Compute Cluster Provisioning",
    sourceUrl: "https://learn.microsoft.com/azure/machine-learning/quickstart-create-resources",
    links: [
      { label: "Azure Portal", url: "https://portal.azure.com", description: "Direct link to resource group" },
      { label: "CLI Reference", url: "https://learn.microsoft.com/cli/azure/ml", description: "Azure CLI ml extension commands" },
    ],
    notes: m1Lab01NotesDoc,
    doodle: m1Lab01Doodle,
    thumb: m1Lab01DoodleThumb,
    updatedAt: new Date().toISOString(),
  });

  // Lab 02: Hands-on (Notes md + Doodle + Links)
  const m1Lab02Md = `# Lab 02: Two-Step Training Pipeline with MLflow

In this lab, you will build a reusable data preprocessing and model training pipeline.

## Objectives
- Package data transformation script into an Azure ML component.
- Register input data asset from Azure Blob Storage.
- Submit the pipeline job and monitor execution in Azure ML Studio.

\`\`\`yaml
$schema: https://azuremlschemas.azureedge.net/latest/pipelineJob.schema.json
type: pipeline
display_name: churn_training_pipeline
jobs:
  prep:
    component: ./components/prep.yaml
    inputs:
      raw_data: \${{parent.inputs.input_data}}
  train:
    component: ./components/train.yaml
    inputs:
      clean_data: \${{parent.jobs.prep.outputs.clean_data}}
\`\`\`
`;
  writeRaw(`modules/${m1Slug}/labs/lab-02/notes.md`, m1Lab02Md);
  const m1Lab02Notes = {
    path: `modules/${m1Slug}/labs/lab-02/notes.md`,
    format: "md",
    sizeBytes: Buffer.byteLength(m1Lab02Md),
    hash: "lab02notes",
    updatedAt: new Date().toISOString(),
  };
  const m1Lab02Doodle = writeSvgDoodle(`modules/${m1Slug}/labs/lab-02/doodle.svg`, "Lab 02: Pipeline DAG Structure", 800, 500);
  const m1Lab02DoodleThumb = writeSvgDoodle(`modules/${m1Slug}/labs/lab-02/thumbs/doodle.svg`, "Lab 02 Sketch", 400, 250, true);

  writeJson(`modules/${m1Slug}/labs/lab-02/lab.json`, {
    id: "lab-02",
    number: 2,
    category: "hands-on",
    title: "Two-Step Training Pipeline with MLflow",
    sourceUrl: "https://github.com/Azure/azureml-examples",
    links: [
      { label: "MLflow Documentation", url: "https://mlflow.org/docs/latest/index.html", description: "Official open source MLflow reference" },
    ],
    notes: m1Lab02Notes,
    doodle: m1Lab02Doodle,
    thumb: m1Lab02DoodleThumb,
    updatedAt: new Date().toISOString(),
  });

  // Lab 03: Hands-on (Notes docx, NO doodle)
  const m1Lab03NotesDoc = await writeDocx(
    `modules/${m1Slug}/labs/lab-03/notes.docx`,
    "Lab 03: Data Asset Versioning & Automated Ingestion",
    [
      "Learn to configure ML datastores connected to ADLS Gen2.",
      "Understand the difference between UriFolder and UriFile data assets.",
      "Implement automated schema validation using Great Expectations before running training jobs.",
    ]
  );
  writeJson(`modules/${m1Slug}/labs/lab-03/lab.json`, {
    id: "lab-03",
    number: 3,
    category: "hands-on",
    title: "Data Asset Versioning & Automated Ingestion",
    sourceUrl: "https://learn.microsoft.com/azure/machine-learning/how-to-create-data-assets",
    notes: m1Lab03NotesDoc,
    updatedAt: new Date().toISOString(),
  });

  // Lab 04: Assessment (NO notes, Doodle only)
  const m1Lab04Doodle = writeSvgDoodle(`modules/${m1Slug}/labs/lab-04/doodle.svg`, "Lab 04: Bayesian Hyperparameter Sweep", 800, 500);
  const m1Lab04DoodleThumb = writeSvgDoodle(`modules/${m1Slug}/labs/lab-04/thumbs/doodle.svg`, "Lab 04 Sketch", 400, 250, true);

  writeJson(`modules/${m1Slug}/labs/lab-04/lab.json`, {
    id: "lab-04",
    number: 4,
    category: "assessment",
    title: "Distributed Hyperparameter Sweep & Early Stopping",
    sourceUrl: "https://learn.microsoft.com/azure/machine-learning/how-to-tune-hyperparameters",
    doodle: m1Lab04Doodle,
    thumb: m1Lab04DoodleThumb,
    updatedAt: new Date().toISOString(),
  });

  // Lab 05: Challenge (Notes md + Doodle + Links)
  const m1Lab05Md = `# Lab 05 Capstone: Blue/Green Deployment with Managed Endpoints

Deploy a high-availability online inference endpoint with automated canary traffic routing.

## Requirements
1. Create a Managed Online Endpoint with System-Assigned Managed Identity.
2. Deploy the baseline model as deployment \`blue\` with 90% traffic.
3. Deploy the candidate model as deployment \`green\` with 10% traffic.
4. Verify low latency (< 50ms) using Apache Benchmark.
`;
  writeRaw(`modules/${m1Slug}/labs/lab-05/notes.md`, m1Lab05Md);
  const m1Lab05Notes = {
    path: `modules/${m1Slug}/labs/lab-05/notes.md`,
    format: "md",
    sizeBytes: Buffer.byteLength(m1Lab05Md),
    hash: "lab05notes",
    updatedAt: new Date().toISOString(),
  };
  const m1Lab05Doodle = writeSvgDoodle(`modules/${m1Slug}/labs/lab-05/doodle.svg`, "Lab 05: Blue/Green Traffic Router", 800, 500);
  const m1Lab05DoodleThumb = writeSvgDoodle(`modules/${m1Slug}/labs/lab-05/thumbs/doodle.svg`, "Lab 05 Sketch", 400, 250, true);

  writeJson(`modules/${m1Slug}/labs/lab-05/lab.json`, {
    id: "lab-05",
    number: 5,
    category: "challenge",
    title: "Production Blue/Green Deployment with Managed Online Endpoints",
    sourceUrl: "https://learn.microsoft.com/azure/machine-learning/how-to-deploy-managed-online-endpoints",
    notes: m1Lab05Notes,
    doodle: m1Lab05Doodle,
    thumb: m1Lab05DoodleThumb,
    updatedAt: new Date().toISOString(),
  });

  // Update Module 1 Manifest
  writeJson(`modules/${m1Slug}/manifest.json`, {
    version: "1",
    updatedAt: new Date().toISOString(),
    slug: m1Slug,
    title: "Azure MLOps (AI-300)",
    subtitle: "Enterprise Model Engineering & Production Pipelines",
    description: "Comprehensive end-to-end curriculum for architecting, deploying, and monitoring reliable machine learning solutions on Microsoft Azure.",
    courseCode: "AI-300",
    days: [
      {
        number: 1,
        title: "Azure ML Workspace, Identity & Compute",
        subtitle: "Setting up a secure enterprise MLOps foundation",
        hasSummary: true,
        transcriptCount: 3,
        linkCount: 3,
        boardCount: 6,
        questionCount: 12,
      },
      {
        number: 2,
        title: "Hyperparameter Tuning & Sweep Jobs",
        subtitle: "Bayesian optimization and early-stopping policies",
        hasSummary: true,
        transcriptCount: 0,
        linkCount: 0,
        boardCount: 0,
        questionCount: 0,
      },
      {
        number: 3,
        title: "Model Registry & Managed Online Endpoints",
        subtitle: "Blue/green deployments and traffic splitting",
        hasSummary: false,
        transcriptCount: 0,
        linkCount: 0,
        boardCount: 0,
        questionCount: 0,
      },
    ],
    labs: [
      { id: "lab-01", number: 1, category: "hands-on", title: "Workspace & Compute Cluster Provisioning", hasNotes: true, hasDoodle: true },
      { id: "lab-02", number: 2, category: "hands-on", title: "Two-Step Training Pipeline with MLflow", hasNotes: true, hasDoodle: true },
      { id: "lab-03", number: 3, category: "hands-on", title: "Data Asset Versioning & Automated Ingestion", hasNotes: true, hasDoodle: false },
      { id: "lab-04", number: 4, category: "assessment", title: "Distributed Hyperparameter Sweep & Early Stopping", hasNotes: false, hasDoodle: true },
      { id: "lab-05", number: 5, category: "challenge", title: "Production Blue/Green Deployment with Managed Online Endpoints", hasNotes: true, hasDoodle: true },
    ],
    labCategories: [
      { slug: "hands-on", label: "Hands-On Labs" },
      { slug: "assessment", label: "Skill Assessments" },
      { slug: "challenge", label: "Capstone Challenges" },
    ],
  });

  // Module 1 Visuals Index (/modules/azure-mlops-ai-300/visuals.json)
  writeJson(`modules/${m1Slug}/visuals.json`, {
    version: "1",
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: "m1-b1",
        type: "board",
        dayNumber: 1,
        caption: "Enterprise Workspace & Storage Topography",
        image: m1Boards[0].image,
        thumb: m1Boards[0].thumb,
        width: 800,
        height: 450,
        addedAt: "2026-11-01T09:30:00Z",
      },
      {
        id: "m1-b2",
        type: "board",
        dayNumber: 1,
        caption: "Compute Cluster Node Lifecycle",
        image: m1Boards[1].image,
        thumb: m1Boards[1].thumb,
        width: 900,
        height: 600,
        addedAt: "2026-11-01T11:00:00Z",
      },
      {
        id: "m1-doodle-1",
        type: "doodle",
        labId: "lab-01",
        caption: "Lab 01 Architecture Sketch: Workspace Topography",
        image: m1Lab01Doodle,
        thumb: m1Lab01DoodleThumb,
        width: 800,
        height: 500,
        addedAt: "2026-11-01T14:00:00Z",
      },
      {
        id: "m1-b3",
        type: "board",
        dayNumber: 1,
        caption: "Data Store vs Data Asset Versioning Tree",
        image: m1Boards[2].image,
        thumb: m1Boards[2].thumb,
        width: 700,
        height: 700,
        addedAt: "2026-11-01T14:45:00Z",
      },
      {
        id: "m1-doodle-2",
        type: "doodle",
        labId: "lab-02",
        caption: "Lab 02 Architecture Sketch: Pipeline DAG",
        image: m1Lab02Doodle,
        thumb: m1Lab02DoodleThumb,
        width: 800,
        height: 500,
        addedAt: "2026-11-01T15:30:00Z",
      },
      {
        id: "m1-b4",
        type: "board",
        dayNumber: 1,
        caption: "End-to-End Pipeline DAG Graph Structure",
        image: m1Boards[3].image,
        thumb: m1Boards[3].thumb,
        width: 1000,
        height: 500,
        addedAt: "2026-11-01T16:00:00Z",
      },
      {
        id: "m1-doodle-4",
        type: "doodle",
        labId: "lab-04",
        caption: "Lab 04 Architecture Sketch: Bayesian Hyperparameter Sweep",
        image: m1Lab04Doodle,
        thumb: m1Lab04DoodleThumb,
        width: 800,
        height: 500,
        addedAt: "2026-11-02T10:00:00Z",
      },
      {
        id: "m1-b5",
        type: "board",
        dayNumber: 1,
        caption: "Managed Identity Authentication Flow to Azure Blob Storage",
        image: m1Boards[4].image,
        thumb: m1Boards[4].thumb,
        width: 800,
        height: 600,
        addedAt: "2026-11-02T11:30:00Z",
      },
      {
        id: "m1-doodle-5",
        type: "doodle",
        labId: "lab-05",
        caption: "Lab 05 Architecture Sketch: Blue/Green Traffic Router",
        image: m1Lab05Doodle,
        thumb: m1Lab05DoodleThumb,
        width: 800,
        height: 500,
        addedAt: "2026-11-02T14:00:00Z",
      },
      {
        id: "m1-b6",
        type: "board",
        dayNumber: 1,
        caption: "CI/CD Deployment Gateways to Online Inference Endpoints",
        image: m1Boards[5].image,
        thumb: m1Boards[5].thumb,
        width: 850,
        height: 450,
        addedAt: "2026-11-02T16:30:00Z",
      },
    ],
  });

  /* ══════════════════════════════════════════════════════════════════
     MODULE 2: GENERATIVE AI FOUNDATIONS
     ══════════════════════════════════════════════════════════════════ */

  // 1. Day 1 for GenAI
  const m2Day1Summary = await writeDocx(
    `modules/${m2Slug}/days/day-01/summary.docx`,
    "Day 1 Summary: Attention Mechanisms & Transformer Architecture",
    [
      "Today we dissected the mathematical formulation of Scaled Dot-Product Attention.",
      "We demonstrated why self-attention allows quadratic context interaction and how causal masking prevents future token leakage in decoder-only LLMs.",
    ]
  );

  const m2Boards = [
    {
      id: "m2-b1",
      caption: "Scaled Dot-Product Attention: Q, K, V Matrix Multiplication",
      width: 850,
      height: 450,
      image: writeSvgPlaceholder(`modules/${m2Slug}/days/day-01/boards/board-1.svg`, "Board 1: Attention Matrix", 850, 450),
      thumb: writeSvgPlaceholder(`modules/${m2Slug}/days/day-01/boards/thumbs/board-1.svg`, "Board 1", 425, 225, true),
    },
    {
      id: "m2-b2",
      caption: "Decoder-Only Autoregressive Generation & Causal Attention Mask",
      width: 900,
      height: 600,
      image: writeSvgPlaceholder(`modules/${m2Slug}/days/day-01/boards/board-2.svg`, "Board 2: Causal Mask", 900, 600),
      thumb: writeSvgPlaceholder(`modules/${m2Slug}/days/day-01/boards/thumbs/board-2.svg`, "Board 2", 450, 300, true),
    },
    {
      id: "m2-b3",
      caption: "Rotary Positional Embeddings (RoPE) Complex Vector Rotation",
      width: 800,
      height: 500,
      image: writeSvgPlaceholder(`modules/${m2Slug}/days/day-01/boards/board-3.svg`, "Board 3: RoPE Embeddings", 800, 500),
      thumb: writeSvgPlaceholder(`modules/${m2Slug}/days/day-01/boards/thumbs/board-3.svg`, "Board 3", 400, 250, true),
    },
    {
      id: "m2-b4",
      caption: "KV Cache Optimization for Autoregressive Token Inference",
      width: 800,
      height: 450,
      image: writeSvgPlaceholder(`modules/${m2Slug}/days/day-01/boards/board-4.svg`, "Board 4: KV Cache", 800, 450),
      thumb: writeSvgPlaceholder(`modules/${m2Slug}/days/day-01/boards/thumbs/board-4.svg`, "Board 4", 400, 225, true),
    },
  ];

  writeJson(`modules/${m2Slug}/days/day-01/day.json`, {
    number: 1,
    title: "Attention Mechanisms & Transformer Architecture",
    subtitle: "From recurrence to self-attention and decoder-only LLMs",
    description: "Deep dive into query, key, value projections, multi-head attention, and positional encoding.",
    recap: "We traced the evolution of NLP from RNNs to modern Transformer decoders. We derived scaled dot-product attention step by step.",
    summary: m2Day1Summary,
    transcripts: [],
    links: [
      { label: "Attention Is All You Need Paper", url: "https://arxiv.org/abs/1706.03762", description: "The seminal Vaswani et al. paper" },
    ],
    boards: m2Boards,
    questions: [
      {
        id: "m2-q1",
        question: "Why do we divide by sqrt(d_k) in Scaled Dot-Product Attention?",
        answer: "To counteract large dot products pushing the softmax function into regions with extremely small gradients.",
        explanation: "As embedding dimensions increase, the variance of the dot product grows proportionally to d_k.",
        tags: ["Attention", "Math"],
      },
    ],
    updatedAt: new Date().toISOString(),
  });

  // 2. 4 Labs for Module 2 (Single Category: "hands-on")
  const m2Lab01Md = `# Lab 01: Tokenization, Embeddings & Vector Search

Explore Byte-Pair Encoding (BPE) tokenizers and indexing embeddings in FAISS.
`;
  writeRaw(`modules/${m2Slug}/labs/lab-01/notes.md`, m2Lab01Md);
  const m2Lab01Notes = {
    path: `modules/${m2Slug}/labs/lab-01/notes.md`,
    format: "md",
    sizeBytes: Buffer.byteLength(m2Lab01Md),
    hash: "m2lab01notes",
    updatedAt: new Date().toISOString(),
  };
  const m2Lab01Doodle = writeSvgDoodle(`modules/${m2Slug}/labs/lab-01/doodle.svg`, "Lab 01: Vector Embeddings & Cosine Search", 800, 500);
  const m2Lab01DoodleThumb = writeSvgDoodle(`modules/${m2Slug}/labs/lab-01/thumbs/doodle.svg`, "Lab 01 Sketch", 400, 250, true);

  writeJson(`modules/${m2Slug}/labs/lab-01/lab.json`, {
    id: "lab-01",
    number: 1,
    category: "hands-on",
    title: "Tokenization, Embeddings & Vector Search",
    sourceUrl: "https://github.com/example/genai-labs",
    notes: m2Lab01Notes,
    doodle: m2Lab01Doodle,
    thumb: m2Lab01DoodleThumb,
    updatedAt: new Date().toISOString(),
  });

  const m2Lab02NotesDoc = await writeDocx(
    `modules/${m2Slug}/labs/lab-02/notes.docx`,
    "Lab 02: Implementing Multi-Head Attention in PyTorch",
    [
      "Implement the forward pass of multi-head attention from scratch without using torch.nn.MultiheadAttention.",
      "Handle causal attention masking for decoder autoregression.",
    ]
  );
  const m2Lab02Doodle = writeSvgDoodle(`modules/${m2Slug}/labs/lab-02/doodle.svg`, "Lab 02: Multi-Head Projection Geometry", 800, 500);
  const m2Lab02DoodleThumb = writeSvgDoodle(`modules/${m2Slug}/labs/lab-02/thumbs/doodle.svg`, "Lab 02 Sketch", 400, 250, true);

  writeJson(`modules/${m2Slug}/labs/lab-02/lab.json`, {
    id: "lab-02",
    number: 2,
    category: "hands-on",
    title: "Implementing Multi-Head Scaled Dot-Product Attention",
    sourceUrl: "https://pytorch.org/tutorials",
    notes: m2Lab02NotesDoc,
    doodle: m2Lab02Doodle,
    thumb: m2Lab02DoodleThumb,
    updatedAt: new Date().toISOString(),
  });

  const m2Lab03Md = `# Lab 03: Fine-Tuning Llama with QLoRA & HuggingFace PEFT

Quantize base weights to 4-bit NormalFloat (NF4) and train low-rank adapter matrices.
`;
  writeRaw(`modules/${m2Slug}/labs/lab-03/notes.md`, m2Lab03Md);
  const m2Lab03Notes = {
    path: `modules/${m2Slug}/labs/lab-03/notes.md`,
    format: "md",
    sizeBytes: Buffer.byteLength(m2Lab03Md),
    hash: "m2lab03notes",
    updatedAt: new Date().toISOString(),
  };

  writeJson(`modules/${m2Slug}/labs/lab-03/lab.json`, {
    id: "lab-03",
    number: 3,
    category: "hands-on",
    title: "Fine-Tuning Llama with QLoRA & HuggingFace PEFT",
    sourceUrl: "https://huggingface.co/docs/peft",
    notes: m2Lab03Notes,
    updatedAt: new Date().toISOString(),
  });

  const m2Lab04Doodle = writeSvgDoodle(`modules/${m2Slug}/labs/lab-04/doodle.svg`, "Lab 04: Hybrid RAG Graph Pipeline", 800, 500);
  const m2Lab04DoodleThumb = writeSvgDoodle(`modules/${m2Slug}/labs/lab-04/thumbs/doodle.svg`, "Lab 04 Sketch", 400, 250, true);

  writeJson(`modules/${m2Slug}/labs/lab-04/lab.json`, {
    id: "lab-04",
    number: 4,
    category: "hands-on",
    title: "Hybrid RAG Pipeline with Semantic Re-ranking",
    sourceUrl: "https://langchain.com",
    doodle: m2Lab04Doodle,
    thumb: m2Lab04DoodleThumb,
    updatedAt: new Date().toISOString(),
  });

  // Module 2 Manifest (1 category only: "hands-on")
  writeJson(`modules/${m2Slug}/manifest.json`, {
    version: "1",
    updatedAt: new Date().toISOString(),
    slug: m2Slug,
    title: "Generative AI Foundations",
    subtitle: "From Attention Mechanisms to Production RAG Systems",
    description: "Deep-dive into modern LLM architecture, embedding spaces, prompt pipelines, vector databases, and parameter-efficient fine-tuning.",
    courseCode: "GENAI-101",
    days: [
      {
        number: 1,
        title: "Attention Mechanisms & Transformer Architecture",
        subtitle: "From recurrence to self-attention and decoder-only LLMs",
        hasSummary: true,
        transcriptCount: 0,
        linkCount: 1,
        boardCount: 4,
        questionCount: 1,
      },
      {
        number: 2,
        title: "Byte-Pair Encoding, Tokenizers & Vector Spaces",
        subtitle: "How text becomes numbers in high-dimensional manifolds",
        hasSummary: false,
        transcriptCount: 0,
        linkCount: 0,
        boardCount: 0,
        questionCount: 0,
      },
      {
        number: 3,
        title: "Parameter-Efficient Fine-Tuning (LoRA & QLoRA)",
        subtitle: "Low-rank adaptation on commodity single-GPU hardware",
        hasSummary: false,
        transcriptCount: 0,
        linkCount: 0,
        boardCount: 0,
        questionCount: 0,
      },
      {
        number: 4,
        title: "RAG Architectures: Hybrid Retrieval & Re-ranking",
        subtitle: "BM25 keyword search plus dense vector similarity",
        hasSummary: false,
        transcriptCount: 0,
        linkCount: 0,
        boardCount: 0,
        questionCount: 0,
      },
      {
        number: 5,
        title: "LLM Evaluation, Guardrails & Deployment",
        subtitle: "RAG triad metrics, hallucinations, and vLLM serving",
        hasSummary: false,
        transcriptCount: 0,
        linkCount: 0,
        boardCount: 0,
        questionCount: 0,
      },
    ],
    labs: [
      { id: "lab-01", number: 1, category: "hands-on", title: "Tokenization, Embeddings & Vector Search", hasNotes: true, hasDoodle: true },
      { id: "lab-02", number: 2, category: "hands-on", title: "Implementing Multi-Head Scaled Dot-Product Attention", hasNotes: true, hasDoodle: true },
      { id: "lab-03", number: 3, category: "hands-on", title: "Fine-Tuning Llama with QLoRA & HuggingFace PEFT", hasNotes: true, hasDoodle: false },
      { id: "lab-04", number: 4, category: "hands-on", title: "Hybrid RAG Pipeline with Semantic Re-ranking", hasNotes: false, hasDoodle: true },
    ],
    labCategories: [
      { slug: "hands-on", label: "Hands-On Labs" },
    ],
  });

  // Module 2 Visuals Index
  writeJson(`modules/${m2Slug}/visuals.json`, {
    version: "1",
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: "m2-b1",
        type: "board",
        dayNumber: 1,
        caption: "Scaled Dot-Product Attention Matrix",
        image: m2Boards[0].image,
        thumb: m2Boards[0].thumb,
        width: 850,
        height: 450,
        addedAt: "2026-11-03T09:30:00Z",
      },
      {
        id: "m2-doodle-1",
        type: "doodle",
        labId: "lab-01",
        caption: "Lab 01 Architecture Sketch: Vector Embeddings & Search",
        image: m2Lab01Doodle,
        thumb: m2Lab01DoodleThumb,
        width: 800,
        height: 500,
        addedAt: "2026-11-03T11:00:00Z",
      },
      {
        id: "m2-b2",
        type: "board",
        dayNumber: 1,
        caption: "Decoder-Only Autoregressive Causal Attention Mask",
        image: m2Boards[1].image,
        thumb: m2Boards[1].thumb,
        width: 900,
        height: 600,
        addedAt: "2026-11-03T13:30:00Z",
      },
      {
        id: "m2-doodle-2",
        type: "doodle",
        labId: "lab-02",
        caption: "Lab 02 Architecture Sketch: Multi-Head Projection Geometry",
        image: m2Lab02Doodle,
        thumb: m2Lab02DoodleThumb,
        width: 800,
        height: 500,
        addedAt: "2026-11-03T15:00:00Z",
      },
      {
        id: "m2-b3",
        type: "board",
        dayNumber: 1,
        caption: "Rotary Positional Embeddings (RoPE)",
        image: m2Boards[2].image,
        thumb: m2Boards[2].thumb,
        width: 800,
        height: 500,
        addedAt: "2026-11-04T09:30:00Z",
      },
      {
        id: "m2-doodle-4",
        type: "doodle",
        labId: "lab-04",
        caption: "Lab 04 Architecture Sketch: Hybrid RAG Graph Pipeline",
        image: m2Lab04Doodle,
        thumb: m2Lab04DoodleThumb,
        width: 800,
        height: 500,
        addedAt: "2026-11-04T14:30:00Z",
      },
      {
        id: "m2-b4",
        type: "board",
        dayNumber: 1,
        caption: "KV Cache Optimization for Autoregressive Token Inference",
        image: m2Boards[3].image,
        thumb: m2Boards[3].thumb,
        width: 800,
        height: 450,
        addedAt: "2026-11-04T16:00:00Z",
      },
    ],
  });

  /* ══════════════════════════════════════════════════════════════════
     GLOBAL INDEX.JSON & SEARCH-INDEX.JSON
     ══════════════════════════════════════════════════════════════════ */

  // Module Index (/index.json)
  writeJson("index.json", {
    version: "1",
    updatedAt: new Date().toISOString(),
    modules: [
      {
        slug: m1Slug,
        title: "Azure MLOps (AI-300)",
        subtitle: "Enterprise Model Engineering & Production Pipelines",
        description: "Comprehensive end-to-end curriculum for architecting, deploying, and monitoring reliable machine learning solutions on Microsoft Azure.",
        courseCode: "AI-300",
        order: 1,
        coverImage: {
          path: "covers/azure-mlops.svg",
          format: "svg",
          sizeBytes: 857,
          hash: "svgm1cov",
          updatedAt: new Date().toISOString(),
        },
        dayCount: 3,
        labCount: 5,
        boardCount: 6,
        questionCount: 12,
        transcriptCount: 3,
        tags: ["Azure", "MLOps", "Pipelines", "Cloud"],
      },
      {
        slug: m2Slug,
        title: "Generative AI Foundations",
        subtitle: "From Attention Mechanisms to Production RAG Systems",
        description: "Deep-dive into modern LLM architecture, embedding spaces, prompt pipelines, vector databases, and parameter-efficient fine-tuning.",
        courseCode: "GENAI-101",
        order: 2,
        coverImage: {
          path: "covers/genai-foundations.svg",
          format: "svg",
          sizeBytes: 859,
          hash: "svgm2cov",
          updatedAt: new Date().toISOString(),
        },
        dayCount: 5,
        labCount: 4,
        boardCount: 4,
        questionCount: 1,
        transcriptCount: 0,
        tags: ["LLM", "Transformers", "RAG", "PyTorch"],
      },
    ],
  });

  // Search Index (/search-index.json)
  writeJson("search-index.json", [
    {
      type: "module",
      moduleSlug: m1Slug,
      title: "Azure MLOps (AI-300)",
      snippet: "Enterprise Model Engineering & Production Pipelines on Azure.",
      tags: ["Azure", "MLOps", "Pipelines"],
    },
    {
      type: "day",
      moduleSlug: m1Slug,
      dayNumber: 1,
      title: "Azure ML Workspace, Identity & Compute",
      snippet: "Setting up a secure enterprise MLOps foundation with RBAC and Managed Identity.",
      tags: ["Security", "Compute"],
    },
    {
      type: "day",
      moduleSlug: m1Slug,
      dayNumber: 2,
      title: "Hyperparameter Tuning & Sweep Jobs",
      snippet: "Bayesian optimization and early-stopping policies for cloud training.",
      tags: ["Hyperdrive", "Optimization"],
    },
    {
      type: "lab",
      moduleSlug: m1Slug,
      labId: "lab-01",
      title: "Workspace & Compute Cluster Provisioning",
      snippet: "Step-by-step instructions for az ml workspace create and cluster configuration.",
      tags: ["Azure CLI", "Compute"],
    },
    {
      type: "lab",
      moduleSlug: m1Slug,
      labId: "lab-02",
      title: "Two-Step Training Pipeline with MLflow",
      snippet: "YAML-driven components and MLflow logging directly into Azure ML Studio.",
      tags: ["MLflow", "Pipelines"],
    },
    {
      type: "lab",
      moduleSlug: m1Slug,
      labId: "lab-05",
      title: "Production Blue/Green Deployment with Managed Online Endpoints",
      snippet: "Canary routing and blue/green production deployment on Azure ML.",
      tags: ["Deployment", "Canary"],
    },
    {
      type: "question",
      moduleSlug: m1Slug,
      dayNumber: 1,
      title: "Why prefer Managed Identity over storage keys?",
      snippet: "Managed identity eliminates password management and secret rotation by assigning an Azure AD identity directly to compute.",
      tags: ["Security", "Identity"],
    },
    {
      type: "question",
      moduleSlug: m1Slug,
      dayNumber: 1,
      title: "How does Azure ML v2 SDK differ from v1?",
      snippet: "v2 is YAML-driven and standardized on Azure CLI and ARM, providing consistency for MLOps.",
      tags: ["SDK", "YAML"],
    },
    {
      type: "module",
      moduleSlug: m2Slug,
      title: "Generative AI Foundations",
      snippet: "From Attention Mechanisms to Production RAG Systems.",
      tags: ["GenAI", "Transformers", "LLM"],
    },
    {
      type: "lab",
      moduleSlug: m2Slug,
      labId: "lab-01",
      title: "Tokenization, Embeddings & Vector Search",
      snippet: "Byte-Pair Encoding tokenization and vector indexing with FAISS.",
      tags: ["FAISS", "Embeddings"],
    },
    {
      type: "lab",
      moduleSlug: m2Slug,
      labId: "lab-02",
      title: "Implementing Multi-Head Scaled Dot-Product Attention",
      snippet: "PyTorch implementation of multi-head attention and causal masking.",
      tags: ["PyTorch", "Attention"],
    },
  ]);

  console.log("Mock content generation complete! Both modules now have rich manifests, visuals.json, labs, and board photos.");
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
