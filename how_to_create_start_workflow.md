# How to Create a `/start` Workflow for a Multi-Service Project

This guide explains how to set up a `/start` slash command workflow that Antigravity can run automatically to boot all services in a project — with zero permission prompts.

---

## Overview

Antigravity supports **workflow files** — markdown documents that define step-by-step instructions with runnable bash commands. By placing a workflow in your project's `.agents/workflows/` folder and annotating it with `// turbo-all`, every step runs automatically without requiring manual approval.

---

## Step 1: Create the Workflow Directory

Inside your project root, create the agents workflow folder:

```bash
mkdir -p .agents/workflows
```

---

## Step 2: Create the Workflow File

Create a file called `start.md` inside `.agents/workflows/`:

```
.agents/
  workflows/
    start.md   ← your workflow lives here
```

---

## Step 3: Write the Workflow

Use the following template, adapting it to your project's apps, ports, and paths:

```markdown
---
description: Start all [Project Name] services ([App1] on [PORT1], [App2] on [PORT2], ...)
---

# Start [Project Name] Services

// turbo-all

1. Kill any processes on your target ports using `fuser`:

\`\`\`bash
for port in PORT1 PORT2 PORT3; do fuser -k $port/tcp > /dev/null 2>&1; done; sleep 2; echo "Ports cleared"
\`\`\`

2. Double-check ports are free — force-kill anything still hanging:

\`\`\`bash
for port in PORT1 PORT2 PORT3; do fuser $port/tcp > /dev/null 2>&1 && fuser -k -9 $port/tcp > /dev/null 2>&1; done; sleep 1; echo "Ports confirmed free"
\`\`\`

3. Start [App1] (PORT1):

\`\`\`bash
cd ~/path/to/project/apps/app1 && npm run dev &
\`\`\`

4. Start [App2] (PORT2):

\`\`\`bash
cd ~/path/to/project/apps/app2 && npm run dev &
\`\`\`

5. Start [App3] (PORT3):

\`\`\`bash
cd ~/path/to/project/apps/app3 && npm run dev &
\`\`\`

6. Wait for services to come up and verify all ports are listening:

\`\`\`bash
sleep 5 && for port in PORT1 PORT2 PORT3; do echo -n "Port $port: "; fuser $port/tcp > /dev/null 2>&1 && echo "✅ running" || echo "❌ not running"; done
\`\`\`
```

---

## Key Concepts Explained

### `// turbo-all`
Place this annotation **anywhere in the workflow body** (typically below the `#` heading). It tells Antigravity to auto-run every `run_command` step **without asking for permission**. Without it, each step requires manual approval.

### YAML Frontmatter
The `---` block at the top provides metadata:
- `description` — shown in the workflow list and used to match slash commands

### Background `&` operator
Each service start command ends with `&` to run it in the background, so the next step can begin immediately without waiting for the server to exit.

### Two-phase port clearing
- **Step 1** (`fuser -k`): graceful SIGTERM to any process on the port
- **Step 2** (`fuser -k -9`): force-kill (SIGKILL) anything still alive after step 1
- This two-phase approach is more reliable than a single kill, especially for stubborn dev servers

### Port verification
The final step uses `sleep 5` to give services time to bind their ports, then confirms each one is actually listening before reporting status.

---

## How to Invoke It

Once the file is in place, just type in the Antigravity chat:

```
/start
```

Antigravity will detect the workflow, read it, and automatically execute every step.

---

## Adapting for Different Tech Stacks

| Stack | Run command |
|---|---|
| Node / npm | `npm run dev &` |
| Node / yarn | `yarn dev &` |
| Python / FastAPI | `uvicorn main:app --reload --port PORT &` |
| Python / Flask | `flask run --port PORT &` |
| Go | `go run . &` |
| Docker Compose | `docker compose up -d` (no `&` needed, already detached) |
| Vite | `npx vite --port PORT &` |

---

## Example: Real Neo-Lounge `/start` Workflow

This is the actual workflow used in the Neo-Lounge project as a reference:

```
Project: Neo-Lounge
Apps: api (3000), kiosk (3001), tablet (3002)
Root path: ~/devprojects/Neo-Lounge/apps/
```

The file lives at:
```
/home/janderson/devprojects/Neo-Lounge/.agents/workflows/start.md
```

---

> [!TIP]
> You can also create additional workflows like `/stop`, `/restart`, or `/logs` using the same pattern. Name the file after the slash command you want — e.g. `stop.md` → `/stop`.

> [!IMPORTANT]
> Make sure each app's `package.json` has a `"dev"` script defined, and that the port it binds to matches what you reference in the workflow. Mismatched ports are the most common cause of `❌ not running` in the verification step.
