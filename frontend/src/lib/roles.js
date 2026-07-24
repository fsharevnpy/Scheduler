export function getRoleTitle(role, t = null) {
  if (role === "developer") {
    return t ? t("systemDeveloper") : "System Developer";
  }

  if (role === "manager") {
    return t ? t("operationsManager") : "Operations Manager";
  }

  if (role === "teacher") {
    return t ? t("teacher") : "Teacher";
  }

  return t ? t("account") : "Account";
}
