document.addEventListener('DOMContentLoaded', () => {
    const NOTE_ID = 1; // Using a fixed ID for a single-note app
    const DB_NAME = 'Contaro5NotesDB';
    const NOTE_STORE_NAME = 'notes';
    const LOCALSTORAGE_KEY_NOTE = 'contaro5_recovery_note_content';

    const statusBar = document.getElementById('status-bar');

    function updateStatus(message, isError = false) {
        if (statusBar) {
            statusBar.textContent = message;
            statusBar.style.color = isError ? 'red' : '#606770';
        }
        console.log(message);
    }

    // 1. Dexie Database Setup
    const db = new Dexie(DB_NAME);
    db.version(1).stores({
        [NOTE_STORE_NAME]: 'id, title, content, lastModified' // 'id' is the primary key
    });

    // 2. Quill Editor Initialization
    const quill = new Quill('#editor-container', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }], // Allow H1, H2, H3, and paragraph
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'indent': '-1'}, { 'indent': '+1' }],
                ['link', 'blockquote', 'code-block'], // Added more options
                ['clean']
            ]
        },
        placeholder: 'Start your note... The first line will be the title.'
    });

    // 3. Format First Line as Heading (H1) Logic
    function ensureFirstLineIsHeading() {
        const [firstLineBlot, offset] = quill.getLine(0); // Get the first line Blot

        if (firstLineBlot) {
            const lineText = quill.getText(offset, firstLineBlot.length() -1); // Get text of the line, excluding its trailing newline
            
            if (lineText.trim().length > 0) { // If there's actual text on the first line
                const formats = firstLineBlot.formats();
                if (!formats['header'] || formats['header'] !== 1) {
                    quill.formatLine(offset, 1, 'header', 1, Quill.sources.SILENT);
                    // console.log("Formatted first line to H1");
                    return true; // Indicates a format change occurred
                }
            }
        }
        return false; // No change made
    }

    // 4. Autosave Logic
    async function saveNote() {
        const currentContents = quill.getContents(); // Quill's Delta object
        const text = quill.getText();
        const firstNewline = text.indexOf('\n');
        const title = (firstNewline === -1 ? text : text.substring(0, firstNewline)).trim();

        const noteData = {
            id: NOTE_ID,
            title: title,
            content: currentContents, // Save Delta for rich content
            lastModified: new Date()
        };

        try {
            await db.notes.put(noteData);
            updateStatus(`Saved to Dexie: ${new Date().toLocaleTimeString()}`);
            
            // Optional: Cache to localStorage
            try {
                localStorage.setItem(LOCALSTORAGE_KEY_NOTE, JSON.stringify(currentContents));
            } catch (e) {
                console.error("Error caching to localStorage:", e);
                updateStatus("Error caching to localStorage.", true);
            }
        } catch (err) {
            console.error("Failed to save note to Dexie:", err);
            updateStatus("Error saving to Dexie!", true);
            // Fallback: try to ensure it's at least in localStorage if Dexie fails
            try {
                localStorage.setItem(LOCALSTORAGE_KEY_NOTE, JSON.stringify(currentContents));
                updateStatus("Note cached to localStorage (Dexie failed).", true);
            } catch (e) {
                console.error("Error saving to localStorage after Dexie failure:", e);
            }
        }
    }

    // 5. Load Note on Page Load
    async function loadNoteContent() {
        updateStatus("Loading note...");
        let noteContentToLoad = null;

        try {
            const note = await db.notes.get(NOTE_ID);
            if (note && note.content) {
                noteContentToLoad = note.content;
                updateStatus("Note loaded from Dexie.");
            } else {
                // Try localStorage if not in Dexie
                const recoveryContentString = localStorage.getItem(LOCALSTORAGE_KEY_NOTE);
                if (recoveryContentString) {
                    try {
                        noteContentToLoad = JSON.parse(recoveryContentString);
                        updateStatus("Note loaded from localStorage recovery.");
                    } catch (e) {
                        console.error("Failed to parse recovery content from localStorage:", e);
                        localStorage.removeItem(LOCALSTORAGE_KEY_NOTE); // Remove malformed data
                        updateStatus("Error parsing localStorage recovery data.", true);
                    }
                }
            }
        } catch (error) {
            console.error("Error loading from Dexie:", error);
            updateStatus("Error loading from Dexie. Trying localStorage...", true);
            const recoveryContentString = localStorage.getItem(LOCALSTORAGE_KEY_NOTE);
            if (recoveryContentString) {
                 try {
                    noteContentToLoad = JSON.parse(recoveryContentString);
                    updateStatus("Note loaded from localStorage recovery after Dexie error.");
                } catch (e) {
                    console.error("Failed to parse recovery content from localStorage:", e);
                    localStorage.removeItem(LOCALSTORAGE_KEY_NOTE);
                    updateStatus("Error parsing localStorage recovery data.", true);
                }
            }
        }

        if (noteContentToLoad) {
            quill.setContents(noteContentToLoad, Quill.sources.SILENT);
            ensureFirstLineIsHeading(); // Ensure rule is applied to loaded content
        } else {
            // If editor is new/empty, set up a default H1 block for the first line.
            // This means when the user first types, they are already in an H1.
            // quill.formatLine(0, 1, 'header', 1, Quill.sources.SILENT);
            // Alternatively, an empty Delta with H1 attribute:
            quill.setContents([{ insert: '\n', attributes: { header: 1 } }], Quill.sources.SILENT);
            quill.setSelection(0,0); // Place cursor at the beginning
            updateStatus("Started a new note.");
        }
         // Final check to ensure first line format after any load operation
        ensureFirstLineIsHeading();
    }

    // 6. Initialize the Editor and Event Listeners
    async function initializeEditor() {
        await loadNoteContent();

        quill.on('text-change', (delta, oldDelta, source) => {
            if (source === Quill.sources.USER) {
                ensureFirstLineIsHeading(); // Apply formatting rule first
                saveNote(); // Then save
            }
        });
        
        // Focus the editor when ready
        quill.focus();
    }

    initializeEditor();
});
