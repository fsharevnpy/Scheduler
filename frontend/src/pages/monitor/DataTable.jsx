import { formatValue } from "./monitorUtils.js";

export default function DataTable({
  title,
  columns,
  rows,
  emptyMessage,
  embedded = false,
  tableClassName = "",
  colClasses = [],
}) {
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
              {rows.map((row, index) => (
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
        </div>
      )}
    </>
  );

  if (embedded) {
    return content;
  }

  return <article className="dashboard-section">{content}</article>;
}
