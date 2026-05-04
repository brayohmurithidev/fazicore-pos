from app.workers.celery_app import celery_app


@celery_app.task
def send_sms_receipt(phone: str, message: str) -> dict:
    # Placeholder — wire to SMS provider (e.g. Africa's Talking) when ready
    return {"status": "queued", "phone": phone}


@celery_app.task
def generate_report(org_id: int, report_type: str) -> dict:
    # Placeholder — async report generation
    return {"status": "queued", "org_id": org_id, "type": report_type}
