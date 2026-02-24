// content.js

var MESSAGES = {};
var queryAnalyticsData = []; // Store query data globally
var cacheStats = { hits: 0, misses: 0 };
var n1Detection = {}; // Map of normalized SQL to count and instances

/**
 * Custom message getter after loading the appropriate language file.
 * @param {string} key - The message key to retrieve.
 * @returns {string} - The translated message or the key itself if not found.
 */
function getMessage(key) {
    return MESSAGES[key]?.message || key;
}

/**
 * Finds the execution time of a query from a trace.axd time cell.
 * The value is expected to be in seconds (e.g., "0,006854") and is converted to milliseconds.
 * @param {string} textBlock - The text content of the time cell.
 * @returns {number} - The execution time in milliseconds, or 0 if not found.
 */
function findExecutionTime(textBlock) {
    if (!textBlock) return 0;
    const numberValue = parseFloat(textBlock.trim().replace(',', '.'));
    if (!isNaN(numberValue)) {
        return Math.round(numberValue * 1000);
    }
    return 0;
}

/**
 * Normalizes a SQL statement by replacing literals and parameter names with placeholders.
 * Useful for N+1 detection.
 */
function normalizeSql(sql) {
    let normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
    // Replace string literals
    normalized = normalized.replace(/'(?:[^']|'')*'/g, '?');
    // Replace numbers
    normalized = normalized.replace(/\b\d+\b/g, '?');
    // Replace GeneXus/ADO parameters (e.g., @AV123, :AV123)
    normalized = normalized.replace(/[@:][a-zA-Z0-9_$]+/g, '?');
    return normalized;
}

/**
 * Extracts the likely GeneXus object name from a trace log message.
 */
function extractObjectContext(message) {
    // Look for patterns like "GeneXus.Application.GxContext - GxContext.Ctr Default handle:48" (not much info)
    // or better: specific object executions often logged by common GeneXus patterns.
    // Frequently, the trace contains lines like "DEBUG GeneXus.Application.GxContext - ... objectName"
    const contextRegex = /DEBUG\s+[\w\.]+\s+-\s+([\w\d]+)/i;
    const match = contextRegex.exec(message);
    if (match && match[1]) {
        // Exclude common infrastructure names
        const infraNames = ['GXCONTEXT', 'GXHTTPHANDLER', 'GXCONNECTIONMANAGER', 'GXCONNECTION'];
        if (!infraNames.includes(match[1].toUpperCase())) {
            return match[1];
        }
    }
    return null;
}

/**
 * Creates and injects the SQL Summary & Analytics floating panel.
 * @param {Array<Object>} queryStats - Array of objects with {sql, time, id}.
 */
