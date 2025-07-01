# SQL Trace Enhancer

A Chrome extension designed to enhance `trace.axd` pages by extracting SQL statements, substituting parameters, and providing an interactive analytics panel.

## Features

*   **SQL Extraction & Parameter Substitution**: Automatically identifies SQL statements and their corresponding `ExecuteReader` parameters, substituting them into the SQL to create runnable queries.
*   **Runnable SQL Display**: Displays the fully parameterized SQL statement directly on the `trace.axd` page, ready for copying.
*   **Copy-to-Clipboard**: A convenient button to copy the runnable SQL to your clipboard.
*   **SQL Syntax Highlighting**: Improves readability of the extracted SQL with syntax highlighting.
*   **SQL Summary & Analytics Panel**: A floating, draggable, and minimizable panel that provides:
    *   Total number of queries.
    *   Breakdown of queries by type (SELECT, INSERT, UPDATE, DELETE, WITH, OTHER).
    *   List of the top 5 slowest queries with their execution times.
*   **Click-to-Scroll**: Clicking on a slowest query in the analytics panel scrolls the page to the corresponding SQL block and highlights it.
*   **Configurable Panel Visibility**: Users can set a preference via the extension's popup to determine if the analytics panel should open by default or remain closed on page load.

## Installation

1.  **Download/Clone**: Download or clone this repository to your local machine.
2.  **Open Chrome Extensions**: Open Google Chrome and navigate to `chrome://extensions/`.
3.  **Enable Developer Mode**: Toggle on "Developer mode" in the top right corner.
4.  **Load Unpacked**: Click on "Load unpacked" and select the directory where you downloaded/cloned this project.
5.  The extension should now appear in your list of extensions and be active.

## Usage

1.  Navigate to any `trace.axd` page in your browser.
2.  The "SQL Summary & Analytics" panel will appear (either open or closed, depending on your preference).
3.  You will see runnable SQL statements injected below the original trace entries.
4.  Use the analytics panel to get an overview of queries and identify slow ones.
5.  Click the copy button next to any runnable SQL to copy it.
6.  To change the default visibility of the analytics panel, click on the extension icon in your Chrome toolbar and adjust the setting in the popup.

## Contributing

Feel free to fork the repository, make improvements, and submit pull requests. Issues and feature requests are also welcome.
