import DataTable from "./DataTable.jsx";
import StatusPill from "./StatusPill.jsx";
import TeacherClassCard from "./TeacherClassCard.jsx";

export default function TeacherMonitorView({ highlightedClasses, leaveRequests, teacherId, unassignedCount }) {
  return (
    <>
      <section className="monitor-grid monitor-grid-summary">
        <article className="info-card">
          <p className="eyebrow">Session</p>
          <h2>teacher</h2>
          <p className="subtle">Teacher ID: {teacherId || "-"}</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">Unassigned Count</p>
          <h2>{unassignedCount}</h2>
          <p className="subtle">Classes in your list that are not currently marked as assigned.</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">Leave Requests</p>
          <h2>{leaveRequests.length}</h2>
          <p className="subtle">Your personal leave request records.</p>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Your Classes</p>
            <h2>Current teaching classes</h2>
          </div>
        </div>
        {highlightedClasses.length === 0 ? (
          <p className="subtle">No classes are currently assigned to this teacher account.</p>
        ) : (
          <div className="class-highlight-grid">
            {highlightedClasses.map((item) => (
              <TeacherClassCard key={item.class_id} item={item} />
            ))}
          </div>
        )}
      </section>

      <DataTable
        title="My Leave Requests"
        columns={[
          { key: "request_id", label: "Request ID" },
          { key: "class_id", label: "Class ID" },
          { key: "center_id", label: "Center" },
          { key: "request_date", label: "Date" },
          { key: "reason", label: "Reason" },
          {
            key: "status",
            label: "Status",
            render: (row) => <StatusPill value={row.status} />,
          },
        ]}
        rows={leaveRequests}
        emptyMessage="No leave requests found for this teacher."
      />
    </>
  );
}