function createAnalyticsPanel(queryStats) {
    const existingPanel = document.getElementById('sql-analytics-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'sql-analytics-panel';
    panel.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 420px; max-height: 90vh;
        background-color: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px);
        border: 1px solid rgba(222, 226, 230, 0.5); border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12); font-family: 'Inter', -apple-system, sans-serif;
        z-index: 10001; display: flex; flex-direction: column; overflow: hidden;
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s;
    `;

    const header = document.createElement('div');
    header.id = 'sql-analytics-panel-header';
    header.style.cssText = `
        padding: 12px 16px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border-bottom: 1px solid #dee2e6; cursor: move; display: flex;
        justify-content: space-between; align-items: center;
    `;

    const title = document.createElement('h3');
    title.textContent = getMessage("panelTitle");
    title.style.cssText = 'margin: 0; font-size: 15px; color: #1a1a1a; font-weight: 700; letter-spacing: -0.01em;';

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '–';
    toggleBtn.style.cssText = `
        background: #fff; border: 1px solid #dee2e6; border-radius: 6px; width: 28px; height: 28px;
        font-size: 18px; cursor: pointer; color: #495057; display: flex; align-items: center;
        justify-content: center; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    `;
    toggleBtn.onmouseover = () => toggleBtn.style.backgroundColor = '#f8f9fa';
    toggleBtn.onmouseout = () => toggleBtn.style.backgroundColor = '#fff';

    header.appendChild(title);
    header.appendChild(toggleBtn);
    panel.appendChild(header);

    const content = document.createElement('div');
    content.id = 'sql-analytics-content';
    content.style.cssText = 'padding: 16px; overflow-y: auto;';

    // --- Calculate Stats ---
    const totalQueries = queryStats.length;
    const totalTime = queryStats.reduce((acc, q) => acc + q.time, 0);
    const queryTypes = { SELECT: 0, INSERT: 0, UPDATE: 0, DELETE: 0, WITH: 0, OTHER: 0 };
    queryStats.forEach(q => {
        const sqlUpper = q.sql.trim().toUpperCase();
        if (sqlUpper.startsWith('SELECT')) queryTypes.SELECT++;
        else if (sqlUpper.startsWith('INSERT')) queryTypes.INSERT++;
        else if (sqlUpper.startsWith('UPDATE')) queryTypes.UPDATE++;
        else if (sqlUpper.startsWith('DELETE')) queryTypes.DELETE++;
        else if (sqlUpper.startsWith('WITH')) queryTypes.WITH++;
        else queryTypes.OTHER++;
    });

    const slowestQueries = [...queryStats].sort((a, b) => b.time - a.time).slice(0, 5);
    const repeatedQueries = Object.entries(n1Detection)
        .filter(([_, data]) => data.count > 1)
        .sort((a, b) => b[1].count - a[1].count);

    // --- Populate Content ---
    let contentHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div style="background: #f1f3f5; padding: 10px; border-radius: 8px;">
                <span style="display: block; font-size: 11px; color: #6c757d; font-weight: 600; text-transform: uppercase;">Total Queries</span>
                <span style="font-size: 20px; font-weight: 700; color: #212529;">${totalQueries}</span>
            </div>
            <div style="background: #f1f3f5; padding: 10px; border-radius: 8px;">
                <span style="display: block; font-size: 11px; color: #6c757d; font-weight: 600; text-transform: uppercase;">Total Time</span>
                <span style="font-size: 20px; font-weight: 700; color: #212529;">${totalTime}ms</span>
            </div>
        </div>

        <div style="margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px; font-size: 13px; color: #495057; display: flex; align-items: center;">
                <span style="margin-right: 8px;">⚡</span> Cache Performance
            </h4>
            <div style="display: flex; gap: 8px;">
                <div style="flex: 1; height: 32px; background: #e9ecef; border-radius: 6px; position: relative; overflow: hidden; display: flex;">
                    <div style="width: ${(cacheStats.hits / (cacheStats.hits + cacheStats.misses || 1)) * 100}%; background: #28a745;" title="Hits: ${cacheStats.hits}"></div>
                    <div style="width: ${(cacheStats.misses / (cacheStats.hits + cacheStats.misses || 1)) * 100}%; background: #ffc107;" title="Misses: ${cacheStats.misses}"></div>
                </div>
                <div style="font-size: 12px; line-height: 32px; color: #495057; font-weight: 600;">
                    ${Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses || 1)) * 100)}% Hit
                </div>
            </div>
        </div>
    `;

    if (repeatedQueries.length > 0) {
        contentHTML += `
            <div style="margin-bottom: 20px; border: 1px solid #ffeeba; background: #fffaf0; border-radius: 8px; padding: 12px;">
                <h4 style="margin: 0 0 8px; font-size: 13px; color: #856404; display: flex; align-items: center;">
                    <span style="margin-right: 8px;">⚠️</span> Repeated Queries (N+1?)
                </h4>
                <ul style="list-style: none; margin: 0; padding: 0;">
        `;
        repeatedQueries.slice(0, 3).forEach(([_, data]) => {
            contentHTML += `
                <li style="font-size: 12px; color: #533f03; margin-bottom: 4px; display: flex; justify-content: space-between;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; padding-right: 10px;">${data.sql.substring(0, 40)}...</span>
                    <strong>${data.count}x</strong>
                </li>
            `;
        });
        contentHTML += `</ul></div>`;
    }

    contentHTML += `
        <div>
            <h4 style="margin: 0 0 10px; font-size: 13px; color: #495057;">🚀 Slowest Queries</h4>
            <ul id="slowest-queries-list" style="list-style: none; margin: 0; padding: 0; font-size: 12px;">
    `;

    slowestQueries.forEach((q, i) => {
        contentHTML += `
            <li data-target-id="${q.id}" style="background-color: #fff; border: 1px solid #e9ecef; padding: 10px; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: transform 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-weight: 700; color: ${q.time > 10 ? '#c0392b' : '#2980b9'};">${q.time}ms</span>
                    <span style="color: #adb5bd; font-size: 10px; font-weight: 700;">${q.context}</span>
                </div>
                <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: 'JetBrains Mono', monospace; background-color: #f8f9fa; padding: 6px; border-radius: 4px; color: #495057; max-height: 50px; overflow-y: hidden;">${q.sql.replace(/</g, '&lt;').substring(0, 100)}...</pre>
            </li>
        `;
    });

    contentHTML += `</ul></div>`;

    content.innerHTML = contentHTML;
    panel.appendChild(content);
    document.body.appendChild(panel);

    // --- Add Interactivity ---
    let isMinimized = true;
    chrome.storage.sync.get('openPanelByDefault', function (data) {
        if (data.openPanelByDefault) {
            isMinimized = false;
        }

        // Initial positioning: Switch from right to left immediately to allow dragging
        requestAnimationFrame(() => {
            const initialWidth = isMinimized ? 220 : 420;
            const initialLeft = Math.max(20, window.innerWidth - initialWidth - 20);
            panel.style.right = 'auto';
            panel.style.left = initialLeft + 'px';
            updatePanelState(panel, content, toggleBtn, isMinimized);
        });
    });

    window.addEventListener('resize', () => {
        const rect = panel.getBoundingClientRect();
        const panelWidth = isMinimized ? 220 : 420;
        if (rect.right > window.innerWidth) {
            panel.style.left = Math.max(0, window.innerWidth - panelWidth - 20) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            panel.style.top = Math.max(0, window.innerHeight - rect.height - 20) + 'px';
        }
    });

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMinimized = !isMinimized;
        updatePanelState(panel, content, toggleBtn, isMinimized);

        // Ensure it doesn't jump off-screen when expanding
        requestAnimationFrame(() => {
            const rect = panel.getBoundingClientRect();
            const panelWidth = isMinimized ? 220 : 420;
            if (parseFloat(panel.style.left) + panelWidth > window.innerWidth) {
                panel.style.left = Math.max(0, window.innerWidth - panelWidth - 20) + 'px';
            }
        });
    });

    makePanelDraggable(panel, header);

    const slowestList = document.getElementById('slowest-queries-list');
    if (slowestList) {
        slowestList.addEventListener('click', (e) => {
            const targetLi = e.target.closest('li');
            if (!targetLi) return;
            const targetId = targetLi.dataset.targetId;
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetElement.style.transition = 'all 0.5s ease';
                targetElement.style.boxShadow = '0 0 20px rgba(0, 123, 255, 0.4)';
                targetElement.style.backgroundColor = '#fff8c4';
                setTimeout(() => {
                    targetElement.style.boxShadow = '';
                    targetElement.style.backgroundColor = '';
                }, 3000);
            }
        });
    }
}

