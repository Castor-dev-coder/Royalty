# Developer Workstation Setup Guide

This guide explains how to set up your local development environment using GitHub, Git, and Visual Studio Code (VS Code).

By the end of this guide, you should have your own fork of the project, a local working copy on your computer, all required dependencies installed, and a development branch ready for coding.

## 1. Prerequisites

Install the following tools before proceeding.

| Tool | Purpose | Download |
|---|---|---|
| Git | Version control and repository management | https://git-scm.com/downloads |
| Visual Studio Code | Code editor | https://code.visualstudio.com/ |
| Node.js | JavaScript runtime, if required by the project | https://nodejs.org/ |
| GitHub account | Hosting your personal fork | https://github.com/ |

**Important:** Check the repository's `README.md`, `package.json`, `.nvmrc`, or other version configuration files for the required Node.js version and package manager. Do not automatically install the latest version if the project specifies another version.

You should also have access to the original GitHub repository.

## 2. Fork the Original Repository

A fork creates your own copy of the original repository under your GitHub account.

1. Open the original project repository on GitHub.
2. Click **Fork** in the upper-right corner.
3. Select your own GitHub account as the destination owner.
4. Keep the repository name unless instructed otherwise.
5. Click **Create fork**.

After GitHub finishes creating the fork, you should have a repository at this address:

`https://github.com/YOUR-USERNAME/REPOSITORY-NAME`

Replace `YOUR-USERNAME` with your GitHub username and `REPOSITORY-NAME` with the actual project name.

**Remember:** Your fork is your own copy. You will push your development branches to your fork and submit pull requests to the original repository.

## 3. Configure Git on Your Computer

Open a terminal. You can use your system terminal or the integrated terminal in VS Code.

Check whether Git is installed:

```bash
git --version
```

Configure your Git identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-github-email@example.com"
```

Use the name and email you want associated with your commits. If you want to keep your personal email private, you can use the GitHub-provided `noreply` email address configured in your account settings.

Verify your configuration:

```bash
git config --global user.name
git config --global user.email
```

These settings identify your commits. They do not log you into GitHub; authentication is handled separately.

## 4. Clone Your Fork to Your Computer

Open the fork you created in Step 2.

1. Click the green **Code** button.
2. Select **HTTPS**.
3. Copy the repository URL.

It should look like this:

`https://github.com/YOUR-USERNAME/REPOSITORY-NAME.git`

In your terminal, navigate to the directory where you want to store your projects. Then run:

```bash
git clone https://github.com/YOUR-USERNAME/REPOSITORY-NAME.git
cd REPOSITORY-NAME
```

Replace the URL and directory name with your actual repository details.

This downloads your fork to your computer and creates a local working copy.

Verify the current repository and branch:

```bash
git status
git branch
```

To see the configured remote repositories:

```bash
git remote -v
```

At this point, `origin` should point to **your fork**, not the original repository.

## 5. Connect the Original Repository as `upstream`

Your fork and the original repository may eventually contain different changes. Adding an `upstream` remote lets you retrieve updates from the original project.

While inside the cloned repository, run:

```bash
git remote add upstream https://github.com/ORIGINAL-OWNER/REPOSITORY-NAME.git
```

Replace `ORIGINAL-OWNER` with the original repository owner's GitHub username or organization. Use the original repository URL, not your fork URL.

Verify both remotes:

```bash
git remote -v
```

You should see something similar to:

```text
origin    https://github.com/YOUR-USERNAME/REPOSITORY-NAME.git (fetch)
origin    https://github.com/YOUR-USERNAME/REPOSITORY-NAME.git (push)
upstream  https://github.com/ORIGINAL-OWNER/REPOSITORY-NAME.git (fetch)
upstream  https://github.com/ORIGINAL-OWNER/REPOSITORY-NAME.git (push)
```

The remotes have different purposes:

- **origin** — your personal fork; push your work here.
- **upstream** — the original project; fetch updates from here.

Do not push directly to `upstream`. Your normal contribution workflow is to push to your fork and open a pull request.

## 6. Open the Project in VS Code

Ensure you are inside the repository directory.

Run:

```bash
code .
```

The `.` means the current directory.

If the `code` command is unavailable, open VS Code manually and select **File → Open Folder**, then choose the cloned repository folder.

Once the project opens, use **Terminal → New Terminal** to open the integrated terminal.

Before editing anything, take a moment to inspect the project structure and read its existing documentation.

Look for files such as:

- `README.md` — project overview and instructions.
- `package.json` — dependencies and available scripts.
- `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` — package manager lockfile.
- `.env.example` or equivalent — required environment variable names.
- `.vscode/extensions.json` — recommended VS Code extensions, if provided.

Follow the repository's existing conventions rather than creating a new setup or replacing existing configuration files.

## 7. Install the Project Dependencies

The installation process depends on the project's technology stack.

### For a Node.js project

First, confirm that Node.js and npm are installed:

```bash
node --version
npm --version
```

Navigate to the directory containing the relevant `package.json`.

If the project uses npm and contains a `package-lock.json`, run:

```bash
npm ci
```

`npm ci` installs the dependencies specified by the lockfile without updating it.

If there is no npm lockfile, follow the repository instructions. For an npm project, this will generally be:

```bash
npm install
```

If the project uses pnpm or Yarn, use the package manager specified in the repository instead. Do not generate a second lockfile using a different package manager.

### For a project with multiple applications

Some repositories contain separate frontend and backend applications, such as:

