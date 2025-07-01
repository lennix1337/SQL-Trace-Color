// content.js

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
 * Creates and injects the SQL Summary & Analytics floating panel.
 * @param {Array<Object>} queryStats - Array of objects with {sql, time, id}.
 */
function createAnalyticsPanel(queryStats) {
    const existingPanel = document.getElementById('sql-analytics-panel');
    if (existingPanel) {
        existingPanel.remove(); // Remove old panel to refresh data
    }

    const panel = document.createElement('div');
    panel.id = 'sql-analytics-panel';
    panel.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 380px; max-height: 90vh;
        background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        z-index: 10001; display: flex; flex-direction: column;
    `;

    const header = document.createElement('div');
    header.id = 'sql-analytics-panel-header';
    header.style.cssText = `
        padding: 10px 15px; background-color: #e9ecef; border-bottom: 1px solid #dee2e6;
        cursor: move; border-top-left-radius: 8px; border-top-right-radius: 8px;
        display: flex; justify-content: space-between; align-items: center;
    `;

    const title = document.createElement('h3');
    title.textContent = 'SQL Summary & Analytics';
    title.style.cssText = 'margin: 0; font-size: 16px; color: #212529; font-weight: 600;';

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '–';
    toggleBtn.style.cssText = `
        background: #ced4da; border: none; border-radius: 50%; width: 24px; height: 24px;
        font-size: 18px; line-height: 24px; text-align: center; cursor: pointer; color: #495057;
    `;

    header.appendChild(title);
    header.appendChild(toggleBtn);
    panel.appendChild(header);

    const content = document.createElement('div');
    content.id = 'sql-analytics-content';
    content.style.cssText = 'padding: 15px; overflow-y: auto;';

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

    // --- Populate Content ---
    let contentHTML = `
        <div style="margin-bottom: 15px;">
            <h4 style="margin: 0 0 8px; font-size: 14px; color: #495057;">Overall</h4>
            <p style="margin: 4px 0; font-size: 13px;"><strong>Total Queries:</strong> ${totalQueries}</p>
            <p style="margin: 4px 0; font-size: 13px;"><strong>Total Execution Time:</strong> ${totalTime.toLocaleString()} ms</p>
        </div>
        <div style="margin-bottom: 15px;">
            <h4 style="margin: 0 0 8px; font-size: 14px; color: #495057;">Query Types</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 13px;">
    `;
    for (const type in queryTypes) {
        if (queryTypes[type] > 0) {
            contentHTML += `<span><strong>${type}:</strong> ${queryTypes[type]}</span>`;
        }
    }
    contentHTML += `
            </div>
        </div>
        <div>
            <h4 style="margin: 0 0 10px; font-size: 14px; color: #495057;">Top 5 Slowest Queries (Click to view)</h4>
            <ul id="slowest-queries-list" style="list-style: none; margin: 0; padding: 0; font-size: 12px;">
    `;

    slowestQueries.forEach((q, i) => {
        contentHTML += `
            <li data-target-id="${q.id}" style="background-color: #fff; border: 1px solid #e9ecef; padding: 8px; border-radius: 4px; margin-bottom: 8px; cursor: pointer;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <span style="font-weight: bold; color: #c0392b;">${q.time.toLocaleString()} ms</span>
                    <span style="color: #6c757d;">#${i + 1}</span>
                </div>
                <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; background-color: #f8f9fa; padding: 5px; border-radius: 3px; color: #212529; max-height: 60px; overflow-y: auto;">${q.sql.replace(/</g, '&lt;')}</pre>
            </li>
        `;
    });

    contentHTML += `
            </ul>
        </div>
    `;

    content.innerHTML = contentHTML;
    panel.appendChild(content);
    document.body.appendChild(panel);

    // --- Add Interactivity ---
    let isMinimized = true; // Panel starts minimized by default
    chrome.storage.sync.get('openPanelByDefault', function(data) {
        if (data.openPanelByDefault) {
            isMinimized = false;
        }
        content.style.display = isMinimized ? 'none' : 'block';
        toggleBtn.textContent = isMinimized ? '+' : '–';
        panel.style.maxHeight = isMinimized ? 'none' : '90vh';
    });

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMinimized = !isMinimized;
        content.style.display = isMinimized ? 'none' : 'block';
        toggleBtn.textContent = isMinimized ? '+' : '–';
        panel.style.maxHeight = isMinimized ? 'none' : '90vh';
    });

    makePanelDraggable(panel, header);

    const slowestList = document.getElementById('slowest-queries-list');
    if (slowestList) {
        slowestList.addEventListener('click', (e) => {
            if (e.target.closest('pre')) {
                return;
            }
            const targetLi = e.target.closest('li');
            if (!targetLi) return;
            const targetId = targetLi.dataset.targetId;
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetElement.style.transition = 'background-color 0.5s ease';
                targetElement.style.backgroundColor = '#fff8c4';
                setTimeout(() => {
                    targetElement.style.backgroundColor = '';
                }, 2000);
            }
        });
    }
}

/**
 * Makes the analytics panel draggable.
 */
function makePanelDraggable(panel, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = dragMouseDown;
    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        panel.style.top = (panel.offsetTop - pos2) + "px";
        panel.style.left = (panel.offsetLeft - pos1) + "px";
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
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
        console.warn("SQL Trace Enhancer: No trace table rows found.");
        return;
    }

    let queryAnalytics = [];
    let persistentExecuteReaderParams = {};
    let sqlBlockCounter = 0;

    traceElements.forEach((element) => {
        if (element.tagName !== 'TR') return;

        const cells = element.querySelectorAll('td');
        if (cells.length < 2) return;

        const mainCellContent = cells[1].innerHTML;

        const executeReaderParams = findExecuteReaderParameters(mainCellContent);
        if (Object.keys(executeReaderParams).length > 0) {
            persistentExecuteReaderParams = executeReaderParams;
        }

        const sqlMatchResult = findSqlStatement(mainCellContent);

        if (sqlMatchResult) {
            const uniqueId = `sql-block-${sqlBlockCounter++}`;
            let executionTime = 0;
            // Check the next row for execution time
            const nextRow = element.nextElementSibling;
            if (nextRow && nextRow.tagName === 'TR') {
                const nextRowCells = nextRow.querySelectorAll('td');
                if (nextRowCells.length > 0) {
                    // Assuming the time is in the last td of the next row
                    executionTime = findExecutionTime(nextRowCells[nextRowCells.length - 1].textContent);
                }
            }

            const { statement: rawSql, matchEndIndexInBlock } = sqlMatchResult;
            const remainingContent = mainCellContent.substring(matchEndIndexInBlock || 0);
            const paramsAfterSql = findAndParseParameters(remainingContent);
            const finalParams = { ...persistentExecuteReaderParams, ...paramsAfterSql };
            const runnableSql = substituteParams(rawSql, finalParams);

            if (runnableSql.trim()) {
                queryAnalytics.push({
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

    if (queryAnalytics.length > 0) {
        createAnalyticsPanel(queryAnalytics);
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
        const operatorRegex = new RegExp(`(?<!<[^>]*?)(${opRegexStr})(?![^<]*?>)`, 'g');
        highlightedSql = highlightedSql.replace(operatorRegex, `<span class="sql-operator">$1</span>`);
    });
    highlightedSql = highlightedSql.replace(/\n/g, '<br>');
    return highlightedSql;
}

/**
 * Creates and inserts the display element for the runnable SQL.
 */
function createAndInsertSqlDisplay(runnableSql, insertionReferenceNode, isTableRowContext, uniqueId) {
    if (!runnableSql || runnableSql.trim() === '') return;

    const contentContainer = document.createElement('div');
    contentContainer.className = 'runnable-sql-container';
    contentContainer.style.cssText = `
        margin-top: 5px; margin-bottom: 5px; padding: 10px;
        border: 1px solid #007bff; border-radius: 6px; background-color: #f0f8ff;
        font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
        font-size: 13px; line-height: 1.5; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    `;

    if (!document.getElementById('sql-enhancer-styles')) {
        const style = document.createElement('style');
        style.id = 'sql-enhancer-styles';
        style.textContent = `
            .sql-keyword    { color: #0000FF; font-weight: bold; }
            .sql-string     { color: #A31515; }
            .sql-number     { color: #098658; }
            .sql-comment    { color: #008000; font-style: italic; }
            .sql-operator   { color: #777777; }
            .sql-function   { color: #795E26; font-weight: bold; }
            .sql-placeholder{ color: #E50000; font-weight: bold; }
            .runnable-sql-code {
                background-color: #ffffff !important; 
                padding: 10px;
                border: 1px solid #ced4da; 
                border-radius: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    const title = document.createElement('h4');
    title.textContent = 'SQL com Parâmetros (Pronto para Copiar):';
    title.style.cssText = `margin-top: 0; margin-bottom: 8px; font-size: 14px; color: #0056b3; font-weight: bold;`;
    contentContainer.appendChild(title);

    const pre = document.createElement('pre');
    pre.className = 'runnable-sql-code';
    pre.innerHTML = highlightSqlSyntax(runnableSql);
    pre.style.cssText = `
        white-space: pre-wrap;
        word-wrap: break-word;
        max-height: 250px; 
        overflow-y: auto; 
        color: #212529;
        font-size: 12px;
    `;
    contentContainer.appendChild(pre);

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-sql-button';
    copyButton.textContent = 'Copiar SQL';
    copyButton.style.cssText = `
        margin-top: 8px; padding: 6px 12px; background-color: #28a745; 
        color: white; border: none; border-radius: 4px; cursor: pointer;
        font-size: 12px; transition: background-color 0.2s ease;
    `;
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(runnableSql).then(() => {
            copyButton.textContent = 'Copiado!';
            copyButton.style.backgroundColor = '#007bff';
            setTimeout(() => {
                copyButton.textContent = 'Copiar SQL';
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

// --- Initial call ---
if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(processTracePage, 700);
} else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(processTracePage, 700));
}