function updatePanelState(panel, content, toggleBtn, isMinimized) {
    content.style.display = isMinimized ? 'none' : 'block';
    toggleBtn.textContent = isMinimized ? '+' : '–';

    // Use requestAnimationFrame to ensure smooth transitions
    requestAnimationFrame(() => {
        panel.style.width = isMinimized ? '220px' : '420px';
        panel.style.height = isMinimized ? '52px' : 'auto';
        panel.style.maxHeight = isMinimized ? '52px' : '90vh';
    });
}

/**
 * Makes the analytics panel draggable.
 */
function makePanelDraggable(panel, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();

        // Disable transitions during drag
        const originalTransition = panel.style.transition;
        panel.style.transition = 'none';

        // Get initial position
        pos3 = e.clientX;
        pos4 = e.clientY;

        // Switch from 'right' positioning to 'left' if needed, to avoid conflicts
        const rect = panel.getBoundingClientRect();
        panel.style.right = 'auto';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';

        document.onmouseup = function () {
            closeDragElement(originalTransition);
        };
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        let newTop = panel.offsetTop - pos2;
        let newLeft = panel.offsetLeft - pos1;

        // Constrain to screen bounds
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 50));

        panel.style.top = newTop + "px";
        panel.style.left = newLeft + "px";
    }

    function closeDragElement(originalTransition) {
        document.onmouseup = null;
        document.onmousemove = null;
        // Restore transitions
        panel.style.transition = originalTransition;
    }
}

/**
 * Main function to process trace entries on the page.
 */
