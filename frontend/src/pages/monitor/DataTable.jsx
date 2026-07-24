import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "../../lib/i18n.jsx";
import { formatValue } from "./monitorUtils.js";

function buildRowKey(row, index) {
  const keyParts = [
    row?.id,
    row?.record_id,
    row?.request_id,
    row?.class_id,
    row?.teacher_id,
    row?.user_code,
    row?.display_name,
    row?.checked_at,
    row?.check_out_at,
    row?.start_time,
    row?.end_time,
    row?.center_id,
    row?.center_label,
  ].filter((part) => part !== null && part !== undefined && part !== "");

  if (keyParts.length > 0) {
    return keyParts.join("::");
  }

  return `table-row-${index}`;
}

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
  const { t } = useLanguage();
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

  useEffect(() => {
    setPage(1);
  }, [rows]);

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
                <tr key={buildRowKey(row, index)}>
                  {columns.map((column) => (
                    <td key={`${buildRowKey(row, index)}-${column.key}`}>
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
                {t("pageOf", { page, pageCount })}
              </span>
              <div className="table-pagination-actions">
                <button
                  type="button"
                  className="table-action-button table-action-button-muted"
                  disabled={page === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t("previous")}
                </button>
                <button
                  type="button"
                  className="table-action-button"
                  disabled={page === pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                >
                  {t("next")}
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
