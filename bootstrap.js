const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

var ZoteroHarvest = {
  init: function () {},

  // Core function to harvest selected items
  harvestSelection: async function () {
    const ZoteroPane = Zotero.getActiveZoteroPane();
    if (!ZoteroPane) return;

    const selectedItems = ZoteroPane.getSelectedItems();
    if (selectedItems.length === 0) return;

    let outputText = `File Generated: ${this.getCurrentDate()}\n\n`;

    // Map to track exactly what to extract per parent to avoid over-exporting
    let exportMap = new Map();
    let standaloneNotes = [];

    // 1. Organize Selection Intelligently
    for (let item of selectedItems) {
      if (item.isRegularItem()) {
        // If parent is selected, mark to extract ALL children
        if (!exportMap.has(item.id)) {
          exportMap.set(item.id, {
            parent: item,
            extractAll: true,
            specificNotes: [],
            specificAttachments: [],
          });
        } else {
          exportMap.get(item.id).extractAll = true;
        }
      } else if (item.isNote()) {
        let parentID = item.parentItemID;
        if (parentID) {
          if (!exportMap.has(parentID)) {
            exportMap.set(parentID, {
              parent: Zotero.Items.get(parentID),
              extractAll: false,
              specificNotes: [],
              specificAttachments: [],
            });
          }
          exportMap.get(parentID).specificNotes.push(item);
        } else {
          standaloneNotes.push(item);
        }
      } else if (item.isAttachment()) {
        let parentID = item.parentItemID;
        if (parentID) {
          if (!exportMap.has(parentID)) {
            exportMap.set(parentID, {
              parent: Zotero.Items.get(parentID),
              extractAll: false,
              specificNotes: [],
              specificAttachments: [],
            });
          }
          exportMap.get(parentID).specificAttachments.push(item);
        }
      }
    }

    // 2. Process Mapped Items
    for (let [parentID, data] of exportMap) {
      let item = data.parent;
      outputText += this.formatMetadata(item);
      let contentText = "";

      // A. Process Notes (Either ALL or only the specific ones selected)
      let notesToProcess = data.extractAll
        ? item.getNotes().map((id) => Zotero.Items.get(id))
        : data.specificNotes;
      for (let noteItem of notesToProcess) {
        let rawNote = this.stripHTML(noteItem.getNote());
        rawNote = this.cleanZoteroCruft(rawNote);
        if (rawNote) contentText += `${rawNote}\n\n`;
      }

      // B. Process PDF Annotations (Either ALL or only the specific ones selected)
      let attachmentsToProcess = data.extractAll
        ? item.getAttachments().map((id) => Zotero.Items.get(id))
        : data.specificAttachments;
      let annotations = await this.getItemAnnotations(attachmentsToProcess);
      if (annotations) {
        contentText += `${annotations}\n`;
      }

      if (contentText.trim() === "") {
        contentText = "No notes or highlights selected for this source.\n\n";
      }

      outputText += contentText.trim() + "\n\n";
    }

    // 3. Process Standalone Notes
    if (standaloneNotes.length > 0) {
      outputText += `## Standalone Notes\n---\n`;
      for (let note of standaloneNotes) {
        let rawNote = this.stripHTML(note.getNote());
        outputText += `${this.cleanZoteroCruft(rawNote)}\n\n`;
      }
    }

    await this.writeToFile(outputText.trim());
  },

  // Helper: Extract Annotations cleanly (Updated to accept an array of specific attachments)
  getItemAnnotations: async function (attachments) {
    let annotationText = "";

    for (let attachment of attachments) {
      // If we are passed an ID instead of an object, fetch the object
      if (typeof attachment === "number" || typeof attachment === "string") {
        attachment = await Zotero.Items.getAsync(attachment);
      }

      if (attachment.attachmentContentType === "application/pdf") {
        let annotations = Zotero.Items.get(attachment.getAnnotations());
        for (let anno of annotations) {
          let page = anno.annotationPageLabel || "?";
          let text = anno.annotationText || "";
          let comment = anno.annotationComment || "";

          // Clean printing without explicit prefixes
          if (text) annotationText += `"${text}" (p. ${page})\n\n`;
          if (comment) annotationText += `${comment}\n\n`;
        }
      }
    }
    return annotationText.trim();
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

    // Clean Markdown Header (No square brackets, no "Source:" prefix)
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
      progressWin.changeHeadline("Harvest Successful");
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
      let menuItem = window.document.createXULElement("menuitem");
      menuItem.setAttribute("id", "zotero-harvest-menu-item");
      menuItem.setAttribute("label", "Harvest Selection");
      menuItem.addEventListener(
        "command",
        () => ZoteroHarvest.harvestSelection(),
        false,
      );
      menu.appendChild(menuItem);
    }
  }
}
function shutdown() {
  Zotero.debug("Zotero Harvest Shutting down...");
  let window = Zotero.getMainWindow();
  if (window) {
    let menuItem = window.document.getElementById("zotero-harvest-menu-item");
    if (menuItem) menuItem.remove();
  }
}