function processTracePage() {
    let traceElements = Array.from(document.querySelectorAll('#TraceTable tbody tr'));
    if (traceElements.length === 0) {
        traceElements = Array.from(document.querySelectorAll('table tr'));
    }
    if (traceElements.length === 0) {
        console.warn(getMessage("noTraceTableFound"));
        return;
    }

    let persistentExecuteReaderParams = {};
    let sqlBlockCounter = 0;
    let pendingUpdate = null;
    let currentObjectContext = "Unknown";
    cacheStats = { hits: 0, misses: 0 };
    n1Detection = {};
    queryAnalyticsData = [];

    traceElements.forEach((element) => {
        if (element.tagName !== 'TR') return;

        const cells = element.querySelectorAll('td');
        if (cells.length < 2) return;

        const categoryCell = cells[0];
        const mainCell = cells[1];
        const mainCellContent = mainCell.innerHTML;
        const mainCellText = mainCell.textContent;

        // --- Category Color Coding & Transaction Highlighting ---
        applyRowStyles(element, categoryCell.textContent, mainCellText);

        // --- Context Tracking ---
        const obj = extractObjectContext(mainCellText);
        if (obj) currentObjectContext = obj;

        // --- Cache Event Tracking ---
        if (mainCellText.includes('GxCache') || mainCellText.includes('InProcessCache')) {
            if (mainCellText.includes('Get') || mainCellText.includes('hit')) {
                if (mainCellText.includes('NotFound') || mainCellText.includes('Empty') || mainCellText.includes('is Empty')) {
                    cacheStats.misses++;
                } else {
                    cacheStats.hits++;
                }
            }
        }

        // --- SQL Processing (Original Logic Refactored) ---
        // 1. Check if we are waiting for parameters for a pending UPDATE
        if (pendingUpdate) {
            const nonQueryParams = findNonQueryParameters(mainCellText);
            if (Object.keys(nonQueryParams).length > 0) {
                const runnableSql = substituteParams(pendingUpdate.sql, nonQueryParams);
                const executionTime = findExecutionTime(cells[cells.length - 1].textContent);

                recordQuery(runnableSql, executionTime, pendingUpdate.uniqueId, currentObjectContext);
                createAndInsertSqlDisplay(runnableSql, pendingUpdate.element, true, pendingUpdate.uniqueId, currentObjectContext);
            }
            pendingUpdate = null;
        }

        // 2. Find SQL Statements
        const executeReaderParams = findExecuteReaderParameters(mainCellContent);
        if (Object.keys(executeReaderParams).length > 0) {
            persistentExecuteReaderParams = executeReaderParams;
        }

        const sqlMatchResult = findSqlStatement(mainCellContent);
        if (sqlMatchResult) {
            const { statement: rawSql, matchEndIndexInBlock } = sqlMatchResult;
            const uniqueId = `sql-block-${sqlBlockCounter++}`;

            const paramsAfterSql = findAndParseParameters(mainCellContent.substring(matchEndIndexInBlock || 0));

            // UPDATE waiting for next row params
            if (rawSql.trim().toUpperCase().startsWith('UPDATE') && Object.keys(paramsAfterSql).length === 0) {
                pendingUpdate = { sql: rawSql, element: element, uniqueId: uniqueId };
                return;
            }

            // Normal SQL (SELECT, INSERT, DELETE, etc.)
            let executionTime = 0;
            const nextRow = element.nextElementSibling;
            if (nextRow && nextRow.tagName === 'TR') {
                const nextRowCells = nextRow.querySelectorAll('td');
                if (nextRowCells.length > 0) {
                    executionTime = findExecutionTime(nextRowCells[nextRowCells.length - 1].textContent);
                }
            }

            const finalParams = { ...persistentExecuteReaderParams, ...paramsAfterSql };
            const runnableSql = substituteParams(rawSql, finalParams);

            if (runnableSql.trim()) {
                recordQuery(runnableSql, executionTime, uniqueId, currentObjectContext);

                let nextSibling = element.nextElementSibling;
                if (!nextSibling || !nextSibling.classList.contains('runnable-sql-row')) {
                    createAndInsertSqlDisplay(runnableSql, element, true, uniqueId, currentObjectContext);
                }
            }
        }
    });

    if (queryAnalyticsData.length > 0 || cacheStats.hits > 0 || cacheStats.misses > 0) {
        createAnalyticsPanel(queryAnalyticsData);
    }
}

/**
 * Records a query for analytics and N+1 detection.
 */
function recordQuery(runnableSql, executionTime, id, context) {
    queryAnalyticsData.push({
        sql: runnableSql,
        time: executionTime,
        id: id,
        context: context
    });

    const normalized = normalizeSql(runnableSql);
    if (!n1Detection[normalized]) {
        n1Detection[normalized] = { count: 0, ids: [], sql: runnableSql };
    }
    n1Detection[normalized].count++;
    n1Detection[normalized].ids.push(id);
}

/**
 * Applies styles and highlights to trace rows based on category and content.
 */
function applyRowStyles(row, category, message) {
    const msgUpper = message.toUpperCase();

    // Transaction highlighting
    if (msgUpper.includes('COMMIT') || msgUpper.includes('ROLLBACK')) {
        row.style.backgroundColor = msgUpper.includes('COMMIT') ? '#e6ffec' : '#ffeef0';
        row.style.borderLeft = `5px solid ${msgUpper.includes('COMMIT') ? '#28a745' : '#d73a49'}`;
    }

    // Category Color Coding
    const categoryLower = category.toLowerCase();
    let borderLeft = '';
    if (categoryLower.includes('data.ado')) borderLeft = '4px solid #007bff'; // DB
    else if (categoryLower.includes('http')) borderLeft = '4px solid #6f42c1'; // HTTP
    else if (categoryLower.includes('cache')) borderLeft = '4px solid #ffc107'; // Cache

    if (borderLeft) {
        const firstCell = row.cells[0];
        if (firstCell) firstCell.style.borderLeft = borderLeft;
    }
}

/**
 * Finds parameters from lines like "ExecuteReader: Parameters AVName='Value'"
 */
