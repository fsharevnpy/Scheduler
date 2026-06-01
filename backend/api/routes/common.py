from schemas.auth import CurrentUser


VALID_CLASS_STATUS = {"OPEN", "ASSIGNED", "CANCELLED", "NEED_REPLACEMENT"}
VALID_LEAVE_STATUS = {"REQUESTED", "APPROVED", "REJECTED", "CANCELLED"}


def get_manageable_roles(current_user: CurrentUser) -> set[str]:
    if current_user.role == "developer":
        return {"developer", "manager", "teacher"}
    if current_user.role == "manager":
        return {"manager", "teacher"}
    return set()
