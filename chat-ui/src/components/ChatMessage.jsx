import ResultTable from "./ResultTable.jsx";

const TOOL_META = {
  nl_to_sql: { label: "nl_to_sql", color: "var(--tool-nl)" },
  execute_sql: { label: "execute_sql", color: "var(--tool-sql)" },
  list_tables: { label: "list_tables", color: "var(--tool-tables)" },
};

export default function ChatMessage({ message }) {
  const { role, content, tool, sql, table, error } = message;

  if (role === "user") {
    return (
      <div className="message user">
        <div className="bubble user-bubble">{content}</div>
      </div>
    );
  }

  const meta = tool ? TOOL_META[tool] : null;

  return (
    <div className="message assistant">
      <div className="bubble assistant-bubble">
        {meta && (
          <div
            className="tool-badge"
            style={{ "--badge-color": meta.color }}
          >
            <span className="tool-dot" />
            {meta.label}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        {!tool && !error && content && <p className="plain-text">{content}</p>}

        {sql && (
          <div className="sql-block">
            <div className="sql-label">Generated SQL</div>
            <pre className="sql-code">{sql}</pre>
          </div>
        )}

        {table && table.columns?.length > 0 && (
          <div className="result-section">
            <div className="result-label">
              Results —{" "}
              <span className="row-count">
                {table.rows.length} row{table.rows.length !== 1 ? "s" : ""}
              </span>
            </div>
            <ResultTable columns={table.columns} rows={table.rows} />
          </div>
        )}

        {table && table.columns?.length === 0 && sql && (
          <p className="no-results">No rows returned.</p>
        )}
      </div>
    </div>
  );
}
