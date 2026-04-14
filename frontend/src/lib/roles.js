export function getRoleTitle(role) {
  if (role === "developer") {
    return "System Developer";
  }

  if (role === "manager") {
    return "Operations Manager";
  }

  if (role === "teacher") {
    return "Teacher";
  }

  return "Account";
}