function findExecuteReaderParameters(textBlock) {
    const allParams = {};
    const lineRegex = /ExecuteReader:\s*Parameters\s*([^\n<]*)/gi;
    let lineMatch = lineRegex.exec(textBlock);
    if (lineMatch && lineMatch[1]) {
        const paramsString = lineMatch[1].trim();
        const individualParamRegex = /([\w@$:]+)\s*=\s*(?:'((?:[^']|'')*)'|(\bNULL\b)|([-.\w\d]+(?:\s+[-\w\d]+)*))/g;
        let paramMatch;
        while ((paramMatch = individualParamRegex.exec(paramsString)) !== null) {
            const paramName = paramMatch[1];
            let sqlFormattedValue;
            if (paramMatch[2] !== undefined) {
                let strValue = paramMatch[2].replace(/''/g, "'");
                sqlFormattedValue = `'${strValue.replace(/'/g, "''")}'`;
            } else if (paramMatch[3] !== undefined) {
                sqlFormattedValue = "NULL";
            } else if (paramMatch[4] !== undefined) {
                let unquotedValue = paramMatch[4];
                if (!isNaN(parseFloat(unquotedValue)) && isFinite(unquotedValue) && !unquotedValue.includes(' ')) {
                    sqlFormattedValue = unquotedValue;
                } else {
                    sqlFormattedValue = `'${unquotedValue.replace(/'/g, "''")}'`;
                }
            }
            if (sqlFormattedValue !== undefined) allParams[paramName] = sqlFormattedValue;
        }
    }
    return allParams;
}

/**
 * Finds parameters from lines like "Start GxCommand.ExecuteNonQuery: Parameters Name='Value'"
 * @param {string} textBlock The text content of the cell.
 * @returns {Object} A map of parameter names to their SQL-formatted values.
 */
function findNonQueryParameters(textBlock) {
    const allParams = {};
    // Regex to find the line with ExecuteNonQuery parameters
    const lineRegex = /ExecuteNonQuery:\s*Parameters\s*([^\n<]*)/i;
    let lineMatch = lineRegex.exec(textBlock);

    if (lineMatch && lineMatch[1]) {
        const paramsString = lineMatch[1].trim();
        // Regex to parse individual parameters (name='value' or name=number)
        const individualParamRegex = /([\w@$:]+)\s*=\s*(?:'((?:[^']|'')*)'|(\bNULL\b)|([-.\w\d]+(?:\s+[-\w\d]+)*))/g;
        let paramMatch;

        while ((paramMatch = individualParamRegex.exec(paramsString)) !== null) {
            const paramName = paramMatch[1];
            let sqlFormattedValue;

            if (paramMatch[2] !== undefined) { // String value
                let strValue = paramMatch[2].replace(/''/g, "'");
                sqlFormattedValue = `'${strValue.replace(/'/g, "''")}'`;
            } else if (paramMatch[3] !== undefined) { // NULL value
                sqlFormattedValue = "NULL";
            } else if (paramMatch[4] !== undefined) { // Unquoted value (number, etc.)
                let unquotedValue = paramMatch[4];
                if (!isNaN(parseFloat(unquotedValue)) && isFinite(unquotedValue) && !unquotedValue.includes(' ')) {
                    sqlFormattedValue = unquotedValue;
                } else {
                    sqlFormattedValue = `'${unquotedValue.replace(/'/g, "''")}'`;
                }
            }

            if (sqlFormattedValue !== undefined) {
                allParams[paramName] = sqlFormattedValue;
            }
        }
    }
    return allParams;
}

/**
 * Main function to process trace entries on the page.
 */
