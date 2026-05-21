const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

var ZoteroHarvest = {
  init: function () {},

  // 1. Bundle Notes Functionality (Exports selected notes to markdown)
  bundleNotes: async function () {
    const ZoteroPane = Zotero.getActiveZoteroPane();
    if (!ZoteroPane) return;

    const selectedItems = ZoteroPane.getSelectedItems();
    // Filter: Only accept notes as selection
    const selectedNotes = selectedItems.filter((item) => item.isNote());

    if (selectedNotes.length === 0) return;

    let outputText = `File Generated: ${this.getCurrentDate()}\n\n`;

    let parentMap = new Map();
    let standaloneNotes = [];

    // Group selected notes by their parent item
    for (let note of selectedNotes) {
      let parentID = note.parentItemID;
      if (parentID) {
        if (!parentMap.has(parentID)) {
          parentMap.set(parentID, {
            parent: Zotero.Items.get(parentID),
            notes: [],
          });
        }
        parentMap.get(parentID).notes.push(note);
      } else {
        standaloneNotes.push(note);
      }
    }

    // Process grouped notes and append parent metadata
    for (let [parentID, data] of parentMap) {
      outputText += this.formatMetadata(data.parent);

      let contentText = "";
      for (let note of data.notes) {
        let rawNote = this.stripHTML(note.getNote());
        rawNote = this.cleanZoteroCruft(rawNote);
        if (rawNote) contentText += `${rawNote}\n\n`;
      }

      outputText += contentText.trim() + "\n\n";
    }

    // Process Standalone Notes
    if (standaloneNotes.length > 0) {
      outputText += `## Standalone Notes\n---\n`;
      for (let note of standaloneNotes) {
        let rawNote = this.stripHTML(note.getNote());
        outputText += `${this.cleanZoteroCruft(rawNote)}\n\n`;
      }
    }

    await this.writeToFile(outputText.trim());
  },

  // 2. Harvest Annotations Functionality (Creates a Zotero Note & Deletes original annotations)
  harvestAnnotations: async function () {
    const ZoteroPane = Zotero.getActiveZoteroPane();
    if (!ZoteroPane) return;

    const selectedItems = ZoteroPane.getSelectedItems();
    // Filter: Only accept annotations as selection
    const annotations = selectedItems.filter((item) => item.isAnnotation());

    if (annotations.length === 0) return;

    try {
      // Trigger Zotero's native extraction to generate the note
      await ZoteroPane.addNoteFromAnnotationsFromSelected();

      // Wait a brief moment to ensure the database transaction completes for the new note
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Trash the original selected annotations
      let annoIDs = annotations.map((a) => a.id);
      await Zotero.Items.trashTx(annoIDs);
    } catch (e) {
      Zotero.logError(
        "Zotero Harvest Error: Could not harvest annotations | " + e,
      );
    }
  },

  // Helper: Remove useless Zotero auto-generated text
  cleanZoteroCruft: function (text) {
    text = text.replace(
      /^Annotations\s*\(\d{1,2}\/\d{1,2}\/\d{4},.*?\)\s*/i,
      "",
    );
    text = text.replace(/^Note:\s*/i, "");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  },

  // Helper: Safely grab fields
  safeGetField: function (item, field) {
    try {
      return item.getField(field) || "";
    } catch (e) {
      return "";
    }
  },

  // Helper: Format Metadata cleanly
  formatMetadata: function (item) {
    let creatorsArray = item.getCreators();
    let authorString = "Unknown Author";

    if (creatorsArray.length > 0) {
      authorString = creatorsArray
        .map((c) => {
          let name = c.lastName || "";
          if (c.firstName) name += ", " + c.firstName.charAt(0) + ".";
          return name;
        })
        .join("; ");
    }

    let yearStr = this.safeGetField(item, "date");
    let year = yearStr ? yearStr.substring(0, 4) : "n.d.";
    let title = this.safeGetField(item, "title") || "Untitled";
    let url = this.safeGetField(item, "url");
    let publisher =
      this.safeGetField(item, "publicationTitle") ||
      this.safeGetField(item, "publisher") ||
      "";

    let itemTypeStr = "Document";
    try {
      if (item.itemTypeID) {
        itemTypeStr = Zotero.ItemTypes.getLocalizedString(item.itemTypeID);
      }
    } catch (e) {}

    let citation = `${authorString} (${year}). _${title}_. ${publisher}`;
    if (url) citation += ` URL: ${url}`;

    let metaString = `## ${title}\n`;
    metaString += `**Type:** ${itemTypeStr}\n`;
    metaString += `**Citation:** ${citation.trim()}\n`;
    metaString += `---\n`;

    return metaString;
  },

  // Helper: Format Current Date
  getCurrentDate: function () {
    let now = new Date();
    return now.toISOString().substring(0, 16).replace("T", " ");
  },

  // Helper: Strip HTML
  stripHTML: function (html) {
    let formattedHtml = html.replace(/<\/?(p|br|div)[^>]*>/gi, "\n");
    let doc = new DOMParser().parseFromString(formattedHtml, "text/html");
    return (doc.body.textContent || "").trim();
  },

  // Helper: Overwrite the text file
  writeToFile: async function (content) {
    let filePath = Zotero.Prefs.get("extensions.zoteroharvest.exportPath");

    if (!filePath) {
      filePath = "~/Desktop/_source_material.md";
    }

    if (filePath.startsWith("~")) {
      let homeDir = Components.classes["@mozilla.org/file/directory_service;1"]
        .getService(Components.interfaces.nsIProperties)
        .get("Home", Components.interfaces.nsIFile).path;
      let separator = homeDir.includes("\\") ? "\\" : "/";
      if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
        filePath = homeDir + separator + filePath.substring(2);
      } else {
        filePath = homeDir + separator + filePath.substring(1);
      }
    }

    try {
      await Zotero.File.putContentsAsync(filePath, content);
      let progressWin = new Zotero.ProgressWindow();
      progressWin.changeHeadline("Bundle Successful");
      progressWin.addLines(["Exported to: " + filePath]);
      progressWin.show();
      progressWin.startCloseTimer(2500);
    } catch (e) {
      Zotero.logError(
        "Zotero Harvest Error: Could not write to file at " +
          filePath +
          " | " +
          e,
      );
    }
  },
};

