# Slide images for the landing page

Pictures from **Flood Simulation.pptx** can be used on the landing page in two ways:

## Option 1: Export from PowerPoint

1. Open the PowerPoint file.
2. Use **File → Export → Change File Type → PNG** (or **JPEG**), then **Save As** and choose “All Slides” to export every slide as an image.
3. Copy the exported images into this folder (`assets/slides/`).
4. Rename them to match the names used on the landing page:
   - `hero.png` – main/title slide
   - `study-area.png` – Study Area section
   - `flood-extent.png` – Flood extent / water levels
   - `3d-viz.png` – 3D environment slide
   - `purpose.png` – Purpose of the Simulation
   - `supporting-decisions.png` – Supporting Better Decisions
   - `mission.png` – Mission / learning objectives

Use `.jpg` instead of `.png` if you prefer; update the file names in `index.html` to match.

## Option 2: Extract from the .pptx file

1. Put **Flood Simulation.pptx** in the project root (or note its path).
2. In PowerShell, from the project root, run:
   ```powershell
   .\scripts\extract-pptx-images.ps1 -Path ".\Flood Simulation.pptx"
   ```
   Or with a full path:
   ```powershell
   .\scripts\extract-pptx-images.ps1 -Path "C:\path\to\Flood Simulation.pptx"
   ```
3. This copies all media from the deck into `assets/slides/` (as `media1.png`, `media2.jpg`, etc.).
4. In `index.html`, either:
   - Rename the extracted files to `hero.png`, `study-area.png`, etc., and keep the current `src` values, or
   - Change the `src` of each `<img>` to the extracted file name (e.g. `assets/slides/media1.png`) and reorder as needed.
