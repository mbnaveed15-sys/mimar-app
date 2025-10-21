 Mimar 1.3 — Installer Builder with GitHub Actions
------------------------------------------------
This folder contains the Mimar 1.3 installer-builder and a GitHub Actions workflow to build Windows installers automatically.

How to use locally:
1. Ensure Node.js LTS is installed.
2. Double-click 'make_installer.bat' to build the installer locally (creates Mimar-Setup-1.3.0.exe).

GitHub Actions (automatic cloud build):
1. Create a GitHub repository and push this project (all files) to the 'main' branch.
2. The workflow '.github/workflows/build-installer.yml' will run on push and build a Windows NSIS installer.
3. After the workflow completes, download the produced .exe from the 'Artifacts' section of the Actions run.

Notes:
- The workflow uses windows-latest runner and electron-builder to create a 64-bit Windows installer.
- If you want signing, add codesigning secrets to your repository and configure electron-builder accordingly.