function processTracePage() {
    let traceElements = Array.from(document.querySelectorAll('#TraceTable tbody tr'));
    if (traceElements.length === 0) {
        traceElements = Array.from(document.querySelectorAll('table tr'));
    }
    if (traceElements.length === 0) {
        console.warn(getMessage("noTraceTableFound"));
        return;
    }

    let persistentExecuteReaderParams = {};
    let sqlBlockCounter = 0;
    let pendingUpdate = null; // To hold an UPDATE statement waiting for its params

    traceElements.forEach((element) => {
        if (element.tagName !== 'TR') return;

        const cells = element.querySelectorAll('td');
        if (cells.length < 2) return;

        const mainCellContent = cells[1].innerHTML;
        const mainCellText = cells[1].textContent; // Use textContent for param search

        // 1. Check if we are waiting for parameters for a pending UPDATE
        if (pendingUpdate) {
            const nonQueryParams = findNonQueryParameters(mainCellText);
            if (Object.keys(nonQueryParams).length > 0) {
                // Found params for our pending update!
                const runnableSql = substituteParams(pendingUpdate.sql, nonQueryParams);

                // The execution time is in the *current* row (the parameter row)
                const executionTime = findExecutionTime(cells[cells.length - 1].textContent);

                if (runnableSql.trim()) {
                    queryAnalyticsData.push({
                        sql: runnableSql,
                        time: executionTime,
                        id: pendingUpdate.uniqueId
                    });
                }

                // Insert the display block after the original UPDATE row
                createAndInsertSqlDisplay(runnableSql, pendingUpdate.element, true, pendingUpdate.uniqueId);
            }
            // We only look one line ahead, so reset pendingUpdate regardless.
            pendingUpdate = null;
        }

        // 2. The original logic for finding SQL statements
        const executeReaderParams = findExecuteReaderParameters(mainCellContent);
        if (Object.keys(executeReaderParams).length > 0) {
            persistentExecuteReaderParams = executeReaderParams;
        }

        const sqlMatchResult = findSqlStatement(mainCellContent);

        if (sqlMatchResult) {
            const { statement: rawSql, matchEndIndexInBlock } = sqlMatchResult;
            const uniqueId = `sql-block-${sqlBlockCounter++}`;

            // 3. Divert logic for UPDATE statements that don't have inline params
            const paramsAfterSql = findAndParseParameters(mainCellContent.substring(matchEndIndexInBlock || 0));
            if (rawSql.trim().toUpperCase().startsWith('UPDATE') && Object.keys(paramsAfterSql).length === 0) {
                // It's an UPDATE and has no immediate params. Store it and wait for the next row.
                pendingUpdate = {
                    sql: rawSql,
                    element: element, // The TR element where the UPDATE was found
                    uniqueId: uniqueId
                };
                return; // Continue to the next row
            }

            // 4. Existing logic for SELECT, INSERT, DELETE, and UPDATEs with inline params
            let executionTime = 0;
            const nextRow = element.nextElementSibling;
            if (nextRow && nextRow.tagName === 'TR') {
                const nextRowCells = nextRow.querySelectorAll('td');
                if (nextRowCells.length > 0) {
                    executionTime = findExecutionTime(nextRowCells[nextRowCells.length - 1].textContent);
                }
            }

            const finalParams = { ...persistentExecuteReaderParams, ...paramsAfterSql };
            const runnableSql = substituteParams(rawSql, finalParams);

            if (runnableSql.trim()) {
                queryAnalyticsData.push({
                    sql: runnableSql,
                    time: executionTime,
                    id: uniqueId
                });
            }

            let nextSibling = element.nextElementSibling;
            if (!nextSibling || !nextSibling.classList.contains('runnable-sql-row')) {
                createAndInsertSqlDisplay(runnableSql, element, true, uniqueId);
            }
        }
    });

    if (queryAnalyticsData.length > 0) {
        createAnalyticsPanel(queryAnalyticsData);
    }
}

/**
 * Finds a SQL statement within a block of text.
 */
function findSqlStatement(textBlock) {
    // This is the robust, two-stage regex that was working correctly.
    const preparedCommandRegex = new RegExp('GetPreparedCommand\\s*(?:&nbsp;)*stmt:\\s*((?:SELECT|INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|WITH)\\b[\\s\\S]+?)(?=\\s*(?:<br\\s*\\/?>|Parameters:|-- Parameters:|$))', 'i');
    let match = preparedCommandRegex.exec(textBlock);
    if (match && match[1]) {
        let statement = match[1].trim();
        const tempElem = document.createElement('textarea');
        tempElem.innerHTML = statement;
        statement = tempElem.value;
        return { statement: statement, matchEndIndexInBlock: match.index + match[0].length };
    }

    const genericSqlRegex = new RegExp('((?:SELECT|INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|WITH)\\b[\\s\\S]+?)(?=\\s*(?:<br\\s*\/?>|Parameters:|-- Parameters:|$|-- End SQL|COMMIT;|ROLLBACK;))', 'i');
    match = genericSqlRegex.exec(textBlock);
    if (match && match[1]) {
        let statement = match[1].trim();
        const tempElem = document.createElement('textarea');
        tempElem.innerHTML = statement;
        statement = tempElem.value;
        return { statement: statement, matchEndIndexInBlock: match.index + match[0].length };
    }

    return null;
}

/**
 * Finds and parses parameters from a generic "Parameters:" section.
 */
