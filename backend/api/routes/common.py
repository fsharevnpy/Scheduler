from schemas.auth import CurrentUser


VALID_CLASS_STATUS = {"OPEN", "ASSIGNED", "CANCELLED", "NEED_REPLACEMENT"}
VALID_LEAVE_STATUS = {"REQUESTED", "APPROVED", "CANCELLED"}


def get_manageable_roles(current_user: CurrentUser) -> set[str]:
    if current_user.role == "developer":
        return {"developer", "manager", "teacher"}
    if current_user.role == "manager":
        return {"manager", "teacher"}
    return set()


def get_day_of_week_sql() -> str:
    return """
        CASE
            WHEN EXTRACT(ISODOW FROM c.class_date) = 1 THEN 'T2'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 2 THEN 'T3'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 3 THEN 'T4'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 4 THEN 'T5'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 5 THEN 'T6'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 6 THEN 'T7'
            ELSE 'CN'
        END
    """
