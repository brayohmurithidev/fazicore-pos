import random
import string
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.inventory import TransactionType
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.repositories.inventory import InventoryRepository
from app.repositories.order import OrderRepository
from app.repositories.product import ProductRepository
from app.schemas.order import OrderCreate, OrderEdit, OrderVoid


def _generate_order_number(org_prefix: str, today: date, sequence: int) -> str:
    prefix = org_prefix.upper()[:4]
    date_str = today.strftime("%Y%m%d")
    return f"{prefix}-{date_str}-{sequence:05d}"


class OrderService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.order_repo = OrderRepository(session)
        self.product_repo = ProductRepository(session)
        self.inventory_repo = InventoryRepository(session)

    async def create_order(
        self,
        org_id: int,
        cashier_id: int,
        cashier_name: str | None,
        branch_id: int | None,
        org_slug: str,
        data: OrderCreate,
    ) -> Order:
        today = datetime.now(timezone.utc).date()
        count = await self.order_repo.count_today_for_org(org_id, today)
        order_number = _generate_order_number(org_slug, today, count + 1)

        subtotal = 0.0
        tax_amount = 0.0
        order_items = []

        for item_data in data.items:
            item_total = round(
                (item_data.unit_price * item_data.quantity) - item_data.discount_amount, 2
            )
            subtotal += item_total

            if item_data.product_id:
                product = await self.product_repo.get(item_data.product_id)
                if product and product.track_inventory:
                    inv = await self.inventory_repo.get_by_product_branch(
                        item_data.product_id, branch_id
                    )
                    if inv is None:
                        inv = await self.inventory_repo.get_by_product_branch(
                            item_data.product_id, None
                        )
                    if inv is not None:
                        if inv.available_quantity < item_data.quantity:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Insufficient stock for '{item_data.product_name}'",
                            )
                        from app.models.inventory import TransactionType
                        await self.inventory_repo.adjust(
                            inv,
                            -item_data.quantity,
                            TransactionType.SALE,
                            cashier_id,
                            f"Order {order_number}",
                        )

            order_items.append(
                OrderItem(
                    product_id=item_data.product_id,
                    product_name=item_data.product_name,
                    product_sku=item_data.product_sku,
                    quantity=item_data.quantity,
                    unit_price=item_data.unit_price,
                    discount_amount=item_data.discount_amount,
                    total=item_total,
                )
            )

        subtotal = round(subtotal, 2)
        discount_amount = round(data.discount_amount, 2)
        taxable = subtotal - discount_amount
        tax_amount = 0.0
        total = round(taxable, 2)
        amount_paid = round(data.amount_paid, 2)
        change_given = round(max(0.0, amount_paid - total), 2)

        order = Order(
            org_id=org_id,
            branch_id=branch_id if branch_id is not None else data.branch_id,
            order_number=order_number,
            customer_id=data.customer_id,
            cashier_id=cashier_id,
            cashier_name=cashier_name,
            status=OrderStatus.COMPLETED,
            payment_method=data.payment_method,
            payment_status=PaymentStatus.PAID,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total=total,
            amount_paid=amount_paid,
            change_given=change_given,
            mpesa_ref=data.mpesa_ref,
            mpesa_amount=data.mpesa_amount,
            cash_amount=data.cash_amount,
            credit_customer_name=data.credit_customer_name,
            credit_customer_phone=data.credit_customer_phone,
            notes=data.notes,
            items=order_items,
        )
        self.session.add(order)
        await self.session.flush()
        await self.session.refresh(order)
        return order

    async def void_order(
        self,
        order: Order,
        actor_id: int,
        actor_name: str,
        data: OrderVoid,
    ) -> Order:
        if order.status == OrderStatus.VOIDED:
            raise HTTPException(status_code=400, detail="Order is already voided")

        # Restore inventory for each item
        for item in order.items:
            if item.product_id:
                product = await self.product_repo.get(item.product_id)
                if product and product.track_inventory:
                    inv = await self.inventory_repo.get_by_product_branch(
                        item.product_id, order.branch_id
                    )
                    if inv is None:
                        inv = await self.inventory_repo.get_by_product_branch(
                            item.product_id, None
                        )
                    if inv is not None:
                        await self.inventory_repo.adjust(
                            inv,
                            item.quantity,  # add back
                            TransactionType.RETURN,
                            actor_id,
                            f"Void order {order.order_number}",
                        )

        order.status = OrderStatus.VOIDED
        order.payment_status = PaymentStatus.REFUNDED
        order.voided_by = actor_id
        order.voided_at = datetime.now(timezone.utc)
        order.void_reason = data.reason

        audit = AuditLog(
            org_id=order.org_id,
            user_id=actor_id,
            user_name=actor_name,
            action="order.voided",
            entity_type="order",
            entity_id=order.id,
            entity_name=order.order_number,
            details={
                "reason": data.reason,
                "total": float(order.total),
                "payment_method": order.payment_method.value,
                "items": [
                    {"name": i.product_name, "qty": i.quantity, "price": float(i.unit_price)}
                    for i in order.items
                ],
            },
        )
        self.session.add(audit)
        await self.session.flush()
        return order

    async def edit_order(
        self,
        order: Order,
        actor_id: int,
        actor_name: str,
        data: OrderEdit,
    ) -> Order:
        if order.status == OrderStatus.VOIDED:
            raise HTTPException(status_code=400, detail="Cannot edit a voided order")

        # Build lookup of existing items by product_id
        old_items = {i.product_id: i for i in order.items if i.product_id}
        new_items = {i.product_id: i for i in data.items if i.product_id}

        # Restore inventory for items removed or reduced
        for pid, old in old_items.items():
            new = new_items.get(pid)
            delta = old.quantity - (new.quantity if new else 0)
            if delta > 0:
                product = await self.product_repo.get(pid)
                if product and product.track_inventory:
                    inv = await self.inventory_repo.get_by_product_branch(pid, order.branch_id)
                    if inv is None:
                        inv = await self.inventory_repo.get_by_product_branch(pid, None)
                    if inv is not None:
                        await self.inventory_repo.adjust(
                            inv, delta, TransactionType.RETURN, actor_id,
                            f"Edit order {order.order_number} — item reduced",
                        )

        # Deduct inventory for items added or increased
        for pid, new in new_items.items():
            old = old_items.get(pid)
            delta = new.quantity - (old.quantity if old else 0)
            if delta > 0:
                product = await self.product_repo.get(pid)
                if product and product.track_inventory:
                    inv = await self.inventory_repo.get_by_product_branch(pid, order.branch_id)
                    if inv is None:
                        inv = await self.inventory_repo.get_by_product_branch(pid, None)
                    if inv is not None:
                        if inv.available_quantity < delta:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Insufficient stock for '{new.product_name}'",
                            )
                        await self.inventory_repo.adjust(
                            inv, -delta, TransactionType.SALE, actor_id,
                            f"Edit order {order.order_number} — item added/increased",
                        )

        # Save snapshot for audit
        old_snapshot = {
            "total": float(order.total),
            "items": [
                {"name": i.product_name, "qty": i.quantity, "price": float(i.unit_price)}
                for i in order.items
            ],
        }

        # Replace order items
        for item in list(order.items):
            await self.session.delete(item)
        await self.session.flush()

        subtotal = 0.0
        new_order_items = []
        for item_data in data.items:
            item_total = round(
                (item_data.unit_price * item_data.quantity) - item_data.discount_amount, 2
            )
            subtotal += item_total
            new_order_items.append(OrderItem(
                order_id=order.id,
                product_id=item_data.product_id,
                product_name=item_data.product_name,
                product_sku=item_data.product_sku,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                discount_amount=item_data.discount_amount,
                total=item_total,
            ))
            self.session.add(new_order_items[-1])

        subtotal = round(subtotal, 2)
        discount_amount = round(data.discount_amount, 2)
        total = round(subtotal - discount_amount, 2)

        order.subtotal = subtotal
        order.discount_amount = discount_amount
        order.total = total
        order.notes = data.notes if data.notes is not None else order.notes
        order.edited_by = actor_id
        order.edited_at = datetime.now(timezone.utc)

        audit = AuditLog(
            org_id=order.org_id,
            user_id=actor_id,
            user_name=actor_name,
            action="order.edited",
            entity_type="order",
            entity_id=order.id,
            entity_name=order.order_number,
            details={
                "before": old_snapshot,
                "after": {
                    "total": total,
                    "items": [
                        {"name": i.product_name, "qty": i.quantity, "price": float(i.unit_price)}
                        for i in new_order_items
                    ],
                },
            },
        )
        self.session.add(audit)
        await self.session.flush()
        return order