function findAndParseParameters(textBlockAfterSql) {
    const params = {};
    const paramHeaderRegex = /(?:^|<br\s*\/?>)\s*(?:--\s*)?Parameters:\s*([\s\S]*)/i;
    const paramHeaderMatch = paramHeaderRegex.exec(textBlockAfterSql);
    if (!paramHeaderMatch || !paramHeaderMatch[1]) return params;

    const lines = paramHeaderMatch[1].split(/\s*(?:<br\s*\/?>|\n)\s*/i);
    const paramLineRegex = /^\s*([@:\w\$_][\w\d\$_]*)\s*[:=]\s*(?:'((?:[^']|'')*)'|(\bNULL\b)|([-.\w\d\x20]+))/i;
    lines.forEach(line => {
        const match = paramLineRegex.exec(line.trim());
        if (match) {
            const paramName = match[1];
            let paramValueForSql;
            if (match[2] !== undefined) {
                let strValue = match[2].replace(/''/g, "'");
                paramValueForSql = `'${strValue.replace(/'/g, "''")}'`;
            } else if (match[3] !== undefined) {
                paramValueForSql = "NULL";
            } else if (match[4] !== undefined) {
                let unquotedValue = match[4].trim();
                if (!isNaN(parseFloat(unquotedValue)) && isFinite(unquotedValue) && unquotedValue.indexOf(' ') === -1) {
                    paramValueForSql = unquotedValue;
                } else if (unquotedValue.toLowerCase() === 'true') paramValueForSql = '1';
                else if (unquotedValue.toLowerCase() === 'false') paramValueForSql = '0';
                else paramValueForSql = `'${unquotedValue.replace(/'/g, "''")}'`;
            }
            if (paramValueForSql !== undefined) params[paramName] = paramValueForSql;
        }
    });
    return params;
}

/**
 * Substitutes parameter values into a SQL string.
 */
function substituteParams(sql, params) {
    let finalSql = sql;
    if (!params) return finalSql;
    for (const paramNameKey in params) {
        if (params.hasOwnProperty(paramNameKey)) {
            const value = params[paramNameKey];
            const baseName = paramNameKey.replace(/^[@:]/, '');
            const escapedBaseName = escapeRegExp(baseName);
            finalSql = finalSql.replace(new RegExp('[@:]' + escapedBaseName + '(?![\\w\\d$_])', 'gi'), value);
            finalSql = finalSql.replace(/\u00A0/g, '');
        }
    }
    return finalSql;
}

/**
 * Escapes special characters in a string for use in a regular expression.
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights SQL syntax in a string.
 */