```text
repository/
├── clients/
├── server/
├── package.json
└── README.md
```

This is only an example; your repository may use a different structure.

Read the project's setup documentation before installing dependencies. If the repository has separate applications and no root workspace configuration, each application may need its dependencies installed from its own directory.

For example, if the instructions specify separate npm installations:

```bash
cd clients
npm ci
```

Then, in another terminal:

```bash
cd server
npm ci
```

Use these example commands only if those directories and lockfiles actually exist in your repository.

## 8. Configure Environment Variables

Some projects need environment variables for API URLs, databases, authentication, or third-party services.

Look for `.env.example`, `.env.template`, or environment setup instructions in the project documentation.

If the repository provides a `.env.example` file, you may need to create a local environment file:

```bash
cp .env.example .env
```

This command works in Git Bash, Linux, and macOS terminals. On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Follow the project's instructions for filling in the required values. Do not assume that copying the file alone completes the configuration.

**Security rules:**

- Never commit `.env` files containing secrets.
- Never share API keys, passwords, database credentials, or JWT secrets through public repositories.
- Do not overwrite an existing environment file without checking it first.
- Ask the project maintainer for access to any credentials or services that you are authorized to use but cannot configure independently.

Check that secret files are covered by `.gitignore` before committing:

```bash
git status --short
```

If a secret file is listed as an untracked file, do not stage or commit it until you have confirmed that it is safe to include.

## 9. Check the Available Development Commands

Do not assume that every project uses the same commands to start or test the application.

For an npm project, list the scripts available in `package.json`:

```bash
npm run
```

Common scripts include:

```bash
npm run dev
npm run build
npm run lint
npm test
```

These commands are examples. Only run the ones that are actually defined by your project.

Before starting the application, confirm that:

- All required dependencies are installed.
- Environment variables are configured.
- Any required local services or database connections are available.
- You are using the correct Node.js and package manager versions.

Follow the project-specific instructions to start the frontend, backend, or other services.

## 10. Synchronize Your Local Branch with the Original Repository

Before beginning development, retrieve the latest updates from the original repository:

```bash
git fetch upstream
```

Check the repository's default branch on GitHub. The following commands assume it is named `main`.

If you have made no local commits or changes to your local `main` branch, synchronize it with the original repository:

```bash
git switch main
git merge upstream/main
```

Then update your fork's `main` branch on GitHub:

```bash
git push origin main
```

If your repository uses another default branch, substitute its actual name for `main`.

If Git reports conflicts, or your local `main` already contains personal commits or uncommitted changes, stop and inspect the situation before merging. Do not discard local work just to synchronize the repository.

## 11. Create a Development Branch

**Do not develop directly on `main`.** Create a separate branch for each feature, bug fix, or assigned task.

For example:

```bash
git switch -c feat/feature-name
```

For a bug fix:

```bash
git switch -c fix/bug-description
```

Replace the example names with a short description of your assigned work.

Check that the new branch is active:

```bash
git branch --show-current
git status
```

Each team member should use a separate branch for their own work. This keeps changes organized and makes code review easier.

## 12. Verify That Your Workstation Is Ready

Before writing code, complete this checklist:

- [ ] Git is installed and configured.
- [ ] VS Code is installed and opens the cloned project.
- [ ] The repository was forked under my GitHub account.
- [ ] My local copy was cloned from my fork.
- [ ] `origin` points to my fork.
- [ ] `upstream` points to the original repository.
- [ ] The correct runtime and package manager versions are installed.
- [ ] Project dependencies are installed.
- [ ] Required environment variables and services are configured.
- [ ] I have checked the project's available scripts.
- [ ] I have fetched and synchronized updates from the original repository.
- [ ] I have created a development branch.
- [ ] The working tree is clean, or any existing changes are understood.

Your local development branch is now ready for coding.

## 13. Daily Development Workflow

Once the workstation is ready, follow this workflow for each task.

### Before starting new work

Check that you are on the correct branch:

```bash
git branch --show-current
git status
```

Fetch updates from the original repository when appropriate:

```bash
git fetch upstream
```

If you need changes from the latest `upstream/main`, synchronize carefully before starting a new task. Do not overwrite existing changes.

### After making changes

Review what changed:

```bash
git status
git diff
```

Stage only the files related to your task:

```bash
git add path/to/changed-file
```

Commit the changes:

```bash
git commit -m "feat: describe the change"
```

Push your development branch to your fork:

```bash
git push -u origin feat/feature-name
```

On subsequent pushes to the same branch, you can use:

```bash
git push
```

### Submit a pull request

1. Open your fork on GitHub.
2. Select the development branch you pushed.
3. Click **Compare & pull request**.
4. Make sure the base repository is the original repository.
5. Set the base branch to the original project's intended target branch, typically `main`.
6. Describe what changed, why it changed, and how you tested it.
7. Submit the pull request for review.

Wait for review and approval before merging according to the project's contribution rules.

---

## Important Team Rules

1. Do not commit directly to the original repository's `main` branch.
2. Do not commit secrets, credentials, personal environment files, or private configuration.
3. Do not change dependencies or project configuration unnecessarily.
4. Do not overwrite or discard another developer's work.
5. Read existing documentation and follow the project's conventions.
6. Keep each branch focused on one assigned feature or fix.
7. Test your changes before creating a pull request.

**Setup complete!** You should now have a working local copy in VS Code, connected to your personal fork and the original repository, with a development branch ready for your assigned tasks.
