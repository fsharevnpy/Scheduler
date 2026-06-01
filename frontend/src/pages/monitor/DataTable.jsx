import { useEffect, useMemo, useState } from "react";

import { formatValue } from "./monitorUtils.js";

export default function DataTable({
  title,
  columns,
  rows,
  emptyMessage,
  embedded = false,
  tableClassName = "",
  colClasses = [],
  pageSize = null,
}) {
  const [page, setPage] = useState(1);
  const shouldPaginate = Number.isInteger(pageSize) && pageSize > 0 && rows.length > pageSize;
  const pageCount = shouldPaginate ? Math.ceil(rows.length / pageSize) : 1;
  const visibleRows = useMemo(() => {
    if (!shouldPaginate) {
      return rows;
    }

    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows, shouldPaginate]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const content = (
    <>
      {embedded ? null : (
        <div className="section-head">
          <div>
            <p className="eyebrow">{title}</p>
            <h2>{title}</h2>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="subtle">{emptyMessage}</p>
      ) : (
        <div className="table-wrap">
          <table className={`data-table ${tableClassName}`.trim()}>
            {colClasses.length > 0 ? (
              <colgroup>
                {colClasses.map((className, index) => (
                  <col key={`${className}-${index}`} className={className} />
                ))}
              </colgroup>
            ) : null}
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.id || row.class_id || row.teacher_id || row.request_id || row.user_code || index}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.render ? column.render(row) : formatValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {shouldPaginate ? (
            <div className="table-pagination">
              <span>
                Page {page} of {pageCount}
              </span>
              <div className="table-pagination-actions">
                <button
                  type="button"
                  className="table-action-button table-action-button-muted"
                  disabled={page === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="table-action-button"
                  disabled={page === pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  if (embedded) {
    return content;
  }

  return <article className="dashboard-section">{content}</article>;
}