// --- Zotero Bootstrap Lifecycle Methods ---
function install() {}
function uninstall() {}
function startup({ id, version, resourceURI, rootURI }) {
  Zotero.debug("Zotero Harvest Starting...");
  let window = Zotero.getMainWindow();
  if (window) {
    let menu = window.document.getElementById("zotero-itemmenu");
    if (menu) {
      // Create 'Bundle Notes' Menu Item
      let bundleMenuItem = window.document.createXULElement("menuitem");
      bundleMenuItem.setAttribute("id", "zotero-harvest-bundle-notes");
      bundleMenuItem.setAttribute("label", "Bundle Notes");
      bundleMenuItem.addEventListener(
        "command",
        () => ZoteroHarvest.bundleNotes(),
        false,
      );
      menu.appendChild(bundleMenuItem);

      // Create 'Harvest Annotations' Menu Item
      let harvestMenuItem = window.document.createXULElement("menuitem");
      harvestMenuItem.setAttribute("id", "zotero-harvest-annotations");
      harvestMenuItem.setAttribute("label", "Harvest Annotations");
      harvestMenuItem.addEventListener(
        "command",
        () => ZoteroHarvest.harvestAnnotations(),
        false,
      );
      menu.appendChild(harvestMenuItem);
    }
  }
}
function shutdown() {
  Zotero.debug("Zotero Harvest Shutting down...");
  let window = Zotero.getMainWindow();
  if (window) {
    let bundleMenuItem = window.document.getElementById(
      "zotero-harvest-bundle-notes",
    );
    if (bundleMenuItem) bundleMenuItem.remove();

    let harvestMenuItem = window.document.getElementById(
      "zotero-harvest-annotations",
    );
    if (harvestMenuItem) harvestMenuItem.remove();
  }
}