function highlightSqlSyntax(sqlString) {
    let highlightedSql = sqlString;
    const escapeHtml = (unsafe) => {
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };
    highlightedSql = escapeHtml(highlightedSql);
    highlightedSql = highlightedSql.replace(/(--[^\n&lt;]*)/g, '<span class="sql-comment">$1</span>');
    highlightedSql = highlightedSql.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="sql-comment">$1</span>');
    highlightedSql = highlightedSql.replace(/(&#039;(?:[^&]|&(?!#039;)|&#039;&#039;)*&#039;)/g, '<span class="sql-string">$1</span>');
    highlightedSql = highlightedSql.replace(/([:@][a-zA-Z0-9_]+)/g, '<span class="sql-placeholder">$1</span>');
    highlightedSql = highlightedSql.replace(/\b(\d+\.?\d*|\.\d+)\b/g, '<span class="sql-number">$1</span>');
    const keywords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'ON', 'AS', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'VIEW', 'INDEX', 'PROCEDURE', 'FUNCTION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'EXISTS', 'NULL', 'IS', 'DISTINCT', 'ALL', 'ANY', 'UNION', 'WITH', 'ROWNUM', 'OVER', 'PARTITION'];
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
    highlightedSql = highlightedSql.replace(keywordRegex, '<span class="sql-keyword">$1</span>');
    const functions = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'UPPER', 'LOWER', 'SUBSTR', 'TRIM', 'ROUND', 'COALESCE', 'NVL', 'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'REPLACE', 'GETDATE', 'NOW', 'SYSDATE', 'DATEADD', 'DATEDIFF', 'CONCAT'];
    const functionRegex = new RegExp(`\\b(${functions.join('|')})\\b(?=\\s*\\()`, 'gi');
    highlightedSql = highlightedSql.replace(functionRegex, '<span class="sql-function">$1</span>');
    const operators = ['<=', '>=', '<>', '!=', '=', '<', '>', '\\|\\|', '\\+', '-', '\\*', '/', '%'];
    operators.forEach(op => {
        let opRegexStr = op.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const operatorRegex = new RegExp(`(?<!<[^>]*?)( ${opRegexStr})(?![^<]*?>)`, 'g');
        highlightedSql = highlightedSql.replace(operatorRegex, `<span class="sql-operator">$1</span>`);
    });
    highlightedSql = highlightedSql.replace(/\n/g, '<br>');
    return highlightedSql;
}

/**
 * Creates and inserts the display element for the runnable SQL.
 */
function createAndInsertSqlDisplay(runnableSql, insertionReferenceNode, isTableRowContext, uniqueId, context) {
    if (!runnableSql || runnableSql.trim() === '') return;

    const contentContainer = document.createElement('div');
    contentContainer.className = 'runnable-sql-container';
    contentContainer.style.cssText = `
        margin-top: 8px; margin-bottom: 8px; padding: 12px;
        border: 1px solid rgba(0, 123, 255, 0.3); border-radius: 10px; background-color: #f8fbff;
        font-family: 'JetBrains Mono', Consolas, monospace;
        font-size: 13px; line-height: 1.5; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    `;

    if (!document.getElementById('sql-enhancer-styles')) {
        const style = document.createElement('style');
        style.id = 'sql-enhancer-styles';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
            .sql-keyword    { color: #0033cc; font-weight: 700; }
            .sql-string     { color: #a31515; }
            .sql-number     { color: #098658; }
            .sql-comment    { color: #008000; font-style: italic; }
            .sql-operator   { color: #555555; }
            .sql-function   { color: #795e26; font-weight: 600; }
            .sql-placeholder{ color: #d13438; font-weight: 700; }
            .runnable-sql-code {
                background-color: #ffffff !important; 
                padding: 12px;
                border: 1px solid #e1e4e8; 
                border-radius: 8px;
            }
            .copy-sql-button {
                background-color: #28a745; color: white; border: none; padding: 6px 14px;
                border-radius: 6px; cursor: pointer; font-family: 'Inter', sans-serif;
                font-size: 12px; font-weight: 600; margin-top: 10px; transition: all 0.2s;
            }
            .copy-sql-button:hover { background-color: #218838; transform: translateY(-1px); }
        `;
        document.head.appendChild(style);
    }

    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;`;

    const title = document.createElement('div');
    title.innerHTML = `<strong>SQL Ready</strong> <span style="color: #6c757d; font-size: 11px; margin-left:8px;">${context || 'Unknown Object'}</span>`;
    title.style.color = '#0056b3';
    header.appendChild(title);

    contentContainer.appendChild(header);

    const pre = document.createElement('pre');
    pre.className = 'runnable-sql-code';
    pre.innerHTML = highlightSqlSyntax(runnableSql);
    pre.style.cssText = `
        white-space: pre-wrap; word-wrap: break-word; max-height: 300px; 
        overflow-y: auto; color: #24292e; font-size: 12px; margin: 0;
    `;
    contentContainer.appendChild(pre);

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-sql-button';
    copyButton.textContent = getMessage("copySqlButton");
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(runnableSql).then(() => {
            copyButton.textContent = getMessage("copiedButton");
            copyButton.style.backgroundColor = '#007bff';
            setTimeout(() => {
                copyButton.textContent = getMessage("copySqlButton");
                copyButton.style.backgroundColor = '#28a745';
            }, 2000);
        }).catch(err => {
            console.error('SQL Trace Enhancer: Falha ao copiar SQL: ', err);
        });
    });
    contentContainer.appendChild(copyButton);

    let displayElementToInsert;
    if (isTableRowContext) {
        const newRow = document.createElement('tr');
        newRow.id = uniqueId;
        newRow.className = 'runnable-sql-row';
        const newCell = document.createElement('td');
        newCell.colSpan = insertionReferenceNode.cells.length;
        newCell.style.padding = "0px 5px";
        newCell.appendChild(contentContainer);
        newRow.appendChild(newCell);
        displayElementToInsert = newRow;
    } else {
        const wrapperDiv = document.createElement('div');
        wrapperDiv.id = uniqueId;
        wrapperDiv.className = 'runnable-sql-container-wrapper';
        wrapperDiv.appendChild(contentContainer);
        displayElementToInsert = wrapperDiv;
    }

    if (insertionReferenceNode && insertionReferenceNode.parentNode) {
        insertionReferenceNode.parentNode.insertBefore(displayElementToInsert, insertionReferenceNode.nextSibling);
    }
}

// --- Initialization and Message Handling ---
function initialize(lang) {
    const messagesUrl = chrome.runtime.getURL(`_locales/${lang}/messages.json`);

    fetch(messagesUrl)
        .then(response => response.json())
        .then(messages => {
            MESSAGES = messages;
            if (queryAnalyticsData.length > 0) {
                createAnalyticsPanel(queryAnalyticsData); // Re-create panel with new language
            } else {
                if (document.readyState === "complete" || document.readyState === "interactive") {
                    setTimeout(processTracePage, 700);
                } else {
                    document.addEventListener("DOMContentLoaded", () => setTimeout(processTracePage, 700));
                }
            }
        })
        .catch(error => console.error('Error loading translation files:', error));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateLanguage") {
        let lang = request.language;
        if (lang !== 'en' && lang !== 'pt_BR') {
            lang = 'en'; // Fallback
        }
        initialize(lang);
        sendResponse({ status: "Language updated" });
    }
    return true; // Indicates that the response is sent asynchronously
});

// --- Initial call ---
chrome.storage.sync.get('language', function (data) {
    let lang = data.language || chrome.i18n.getUILanguage().split('-')[0];
    if (lang !== 'en' && lang !== 'pt_BR') {
        lang = 'en';
    }
    initialize(lang);
});