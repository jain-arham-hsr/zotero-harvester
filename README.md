# Zotero Harvest

Zotero Harvest is a lightweight plugin that extracts selected library items, PDF highlights, and personal notes, formatting them into a highly structured, clean Markdown file (`source_material.md`).

## ✨ Features

- **Structured Markdown Output:** Generates clean headers and explicitly separates source excerpts from your personal commentary.
- **Native Item Types:** Automatically queries Zotero's database to label sources (e.g., Book, Journal Article, Blog Post).
- **Smart Quote Detection:** Automatically distinguishes between PDF highlights (excerpts) and your personal notes/comments.
- **Pre-compiled Citations:** Bypasses complex BibTeX pipelines by building a ready-to-use citation string for every item.
- **Standalone Notes:** Gathers notes not attached to any parent item and cleanly isolates them in a dedicated `## Standalone Notes` section at the bottom of the document.

## 📦 Installation

1. Download the plugin files and bundle them into a `.xpi` file.
2. Open Zotero.
3. Navigate to **Tools > Add-ons**.
4. Click the gear icon in the top right and select **Install Add-on From File...**
5. Select your `.xpi` file and restart Zotero if prompted.

## 🚀 Usage

1. Open your Zotero library.
2. Select one or more items (or standalone notes) you wish to extract.
3. Right-click the selection.
4. Click **Harvest Selection** from the context menu.
5. A success popup will appear, and your formatted Markdown file will be generated.

## 📄 Output Example

```markdown
File Generated: 2026-04-07 14:30

## Introduction to Probability

**Type:** Book
**Citation:** Blitzstein, J.; Hwang, J. (2019). _Introduction to probability_. CRC Press

---

"Given an experiment with sample space S, a random variable is a function from the sample space S to the real numbers R." (p. 14)

The randomness comes from the experiment itself, not the mathematical function.

## Standalone Notes

---

Need to emphasize the difference between discrete and continuous variables in the final section.
```
